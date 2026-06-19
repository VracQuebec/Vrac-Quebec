import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Truck, LogOut, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import TransportBanner from "@/components/TransportBanner";
import FullPageState from "@/components/FullPageState";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import {
  MATERIAL_COLORS,
  MATERIAL_LEGEND,
  materialKeyForId,
  type MaterialColorKey,
} from "@/lib/material-colors";

const MARKER_COLOR = MATERIAL_COLORS.remblai.color; // green markers for all dump points

interface EntLead {
  id: string;
  submission_number: number;
  dompe_number?: string | null;
  materials: string[];
  other_material: string | null;
  request_type: string;
  property_type: string;
  quantity: string;
  tonnage: string;
  deliver_or_remove: string | null;
  contamination: string | null;
  status: string;
  priority: string;
  postal_prefix: string;
  latitude: number | null;
  longitude: number | null;
  machinery_available: boolean | null;
  machinery_description: string | null;
  accessibility: string[] | null;
  created_at: string;
  is_assigned: boolean;
}

const Entrepreneur = () => {
  const [leads, setLeads] = useState<EntLead[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<google.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const navigate = useNavigate();
  const { user, isReady: authReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const [activeFilters, setActiveFilters] = useState<Set<MaterialColorKey>>(new Set());

  const toggleFilter = (k: MaterialColorKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const leadMaterialKeys = (l: EntLead): MaterialColorKey[] => {
    const keys = new Set<MaterialColorKey>((l.materials || []).map(materialKeyForId));
    const rt = (l.request_type || "").toLowerCase();
    if (rt.includes("remblai") || rt.includes("depot") || rt.includes("dépôt")) keys.add("remblai");
    return Array.from(keys);
  };

  const filteredLeads = activeFilters.size === 0
    ? leads
    : leads.filter((l) => leadMaterialKeys(l).some((k) => activeFilters.has(k)));

  useEffect(() => {
    if (!authReady) return;
    if (!user) navigate("/login", { replace: true });
  }, [authReady, user, navigate]);

  useEffect(() => {
    if (!authReady || roleLoading) return;
    if (!isEntrepreneur && !isAdmin) return;
    fetchLeads();
  }, [authReady, roleLoading, isEntrepreneur, isAdmin]);

  // Realtime: refresh leads when admin changes visibility/status
  useEffect(() => {
    if (!isEntrepreneur && !isAdmin) return;
    const channel = supabase
      .channel("ent-submissions")
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isEntrepreneur, isAdmin]);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_entrepreneur_leads");
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else setLeads((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const geo = filteredLeads.filter((l) => l.latitude && l.longitude);

    loadGoogleMaps().then((g) => {
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = new g.maps.Map(containerRef.current, {
          center: { lat: 46.8, lng: -71.2 },
          zoom: 8,
          mapTypeControl: false,
          streetViewControl: false,
          scrollwheel: false,
        });
        infoRef.current = new g.maps.InfoWindow();
      }
      Object.values(markersRef.current).forEach((m) => m.setMap(null));
      markersRef.current = {};

      const bounds = new g.maps.LatLngBounds();
      geo.forEach((l) => {
        const color = MARKER_COLOR;
        const label = (() => {
          if (l.dompe_number) {
            const cleaned = l.dompe_number.replace(/^dompe\s*/i, "").trim();
            if (cleaned) return cleaned;
          }
          return String(l.submission_number);
        })();
        const fontSize = label.length <= 3 ? 12 : label.length <= 5 ? 10 : 9;
        const width = Math.max(30, 12 + label.length * 7);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30" viewBox="0 0 ${width} 30"><rect x="1" y="1" width="${width - 2}" height="28" rx="14" fill="${color}" stroke="white" stroke-width="3"/><text x="${width / 2}" y="15" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="${fontSize}" fill="white">${label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`;
        const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
        const pos = { lat: l.latitude!, lng: l.longitude! };
        const m = new g.maps.Marker({
          map: mapRef.current!,
          position: pos,
          icon: {
            url,
            scaledSize: new g.maps.Size(width, 30),
            anchor: new g.maps.Point(width / 2, 15),
          },
        });
        m.addListener("click", () => {
          infoRef.current?.setContent(buildPopupHtml(l));
          infoRef.current?.open({ anchor: m, map: mapRef.current! });
        });
        markersRef.current[l.id] = m;
        bounds.extend(pos);
      });
      if (Object.keys(markersRef.current).length > 0) {
        mapRef.current!.fitBounds(bounds, 40);
      }
    }).catch((e) => {
      console.error("Google Maps load error:", e);
    });

    return () => { cancelled = true; };
  }, [filteredLeads]);

  const focusLead = (l: EntLead) => {
    const m = markersRef.current[l.id];
    if (m && mapRef.current) {
      const pos = m.getPosition();
      if (pos) {
        mapRef.current.panTo(pos);
        if ((mapRef.current.getZoom() ?? 8) < 11) mapRef.current.setZoom(11);
      }
      infoRef.current?.setContent(buildPopupHtml(l));
      infoRef.current?.open({ anchor: m, map: mapRef.current });
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  if (!authReady || !user || roleLoading) {
    return <FullPageState title="Connexion en cours" message="Votre espace entrepreneur se charge automatiquement." />;
  }
  if (!isEntrepreneur && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted-foreground mb-4">Accès réservé aux entrepreneurs autorisés.</p>
          <button onClick={handleLogout} className="text-primary underline">Se déconnecter</button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="sticky top-0 z-[1000] bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">Vrac<span className="text-primary">Québec</span></span>
            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-700 font-display font-semibold">Entrepreneur</span>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </nav>

      <TransportBanner />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6">
        <section className="mb-6 bg-card border border-border rounded-xl p-4 sm:p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <h2 className="font-display font-bold text-lg sm:text-xl mb-3 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> Comment accéder à une dompe
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[
              { n: 1, t: "Choisissez une dompe", d: "Sélectionnez la dompe qui vous intéresse parmi les sites disponibles." },
              { n: 2, t: "Appelez Transport JSC", d: "📞 581-994-7717 — indiquez le n° de dompe, le matériel, la quantité, la date et votre entreprise." },
              { n: 3, t: "Attendez la validation", d: "Transport JSC confirme avec le propriétaire la disponibilité, les matériaux et les quantités." },
              { n: 4, t: "Recevez votre confirmation", d: "Une fois approuvé, vous recevrez l'accès et les consignes du site." },
            ].map((s) => (
              <li key={s.n} className="flex gap-3 p-3 rounded-lg bg-background border border-border">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground font-display font-bold flex items-center justify-center">{s.n}</span>
                <div>
                  <p className="font-display font-semibold text-sm">{s.t}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="rounded-lg border-2 border-destructive/50 bg-destructive/10 p-3 mb-4">
            <div className="flex items-start gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
              <p className="font-display font-bold text-sm text-destructive">Important</p>
            </div>
            <ul className="text-xs sm:text-sm text-foreground space-y-1 ml-7 list-disc">
              <li>Ne contactez <b>jamais</b> directement le propriétaire.</li>
              <li>Ne vous présentez <b>jamais</b> sur le site sans autorisation.</li>
              <li>Toute demande doit obligatoirement passer par Transport JSC.</li>
            </ul>
          </div>
          <a
            href="tel:5819947717"
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-display font-bold text-base sm:text-lg py-4 rounded-xl hover:opacity-90 transition-opacity"
          >
            <Phone className="w-5 h-5" /> Appeler Transport JSC — 581-994-7717
          </a>
        </section>

        <div className="mb-4 space-y-3">
          <h1 className="text-xl sm:text-2xl font-display font-bold">
            Dompes disponibles ({filteredLeads.length}{activeFilters.size > 0 ? ` / ${leads.length}` : ""})
          </h1>
          <div className="bg-card border border-border rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-muted-foreground font-display font-semibold uppercase tracking-wide text-[10px]">
                Filtrer par matériau
              </span>
              {activeFilters.size > 0 && (
                <button
                  onClick={() => setActiveFilters(new Set())}
                  className="text-[10px] text-primary hover:underline font-display"
                >
                  Réinitialiser
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MATERIAL_LEGEND.map((k) => {
                const active = activeFilters.has(k);
                const c = MATERIAL_COLORS[k];
                return (
                  <button
                    key={k}
                    onClick={() => toggleFilter(k)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-body border transition-all ${
                      active
                        ? "text-white border-transparent shadow-sm"
                        : "bg-background text-foreground border-border hover:border-primary/40"
                    }`}
                    style={active ? { background: c.color } : undefined}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: active ? "rgba(255,255,255,0.85)" : c.color }}
                    />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden relative isolate" style={{ boxShadow: "var(--shadow-sm)" }}>
              <div ref={containerRef} style={{ height: "60vh", minHeight: 400, width: "100%" }} />
            </div>
            <div className="space-y-2 lg:max-h-[60vh] lg:overflow-auto">
              {filteredLeads.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {leads.length === 0 ? "Aucune dompe pour le moment." : "Aucune dompe ne correspond aux filtres."}
                </p>
              )}
              {filteredLeads.map((l) => (
                <div key={l.id} className="p-3 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors">
                  <button onClick={() => focusLead(l)} className="w-full text-left">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="font-display font-bold text-sm">#{(l.dompe_number && l.dompe_number.trim()) || l.submission_number}</span>
                      <span className="text-[10px] text-muted-foreground font-body">{l.quantity}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {leadMaterialKeys(l).map((k) => (
                        <span
                          key={k}
                          className="text-[10px] uppercase font-display font-bold px-1.5 py-0.5 rounded text-white"
                          style={{ background: MATERIAL_COLORS[k].color }}
                        >
                          {MATERIAL_COLORS[k].label}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Secteur: {l.postal_prefix || "—"}</p>
                  </button>
                  <a
                    href={`tel:5819947717`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-display font-bold text-xs py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                    aria-label={`Demander l'accès à la dompe ${(l.dompe_number && l.dompe_number.trim()) || l.submission_number}`}
                  >
                    <Phone className="w-3.5 h-3.5" /> Demander l'accès — 581-994-7717
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const buildPopupHtml = (l: EntLead) => {
  const statusLabel = l.is_assigned ? "Attribué" : l.status;
  const acc = l.accessibility && l.accessibility.length > 0 ? escapeHtml(l.accessibility.join(", ")) : "—";
  const mach = l.machinery_available
    ? `Oui${l.machinery_description ? ` — ${escapeHtml(l.machinery_description)}` : ""}`
    : "Non";
  const voyages = escapeHtml(l.tonnage || l.quantity || "—");
  const matKeys = Array.from(new Set((l.materials || []).map(materialKeyForId)));
  const matBadges = matKeys
    .map((k) => `<span class="ent-pop-mat" style="background:${MATERIAL_COLORS[k].color}">${escapeHtml(MATERIAL_COLORS[k].label)}</span>`)
    .join("");
  return `
    <div class="ent-pop-title">
      <span>Dompe #${escapeHtml((l.dompe_number && l.dompe_number.trim()) || String(l.submission_number))}</span>
      <span class="ent-pop-badge" style="background:${MARKER_COLOR}">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="ent-pop-row"><b>Matériaux :</b><div class="ent-pop-mats">${matBadges || "—"}</div></div>
    <div class="ent-pop-row"><b>Type :</b> ${escapeHtml(l.request_type || "—")}</div>
    <div class="ent-pop-row"><b>Nombre de voyages :</b> ${voyages}</div>
    <div class="ent-pop-row"><b>Accessibilité :</b> ${acc}</div>
    <div class="ent-pop-row"><b>Machinerie sur place :</b> ${mach}</div>
    <div class="ent-pop-row"><b>Secteur :</b> ${escapeHtml(l.postal_prefix || "—")}</div>
  `;
};

export default Entrepreneur;