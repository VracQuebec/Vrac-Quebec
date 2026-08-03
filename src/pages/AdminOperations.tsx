import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Truck, Calendar as CalendarIcon, Map as MapIcon, ListChecks, Zap, ArrowLeft, RefreshCw, Play, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

type TripStatus =
  | "demande" | "soumission_envoyee" | "accepte" | "planifie" | "en_route"
  | "chargement" | "transport" | "livraison" | "termine" | "facture" | "paye" | "annule";

type Trip = {
  id: string;
  trip_number: string | null;
  status: TripStatus;
  scheduled_at: string | null;
  material: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  distance_km: number | null;
  cost: number | null;
  revenue: number | null;
  margin: number | null;
  client_id: string | null;
  carrier_id: string | null;
  truck_id: string | null;
  dump_id: string | null;
  entrepreneur_id: string | null;
  transport_request_id: string | null;
  notes: string | null;
};

const STATUS_ORDER: TripStatus[] = [
  "demande","soumission_envoyee","accepte","planifie","en_route",
  "chargement","transport","livraison","termine","facture","paye","annule",
];

const STATUS_LABELS: Record<TripStatus, string> = {
  demande: "Demandé", soumission_envoyee: "Soumission envoyée", accepte: "Accepté",
  planifie: "Planifié", en_route: "En route", chargement: "Chargement",
  transport: "Transport", livraison: "Livraison", termine: "Terminé",
  facture: "Facturé", paye: "Payé", annule: "Annulé",
};

const STATUS_COLORS: Record<TripStatus, string> = {
  demande: "bg-slate-500", soumission_envoyee: "bg-blue-500", accepte: "bg-cyan-500",
  planifie: "bg-indigo-500", en_route: "bg-amber-500", chargement: "bg-orange-500",
  transport: "bg-purple-500", livraison: "bg-pink-500", termine: "bg-primary",
  facture: "bg-emerald-500", paye: "bg-green-600", annule: "bg-red-500",
};

type Tab = "cockpit" | "dispatch" | "planning" | "trips" | "automations";

