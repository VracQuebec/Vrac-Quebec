import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Truck, LogOut, Loader2 } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import FullPageState from "@/components/FullPageState";

interface EntLead {
  id: string;
  submission_number: number;
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

const colorForStatus = (status: string, isAssigned: boolean) => {
  if (status === "archivé") return "#94a3b8"; // gray
  if (isAssigned || status === "gagné") return "#16a34a"; // green
  if (status === "en attente" || status === "soumission envoyée") return "#2563eb"; // blue
  return "#f97316"; // orange = nouveau
};

const Entrepreneur = () => {
  const [leads, setLeads] = useState<EntLead[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const navigate = useNavigate();
  const { user, isReady: authReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, authReady);

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
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const geo = leads.filter((l) => l.latitude && l.longitude);
    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
    }).setView([46.8, -71.2], 8);
    mapRef.current = map;
    markersRef.current = {};
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const markers: L.Marker[] = [];
    geo.forEach((l) => {
      const color = colorForStatus(l.status, l.is_assigned);
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${color};color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${l.submission_number}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      const m = L.marker([l.latitude!, l.longitude!], { icon })
        .bindPopup(buildPopupHtml(l, color), {
          maxWidth: 320,
          minWidth: 220,
          autoPan: true,
          autoPanPadding: [20, 20],
          closeButton: true,
        })
        .addTo(map);
      markersRef.current[l.id] = m;
      markers.push(m);
    });
    if (markers.length > 0) {
      map.fitBounds(L.latLngBounds(markers.map((m) => m.getLatLng())), { padding: [40, 40], maxZoom: 11 });
    }
    return () => { map.remove(); mapRef.current = null; };
  }, [leads]);

  const focusLead = (l: EntLead) => {
    const m = markersRef.current[l.id];
    if (m && mapRef.current) {
      mapRef.current.setView(m.getLatLng(), Math.max(mapRef.current.getZoom(), 11), { animate: true });
      m.openPopup();
      // Scroll map into view on mobile
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

  const matLabels = (ids: string[]) => ids.map((i) => MATERIAL_TYPES.find((m) => m.id === i)?.label || i).join(", ");

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

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-2xl font-display font-bold">Dompes disponibles ({leads.length})</h1>
          <div className="flex items-center gap-3 text-xs font-body">
            <Legend color="#f97316" label="Nouveau" />
            <Legend color="#2563eb" label="En attente" />
            <Legend color="#16a34a" label="Attribué" />
            <Legend color="#94a3b8" label="Archivé" />
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
              {leads.length === 0 && <p className="text-sm text-muted-foreground">Aucune dompe pour le moment.</p>}
              {leads.map((l) => (
                <button key={l.id} onClick={() => focusLead(l)}
                  className="w-full text-left p-3 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-bold text-sm">#{l.submission_number}</span>
                    <span className="text-[10px] uppercase font-display font-bold px-2 py-0.5 rounded text-white"
                      style={{ background: colorForStatus(l.status, l.is_assigned) }}>{l.is_assigned ? "Attribué" : l.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{matLabels(l.materials)} • {l.quantity}</p>
                  <p className="text-xs text-muted-foreground">Secteur: {l.postal_prefix || "—"}</p>
                </button>
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

const matLabelsHtml = (ids: string[]) =>
  escapeHtml(ids.map((i) => MATERIAL_TYPES.find((m) => m.id === i)?.label || i).join(", "));

const buildPopupHtml = (l: EntLead, color: string) => {
  const statusLabel = l.is_assigned ? "Attribué" : l.status;
  const acc = l.accessibility && l.accessibility.length > 0 ? escapeHtml(l.accessibility.join(", ")) : "—";
  const mach = l.machinery_available
    ? `Oui${l.machinery_description ? ` — ${escapeHtml(l.machinery_description)}` : ""}`
    : "Non";
  const voyages = escapeHtml(l.tonnage || l.quantity || "—");
  return `
    <div class="ent-pop-title">
      <span>Dompe #${l.submission_number}</span>
      <span class="ent-pop-badge" style="background:${color}">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="ent-pop-row"><b>Type :</b> ${escapeHtml(l.request_type || "—")}</div>
    <div class="ent-pop-row"><b>Matériaux :</b> ${matLabelsHtml(l.materials)}</div>
    <div class="ent-pop-row"><b>Nombre de voyages :</b> ${voyages}</div>
    <div class="ent-pop-row"><b>Accessibilité :</b> ${acc}</div>
    <div class="ent-pop-row"><b>Machinerie sur place :</b> ${mach}</div>
    <div class="ent-pop-row"><b>Secteur :</b> ${escapeHtml(l.postal_prefix || "—")}</div>
  `;
};

const Legend = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1">
    <span className="w-3 h-3 rounded-full" style={{ background: color }} />
    <span>{label}</span>
  </div>
);

export default Entrepreneur;