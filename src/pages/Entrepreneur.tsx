import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Truck, LogOut, Loader2 } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";
import { useUserRoles } from "@/hooks/useUserRole";

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
  postal_prefix: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
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
  const [selected, setSelected] = useState<EntLead | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session?.user) navigate("/login");
      setAuthReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/login");
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!authReady || roleLoading) return;
    if (!isEntrepreneur && !isAdmin) return;
    fetchLeads();
  }, [authReady, roleLoading, isEntrepreneur, isAdmin]);

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
    const map = L.map(containerRef.current).setView([46.8, -71.2], 8);
    mapRef.current = map;
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
        .on("click", () => setSelected(l)).addTo(map);
      markers.push(m);
    });
    if (markers.length > 0) {
      map.fitBounds(L.latLngBounds(markers.map((m) => m.getLatLng())), { padding: [40, 40], maxZoom: 11 });
    }
    return () => { map.remove(); mapRef.current = null; };
  }, [leads]);

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  if (!authReady || roleLoading) return null;
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
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
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
          <h1 className="text-2xl font-display font-bold">Leads disponibles ({leads.length})</h1>
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
            <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
              <div ref={containerRef} style={{ height: "60vh", minHeight: 400, width: "100%" }} />
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {leads.length === 0 && <p className="text-sm text-muted-foreground">Aucun lead pour le moment.</p>}
              {leads.map((l) => (
                <button key={l.id} onClick={() => setSelected(l)}
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

      {selected && (
        <div className="fixed inset-0 z-[100] bg-foreground/50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-background rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-lg">Lead #{selected.submission_number}</h3>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="space-y-2 text-sm font-body">
              <p><b>Type :</b> {selected.request_type}</p>
              <p><b>Matériaux :</b> {matLabels(selected.materials)}</p>
              {selected.other_material && <p><b>Autre :</b> {selected.other_material}</p>}
              <p><b>Projet :</b> {selected.property_type}</p>
              <p><b>Taille :</b> {selected.quantity}</p>
              {selected.tonnage && <p><b>Tonnage :</b> {selected.tonnage}</p>}
              {selected.deliver_or_remove && <p><b>Livraison :</b> {selected.deliver_or_remove}</p>}
              {selected.contamination && <p><b>Contamination :</b> {selected.contamination}</p>}
              <p><b>Secteur :</b> {selected.postal_prefix}</p>
              <p><b>Statut :</b> {selected.is_assigned ? "Attribué" : selected.status}</p>
              {selected.description && <p className="pt-2 border-t border-border"><b>Notes :</b> {selected.description}</p>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-4 italic">
              Coordonnées du client masquées. Contactez l'admin pour obtenir les détails de contact.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const Legend = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1">
    <span className="w-3 h-3 rounded-full" style={{ background: color }} />
    <span>{label}</span>
  </div>
);

export default Entrepreneur;