export default function AdminOperations() {
  const [tab, setTab] = useState<Tab>("cockpit");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrips = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("trips" as any).select("*").order("scheduled_at", { ascending: false }).limit(500);
    if (error) toast.error(error.message);
    setTrips((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadTrips(); }, []);

  // Realtime : un seul channel
  useEffect(() => {
    const ch = supabase
      .channel("ops-trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => loadTrips())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-[1500px] mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link to="/admin" className="p-2 rounded-lg hover:bg-secondary" title="Retour"><ArrowLeft className="w-4 h-4" /></Link>
          <h1 className="text-lg font-display font-bold text-foreground">Moteur opérationnel</h1>
          <span className="text-xs text-muted-foreground font-body">Vrac Québec OS · Répartition, planification, voyages temps réel</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={loadTrips} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm border border-border hover:opacity-90">
              <RefreshCw className="w-3.5 h-3.5" /> Actualiser
            </button>
          </div>
        </div>
        <nav className="max-w-[1500px] mx-auto px-4 flex gap-1 overflow-x-auto">
          {[
            { id: "cockpit", label: "Cockpit", icon: Zap },
            { id: "dispatch", label: "Répartition", icon: Truck },
            { id: "planning", label: "Planification", icon: CalendarIcon },
            { id: "trips", label: "Voyages", icon: ListChecks },
            { id: "automations", label: "Automatisations", icon: MapIcon },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id as Tab)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-display font-semibold border-b-2 ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-[1500px] mx-auto p-4">
        {loading && trips.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {tab === "cockpit" && <CockpitTab />}
            {tab === "dispatch" && <DispatchTab onApplied={loadTrips} />}
            {tab === "planning" && <PlanningTab trips={trips} />}
            {tab === "trips" && <TripsTab trips={trips} onChange={loadTrips} />}
            {tab === "automations" && <AutomationsTab />}
          </>
        )}
      </main>
    </div>
  );
}

/* ==================== COCKPIT ==================== */
function CockpitTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("ops_dashboard_stats" as any);
    if (error) toast.error(error.message);
    setStats(data);
    setLoading(false);
  };
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  if (loading || !stats) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const kpis = [
    { label: "Voyages actifs", value: stats.trips_active, sub: `${stats.trips_today} aujourd'hui` },
    { label: "Camions en route", value: stats.trucks_active, sub: `${stats.carriers_active} transporteurs 30j` },
    { label: "Voyages ce mois", value: stats.trips_month, sub: `${stats.trips_week} cette semaine` },
    { label: "Dompes actives", value: stats.dumps_active, sub: `${stats.clients_active} clients 30j` },
    { label: "Revenu du mois", value: `${Number(stats.revenue_month || 0).toLocaleString("fr-CA")} $`, sub: `Aujourd'hui : ${Number(stats.revenue_today || 0).toLocaleString("fr-CA")} $` },
    { label: "Marge du mois", value: `${Number(stats.margin_month || 0).toLocaleString("fr-CA")} $`, sub: "Revenu − coûts" },
    { label: "Durée moyenne", value: `${stats.avg_duration_min || 0} min`, sub: "Chargement → livraison" },
  ];

  return (
    <section>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card rounded-lg border border-border p-4">
            <div className="text-xs text-muted-foreground font-body">{k.label}</div>
            <div className="text-2xl font-display font-bold text-foreground mt-1">{k.value}</div>
            <div className="text-[11px] text-muted-foreground font-body mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-display font-bold mb-3 text-sm text-foreground">Matériaux les plus demandés (30j)</h3>
          {(stats.top_materials ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground font-body">Aucune donnée.</p>
          ) : (
            <ul className="space-y-1.5">
              {stats.top_materials.map((m: any) => (
                <li key={m.material} className="flex justify-between text-sm font-body">
                  <span className="text-foreground">{m.material}</span>
                  <span className="text-muted-foreground">{m.n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-display font-bold mb-3 text-sm text-foreground">Villes les plus actives (30j)</h3>
          {(stats.top_cities ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground font-body">Aucune donnée.</p>
          ) : (
            <ul className="space-y-1.5">
              {stats.top_cities.map((c: any) => (
                <li key={c.city} className="flex justify-between text-sm font-body">
                  <span className="text-foreground">{c.city}</span>
                  <span className="text-muted-foreground">{c.n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ==================== DISPATCH ==================== */
function DispatchTab({ onApplied }: { onApplied: () => void }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("transport_requests" as any)
      .select("id, request_number, client_name, site_city, material_type, quantity, quantity_unit, status, created_at")
      .in("status", ["nouvelle","a_rappeler","en_analyse","soumission_envoyee","en_attente_proprietaire","acceptee"])
      .order("created_at", { ascending: false })
      .limit(50);
    setRequests((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const generate = async (reqId: string) => {
    setGenerating(true);
    setSelected(reqId);
    setScenarios([]);
    const { data, error } = await supabase.rpc("dispatch_generate_scenarios" as any, { _request_id: reqId, _limit: 5 });
    if (error) toast.error(error.message);
    else {
      setScenarios((data as any) ?? []);
      if (!data || (data as any).length === 0) toast.info("Aucun scénario disponible (vérifie transporteurs, camions et dompes actives).");
    }
    setGenerating(false);
  };

  const apply = async (scenarioId: string) => {
    const { error } = await supabase.rpc("dispatch_apply_scenario" as any, { _scenario_id: scenarioId });
    if (error) return toast.error(error.message);
    toast.success("Voyage créé");
    setScenarios([]); setSelected(null);
    onApplied();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <section className="grid lg:grid-cols-2 gap-4">
      <div className="bg-card rounded-lg border border-border">
        <div className="p-3 border-b border-border font-display font-bold text-sm">Demandes à répartir ({requests.length})</div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
          {requests.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground font-body">Aucune demande à répartir.</div>}
          {requests.map((r) => (
            <button key={r.id} onClick={() => generate(r.id)}
              className={`w-full text-left p-3 hover:bg-secondary/50 ${selected === r.id ? "bg-secondary/60" : ""}`}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-display font-semibold text-sm text-foreground">{r.request_number || "—"} · {r.client_name || "Client"}</div>
                  <div className="text-xs text-muted-foreground font-body mt-0.5">{r.site_city || "—"} · {r.material_type || "—"} · {r.quantity ? `${r.quantity} ${r.quantity_unit || ""}` : "?"}</div>
                  <div className="text-[11px] text-muted-foreground font-body mt-1">{r.status}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border">
        <div className="p-3 border-b border-border font-display font-bold text-sm flex items-center justify-between">
          Scénarios recommandés
          {generating && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
        </div>
        <div className="p-3 max-h-[70vh] overflow-y-auto space-y-2">
          {!selected && <p className="text-sm text-muted-foreground font-body">Sélectionne une demande pour générer les meilleurs scénarios.</p>}
          {selected && !generating && scenarios.length === 0 && <p className="text-sm text-muted-foreground font-body">Aucun scénario. Vérifie que des transporteurs, camions et dompes actives existent.</p>}
          {scenarios.map((s) => (
            <div key={s.id} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs font-display font-bold">#{s.rank}</span>
                  <span className="text-sm font-display font-semibold text-foreground">Score {Number(s.score).toFixed(1)}</span>
                </div>
                <button onClick={() => apply(s.id)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:opacity-90 flex items-center gap-1">
                  <Play className="w-3 h-3" /> Appliquer
                </button>
              </div>
              <ul className="text-xs text-foreground font-body space-y-0.5">
                {(s.reasons || []).map((r: string, i: number) => <li key={i}>• {r}</li>)}
              </ul>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground font-body mt-2 pt-2 border-t border-border">
                <div>Distance : <b className="text-foreground">{s.estimated_distance_km ?? "?"} km</b></div>
                <div>Durée : <b className="text-foreground">{s.estimated_duration_min ?? "?"} min</b></div>
                <div>Coût : <b className="text-foreground">{Number(s.estimated_cost || 0).toFixed(0)} $</b></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ==================== PLANNING ==================== */
function PlanningTab({ trips }: { trips: Trip[] }) {
  const [view, setView] = useState<"day" | "week" | "map">("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const range = useMemo(() => {
    const d = new Date(anchor); d.setHours(0,0,0,0);
    if (view === "day") {
      const end = new Date(d); end.setDate(end.getDate() + 1);
      return { from: d, to: end };
    }
    const dow = d.getDay(); const start = new Date(d); start.setDate(start.getDate() - dow);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return { from: start, to: end };
  }, [anchor, view]);

  const filtered = useMemo(() =>
    trips.filter((t) => t.scheduled_at && new Date(t.scheduled_at) >= range.from && new Date(t.scheduled_at) < range.to),
    [trips, range]
  );

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["day","week","map"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-display font-semibold ${view === v ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary"}`}>
              {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Carte"}
            </button>
          ))}
        </div>
        {view !== "map" && (
          <div className="flex items-center gap-1">
            <button onClick={() => setAnchor(new Date(anchor.getTime() - (view === "day" ? 1 : 7) * 86400000))}
              className="px-2 py-1.5 rounded-lg border border-border bg-card text-xs">◀</button>
            <div className="text-xs font-body text-muted-foreground px-2">
              {range.from.toLocaleDateString("fr-CA")} → {new Date(range.to.getTime() - 86400000).toLocaleDateString("fr-CA")}
            </div>
            <button onClick={() => setAnchor(new Date(anchor.getTime() + (view === "day" ? 1 : 7) * 86400000))}
              className="px-2 py-1.5 rounded-lg border border-border bg-card text-xs">▶</button>
            <button onClick={() => setAnchor(new Date())} className="px-2 py-1.5 rounded-lg border border-border bg-card text-xs font-display font-semibold">Aujourd'hui</button>
          </div>
        )}
        <div className="ml-auto text-xs text-muted-foreground font-body">{filtered.length} voyage(s)</div>
      </div>

      {view === "map" ? (
        <PlanningMap trips={trips.filter((t) => t.pickup_lat && t.pickup_lng)} />
      ) : (
        <PlanningGrid trips={filtered} from={range.from} to={range.to} view={view} />
      )}
    </section>
  );
}

function PlanningGrid({ trips, from, to, view }: { trips: Trip[]; from: Date; to: Date; view: "day" | "week" }) {
  const days: Date[] = [];
  for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) days.push(new Date(d));

  const rescheduleTo = async (tripId: string, day: Date) => {
    const cur = trips.find((t) => t.id === tripId);
    const base = cur?.scheduled_at ? new Date(cur.scheduled_at) : new Date();
    const next = new Date(day);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    const { error } = await supabase.from("trips" as any).update({ scheduled_at: next.toISOString() }).eq("id", tripId);
    if (error) toast.error(error.message); else toast.success("Voyage replanifié");
  };

  return (
    <div className={`grid gap-2 ${view === "day" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-7"}`}>
      {days.map((day) => {
        const dayTrips = trips.filter((t) => t.scheduled_at && sameDay(new Date(t.scheduled_at), day));
        return (
          <div key={day.toISOString()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); if (id) rescheduleTo(id, day); }}
            className="bg-card rounded-lg border border-border p-2 min-h-[180px]">
            <div className="text-xs font-display font-bold text-foreground mb-2">
              {day.toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" })}
            </div>
            <div className="space-y-1.5">
              {dayTrips.length === 0 && <div className="text-[11px] text-muted-foreground font-body italic">—</div>}
              {dayTrips.map((t) => (
                <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                  className="p-2 rounded border border-border bg-background text-[11px] font-body cursor-grab active:cursor-grabbing">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[t.status]}`} />
                    <b className="text-foreground">{t.trip_number}</b>
                    <span className="text-muted-foreground ml-auto">{t.scheduled_at ? new Date(t.scheduled_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  </div>
                  <div className="text-muted-foreground truncate">{t.material || "—"}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlanningMap({ trips }: { trips: Trip[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    loadGoogleMaps().then((g) => {
      if (!ref.current) return;
      const map = new g.maps.Map(ref.current, {
        center: { lat: 46.8, lng: -71.3 }, zoom: 8, streetViewControl: false, mapTypeControl: false,
      });
      const markers = trips.map((t) => new g.maps.Marker({
        position: { lat: t.pickup_lat!, lng: t.pickup_lng! },
        map, title: `${t.trip_number} · ${STATUS_LABELS[t.status]}`,
      }));
      cleanup = () => markers.forEach((m) => m.setMap(null));
    }).catch((e) => toast.error(String(e.message || e)));
    return () => { if (cleanup) cleanup(); };
  }, [trips]);
  return <div ref={ref} className="w-full h-[70vh] rounded-lg border border-border bg-card" />;
}

/* ==================== TRIPS ==================== */
function TripsTab({ trips, onChange }: { trips: Trip[]; onChange: () => void }) {
  const [filter, setFilter] = useState<TripStatus | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Trip | null>(null);

  const rows = trips.filter((t) => (filter === "all" || t.status === filter) && (q === "" || (t.trip_number || "").toLowerCase().includes(q.toLowerCase()) || (t.material || "").toLowerCase().includes(q.toLowerCase())));

  const advance = async (id: string, next: TripStatus) => {
    const { error } = await supabase.rpc("trip_advance_status" as any, { _trip_id: id, _next: next });
    if (error) toast.error(error.message); else { toast.success(`Statut → ${STATUS_LABELS[next]}`); onChange(); }
  };

  return (
    <section className="grid lg:grid-cols-[1fr_400px] gap-4">
      <div>
        <div className="flex flex-wrap gap-2 mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm flex-1 min-w-[200px]" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm">
            <option value="all">Tous les statuts</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <div className="text-xs text-muted-foreground font-body self-center ml-auto">{rows.length} voyage(s)</div>
        </div>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs font-display font-semibold text-foreground sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">N°</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="text-left px-3 py-2">Planifié</th>
                  <th className="text-left px-3 py-2">Matériau</th>
                  <th className="text-right px-3 py-2">Marge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-body">
                {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Aucun voyage.</td></tr>}
                {rows.map((t) => (
                  <tr key={t.id} onClick={() => setSelected(t)} className={`hover:bg-secondary/40 cursor-pointer ${selected?.id === t.id ? "bg-secondary/50" : ""}`}>
                    <td className="px-3 py-2 font-display font-semibold text-foreground">{t.trip_number}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-white ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{t.scheduled_at ? new Date(t.scheduled_at).toLocaleString("fr-CA") : "—"}</td>
                    <td className="px-3 py-2 text-foreground">{t.material || "—"}</td>
                    <td className="px-3 py-2 text-right font-display font-semibold text-foreground">{Number(t.margin || 0).toFixed(0)} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <aside className="bg-card rounded-lg border border-border p-4 h-fit sticky top-24">
        {!selected ? (
          <p className="text-sm text-muted-foreground font-body">Sélectionne un voyage pour voir le détail et faire avancer son statut.</p>
        ) : (
          <TripDetail trip={selected} onAdvance={(next) => advance(selected.id, next)} />
        )}
      </aside>
    </section>
  );
}

function TripDetail({ trip, onAdvance }: { trip: Trip; onAdvance: (s: TripStatus) => void }) {
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("trip_status_history" as any).select("*").eq("trip_id", trip.id).order("changed_at", { ascending: false })
      .then(({ data }) => setHistory((data as any) ?? []));
  }, [trip.id]);

  const idx = STATUS_ORDER.indexOf(trip.status);
  const next = idx >= 0 && idx < STATUS_ORDER.length - 3 ? STATUS_ORDER[idx + 1] : null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-muted-foreground font-body">Voyage</div>
        <div className="text-lg font-display font-bold text-foreground">{trip.trip_number}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-body">
        <Info label="Statut"><span className={`inline-flex px-2 py-0.5 rounded text-white ${STATUS_COLORS[trip.status]}`}>{STATUS_LABELS[trip.status]}</span></Info>
        <Info label="Planifié">{trip.scheduled_at ? new Date(trip.scheduled_at).toLocaleString("fr-CA") : "—"}</Info>
        <Info label="Matériau">{trip.material || "—"}</Info>
        <Info label="Distance">{trip.distance_km ?? "?"} km</Info>
        <Info label="Coût">{Number(trip.cost || 0).toFixed(0)} $</Info>
        <Info label="Revenu">{Number(trip.revenue || 0).toFixed(0)} $</Info>
        <Info label="Marge">{Number(trip.margin || 0).toFixed(0)} $</Info>
      </div>

      {next && (
        <button onClick={() => onAdvance(next)} className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90">
          Avancer → {STATUS_LABELS[next]}
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onAdvance("termine")} className="px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs font-display font-semibold">Terminer</button>
        <button onClick={() => onAdvance("annule")} className="px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs font-display font-semibold">Annuler</button>
      </div>

      <div>
        <div className="text-xs font-display font-bold text-foreground mb-1">Historique</div>
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {history.length === 0 && <li className="text-xs text-muted-foreground font-body">Aucun changement.</li>}
          {history.map((h) => (
            <li key={h.id} className="text-xs font-body flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[h.to_status as TripStatus] || "bg-slate-400"}`} />
              <span className="text-foreground">{STATUS_LABELS[h.to_status as TripStatus] || h.to_status}</span>
              <span className="text-muted-foreground ml-auto">{new Date(h.changed_at).toLocaleString("fr-CA")}</span>
            </li>
          ))}
        </ul>
      </div>

      {trip.transport_request_id && (
        <Link to={`/admin/demandes-acces`} className="block text-xs text-primary hover:underline font-body">→ Voir la demande d'accès</Link>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

/* ==================== AUTOMATIONS ==================== */
function AutomationsTab() {
  const [rules, setRules] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from("dispatch_rules" as any).select("*").order("weight", { ascending: false });
    setRules((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (key: string, active: boolean) => {
    const { error } = await supabase.from("dispatch_rules" as any).update({ active }).eq("key", key);
    if (error) toast.error(error.message); else load();
  };

  return (
    <section className="max-w-3xl">
      <div className="bg-card rounded-lg border border-border p-4 mb-4">
        <h3 className="font-display font-bold text-foreground mb-2">Pondérations du moteur de répartition</h3>
        <p className="text-xs text-muted-foreground font-body mb-3">Le moteur combine ces critères pour classer les scénarios. Poids éditables via la base pour l'instant, activation ici.</p>
        <ul className="divide-y divide-border">
          {rules.map((r) => (
            <li key={r.key} className="py-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm font-display font-semibold text-foreground">{r.label}</div>
                <div className="text-xs text-muted-foreground font-body">Poids : {r.weight}</div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-body">
                <input type="checkbox" checked={r.active} onChange={(e) => toggle(r.key, e.target.checked)} />
                <span>Actif</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="font-display font-bold text-foreground mb-2">Chaînage automatique</h3>
        <ul className="text-sm font-body text-muted-foreground space-y-1">
          <li>• Changement de statut → historique + activité CRM + timestamps auto.</li>
          <li>• Statut voyage → mise à jour de la demande d'accès (mapping intelligent).</li>
          <li>• Client, transporteur, dompe → mise à jour de « Dernière activité ».</li>
          <li>• Temps réel diffusé sur tous les postes admin connectés.</li>
          <li>• Prochaines intégrations : notifications email/SMS, facturation, signature, app chauffeur.</li>
        </ul>
      </div>
    </section>
  );
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}