import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Phone, MapPin, Info, Clock, ShieldCheck,
  Maximize2, Minimize2, Search, SlidersHorizontal, X, Layers,
} from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import FullPageState from "@/components/FullPageState";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MATERIAL_COLORS,
  MATERIAL_LEGEND,
  materialKeyForId,
  type MaterialColorKey,
} from "@/lib/material-colors";

const MARKER_COLOR = MATERIAL_COLORS.remblai.color; // green markers for all dump points
const PHONE_PRIMARY = "5819947717";

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
  availability_status?: string | null;
  availability_note?: string | null;
  availability_updated_at?: string | null;
}

/** Point 42 — fraîcheur de la donnée de disponibilité (jamais inventée). */
const freshnessLabel = (iso?: string | null) => {
  if (!iso) return "Disponibilité à confirmer";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Mis à jour aujourd'hui";
  if (days === 1) return "Mis à jour hier";
  if (days <= 7) return `Mis à jour il y a ${days} jours`;
  return "À confirmer";
};

const AVAIL_META: Record<string, { label: string; color: string; dot: string }> = {
  available: { label: "Disponible", color: "#16a34a", dot: "🟢" },
  limited: { label: "Capacité limitée", color: "#ca8a04", dot: "🟡" },
  unavailable: { label: "Indisponible", color: "#dc2626", dot: "🔴" },
};
const availMeta = (v?: string | null) => AVAIL_META[v || "available"] || AVAIL_META.available;

const accessText = (l: EntLead) => (l.accessibility || []).join(" ").toLowerCase();
const hasBigVolume = (l: EntLead) => /gros|grand|illimit|vrac|volume/.test(`${l.quantity} ${l.tonnage}`.toLowerCase());
const has12Roues = (l: EntLead) => /12\s*roue|douze roue|camion/.test(accessText(l));
const hasSemi = (l: EntLead) => /semi|remorque|fardier|train routier/.test(accessText(l));

const dompeLabel = (l: EntLead) =>
  (l.dompe_number && l.dompe_number.replace(/^dompe\s*/i, "").trim()) || String(l.submission_number);

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
  const [query, setQuery] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyBigVolume, setOnlyBigVolume] = useState(false);
  const [only12, setOnly12] = useState(false);
  const [onlySemi, setOnlySemi] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<EntLead | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (activeFilters.size > 0 && !leadMaterialKeys(l).some((k) => activeFilters.has(k))) return false;
      if (onlyAvailable && (l.availability_status || "available") !== "available") return false;
      if (onlyBigVolume && !hasBigVolume(l)) return false;
      if (only12 && !has12Roues(l)) return false;
      if (onlySemi && !hasSemi(l)) return false;
      if (q) {
        const hay = `${dompeLabel(l)} ${l.postal_prefix ?? ""} ${(l.materials || []).join(" ")} ${l.request_type ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, activeFilters, query, onlyAvailable, onlyBigVolume, only12, onlySemi]);

  const activeCount =
    activeFilters.size + [onlyAvailable, onlyBigVolume, only12, onlySemi].filter(Boolean).length + (query ? 1 : 0);

  const resetFilters = () => {
    setActiveFilters(new Set());
    setOnlyAvailable(false); setOnlyBigVolume(false); setOnly12(false); setOnlySemi(false);
    setQuery("");
  };

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
      .channel(`ent-submissions-` + Math.random().toString(36).slice(2))
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
          gestureHandling: "greedy",
        });
        infoRef.current = new g.maps.InfoWindow();
      }
      Object.values(markersRef.current).forEach((m) => m.setMap(null));
      markersRef.current = {};

      const bounds = new g.maps.LatLngBounds();
      geo.forEach((l) => {
        const av = availMeta(l.availability_status);
        const color = l.availability_status === "unavailable"
          ? "#9ca3af"
          : l.availability_status === "limited"
            ? "#ca8a04"
            : MARKER_COLOR;
        const label = dompeLabel(l);
        const fontSize = label.length <= 3 ? 12 : label.length <= 5 ? 10 : 9;
        const width = Math.max(30, 12 + label.length * 7);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30" viewBox="0 0 ${width} 30"><rect x="1" y="1" width="${width - 2}" height="28" rx="14" fill="${color}" stroke="white" stroke-width="3"/><text x="${width / 2}" y="15" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="${fontSize}" fill="white">${label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`;
        const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
        const pos = { lat: l.latitude!, lng: l.longitude! };
        const m = new g.maps.Marker({
          map: mapRef.current!,
          position: pos,
          opacity: l.availability_status === "unavailable" ? 0.6 : 1,
          title: `${av.dot} ${av.label}`,
          icon: {
            url,
            scaledSize: new g.maps.Size(width, 30),
            anchor: new g.maps.Point(width / 2, 15),
          },
        });
        m.addListener("click", () => {
          setSelectedId(l.id);
          setDetail(l);
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
    setSelectedId(l.id);
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

  const filterChip = (active: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-body border transition-colors ${
        active
          ? "bg-foreground text-background border-transparent"
          : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <EntrepreneurAppShell
      title="Trouver une dompe"
      subtitle="Réseau de sites Vrac Québec"
      backTo="/entrepreneur"
    >
      <div className="w-full min-w-0 px-4 sm:px-6 py-5 space-y-5">
        {/* Carte d'intention : une seule action principale */}
        <section className="rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-5">
          <p className="font-body text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Accès aux dompes
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold leading-tight sm:text-2xl">
            Repérez un site, nous coordonnons l'accès.
          </h2>
          <p className="mt-1.5 font-body text-sm text-muted-foreground">
            Ne vous présentez jamais sans autorisation : Vrac Québec valide la disponibilité et vous
            transmet les consignes.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              onClick={() => navigate("/demande-transport")}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-display text-sm font-bold text-primary-foreground active:scale-95 transition-transform"
            >
              Demander l'accès
            </button>
            <button
              onClick={() => navigate("/entrepreneur/comparateur")}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 font-body text-sm active:scale-95 transition-transform"
            >
              <Layers className="h-4 w-4" /> Comparer les sites
            </button>
            <a
              href={`tel:${PHONE_PRIMARY}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 font-body text-sm active:scale-95 transition-transform"
            >
              <Phone className="h-4 w-4" /> Appeler
            </a>
          </div>
          <p className="mt-3 flex items-center gap-1.5 font-body text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Réponse en moins de 30 minutes durant les heures
            d'ouverture.
          </p>
        </section>


        {/* Filtres */}
        <section className="relative z-20 lg:sticky lg:top-[73px] -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="rounded-2xl border border-border/70 bg-background/90 backdrop-blur-xl p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher une dompe, un secteur, un matériau"
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm font-body outline-none focus:border-foreground/30"
                />
              </div>
              {filterChip(onlyAvailable, "Disponible aujourd'hui", () => setOnlyAvailable((v) => !v))}
              {filterChip(onlyBigVolume, "Gros volumes", () => setOnlyBigVolume((v) => !v))}
              {filterChip(only12, "Accessible 12 roues", () => setOnly12((v) => !v))}
              {filterChip(onlySemi, "Accessible semi-remorque", () => setOnlySemi((v) => !v))}
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body border border-border hover:border-foreground/30"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Matériaux
              </button>
              {activeCount > 0 && (
                <button onClick={resetFilters} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-body">
                  <X className="w-3.5 h-3.5" /> Réinitialiser
                </button>
              )}
            </div>
            {showFilters && (
              <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-1.5">
                {MATERIAL_LEGEND.map((k) => {
                  const active = activeFilters.has(k);
                  const c = MATERIAL_COLORS[k];
                  return (
                    <button
                      key={k}
                      onClick={() => toggleFilter(k)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body border transition-all ${
                        active ? "border-transparent text-white" : "bg-background text-foreground border-border hover:border-foreground/30"
                      }`}
                      style={active ? { background: c.color } : undefined}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: active ? "rgba(255,255,255,0.85)" : c.color }} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <section className={`grid gap-4 ${expanded ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-5"}`}>
            {/* Carte */}
            <div className={`${expanded ? "" : "lg:col-span-3"} relative isolate min-w-0 rounded-2xl border border-border/70 bg-card overflow-hidden`}>
              <div
                ref={containerRef}
                style={{ height: expanded ? "78vh" : "64vh", minHeight: 320, maxHeight: 900, width: "100%" }}
              />
              <button
                onClick={() => setExpanded((v) => !v)}
                className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-xl bg-background/95 border border-border px-3 py-2 text-xs font-body shadow-sm hover:border-foreground/30"
              >
                {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                {expanded ? "Réduire la carte" : "Agrandir la carte"}
              </button>
            </div>

            {/* Liste */}
            <div className={`${expanded ? "" : "lg:col-span-2"} min-w-0 space-y-3`}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-display font-bold text-base">
                  {filteredLeads.length} dompe{filteredLeads.length > 1 ? "s" : ""} disponible{filteredLeads.length > 1 ? "s" : ""}
                </h2>
                {activeCount > 0 && <span className="text-xs text-muted-foreground font-body">sur {leads.length}</span>}
              </div>
              <div className={`space-y-3 ${expanded ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 space-y-0" : "lg:max-h-[58vh] lg:overflow-auto lg:pr-1"}`}>
                {filteredLeads.length === 0 && (
                  <p className="text-sm text-muted-foreground font-body">
                    {leads.length === 0 ? "Aucune dompe pour le moment." : "Aucune dompe ne correspond à vos filtres."}
                  </p>
                )}
                {filteredLeads.map((l) => {
                  const av = availMeta(l.availability_status);
                  const keys = leadMaterialKeys(l);
                  const selected = selectedId === l.id;
                  return (
                    <article
                      key={l.id}
                      onMouseEnter={() => setSelectedId(l.id)}
                      className={`rounded-2xl border bg-card overflow-hidden transition-all ${
                        selected ? "border-primary/60 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.35)]" : "border-border/70 hover:border-foreground/20"
                      }`}
                    >
                      <button onClick={() => focusLead(l)} className="w-full text-left">
                        <div
                          className="h-24 w-full relative"
                          style={{ background: `linear-gradient(135deg, ${MATERIAL_COLORS[keys[0] ?? "remblai"].color}22, hsl(var(--secondary)))` }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center opacity-30">
                            <Layers className="w-10 h-10" />
                          </div>
                          <span
                            className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 text-[11px] font-body px-2.5 py-1 rounded-full bg-background/90 border border-border"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: av.color }} /> {av.label}
                          </span>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-display font-bold text-sm">Dompe #{dompeLabel(l)}</h3>
                            <span className="text-[11px] text-muted-foreground font-body whitespace-nowrap">{l.quantity || "—"}</span>
                          </div>
                          <p className="text-xs text-muted-foreground font-body flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" /> Secteur {l.postal_prefix || "—"}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {keys.slice(0, 3).map((k) => (
                              <span key={k} className="text-[10px] font-body px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                {MATERIAL_COLORS[k].label}
                              </span>
                            ))}
                            {keys.length > 3 && (
                              <span className="text-[10px] font-body px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                +{keys.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="px-4 pb-4 flex items-center gap-2">
                        <button
                          onClick={() => setDetail(l)}
                          className="flex-1 rounded-xl border border-border bg-background text-xs font-body py-2.5 hover:border-foreground/30 transition-colors"
                        >
                          Voir la fiche complète
                        </button>
                        <button
                          onClick={() => navigate("/demande-transport")}
                          className="flex-1 rounded-xl bg-primary text-primary-foreground text-xs font-display font-semibold py-2.5 hover:opacity-90 transition-opacity"
                        >
                          Faire une demande d'accès
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Fiche complète */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Dompe #{dompeLabel(detail)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-body px-2.5 py-1 rounded-full bg-secondary"
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: availMeta(detail.availability_status).color }} />
                  {availMeta(detail.availability_status).label}
                  {detail.availability_note ? ` — ${detail.availability_note}` : ""}
                </span>
                <span className="ml-2 text-[11px] font-body text-muted-foreground">
                  {freshnessLabel(detail.availability_updated_at)}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {leadMaterialKeys(detail).map((k) => (
                    <span key={k} className="text-[11px] font-body px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                      {MATERIAL_COLORS[k].label}
                    </span>
                  ))}
                </div>
                <dl className="text-sm font-body divide-y divide-border/60 rounded-xl border border-border/70">
                  <Row label="Secteur" value={detail.postal_prefix || "—"} />
                  <Row label="Type" value={detail.request_type || "—"} />
                  <Row label="Volume estimé" value={detail.tonnage || detail.quantity || "—"} />
                  <Row label="Accessibilité" value={(detail.accessibility || []).join(", ") || "—"} />
                  <Row
                    label="Accès camion lourd"
                    value={(detail as { access_heavy_truck?: string | null }).access_heavy_truck || "À confirmer"}
                  />
                  <Row
                    label="Machinerie sur place"
                    value={detail.machinery_available ? (detail.machinery_description || "Oui") : "Non"}
                  />
                  <Row label="Temps de réponse moyen" value="Moins de 30 minutes" />
                </dl>
                <div className="rounded-xl bg-secondary/50 border border-border/60 p-3 text-xs text-muted-foreground font-body flex gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  Vrac Québec coordonne votre accès et vous transmet les consignes après confirmation.
                </div>
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={() => { setDetail(null); navigate("/demande-transport"); }}
                    className="flex-1 rounded-xl bg-primary text-primary-foreground font-display font-semibold text-sm py-3 hover:opacity-90 transition-opacity"
                  >
                    Faire une demande d'accès
                  </button>
                  <a
                    href={`tel:${PHONE_PRIMARY}`}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border text-sm font-body py-3 hover:border-foreground/30 transition-colors"
                  >
                    <Phone className="w-4 h-4" /> Téléphoner
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </EntrepreneurAppShell>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-4 px-3 py-2.5">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-right text-foreground">{value}</dd>
  </div>
);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const buildPopupHtml = (l: EntLead) => {
  const av = availMeta(l.availability_status);
  const matKeys = Array.from(new Set((l.materials || []).map(materialKeyForId)));
  const matBadges = matKeys
    .map((k) => `<span class="ent-pop-mat" style="background:${MATERIAL_COLORS[k].color}">${escapeHtml(MATERIAL_COLORS[k].label)}</span>`)
    .join("");
  return `
    <div class="ent-pop-title">
      <span>Dompe #${escapeHtml(dompeLabel(l))}</span>
      <span class="ent-pop-badge" style="background:${av.color}">${escapeHtml(av.label)}</span>
    </div>
    <div class="ent-pop-row"><b>Matériaux :</b><div class="ent-pop-mats">${matBadges || "—"}</div></div>
    <div class="ent-pop-row"><b>Secteur :</b> ${escapeHtml(l.postal_prefix || "—")}</div>
    <div class="ent-pop-row"><b>Volume estimé :</b> ${escapeHtml(l.tonnage || l.quantity || "—")}</div>
  `;
};

export default Entrepreneur;
