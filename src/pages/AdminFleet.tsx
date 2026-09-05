// GESTION DE LA FLOTTE — module interne (back-office Vrac Québec).
// Réutilise : rôles admin existants, calendrier `calendar_events`, notifications CRM.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, CalendarDays, Plus, RefreshCw, Truck as TruckIcon, Wrench,
  ClipboardCheck, AlertTriangle, History, DollarSign, LayoutDashboard, Bell,
} from "lucide-react";
import {
  InspectionDialog, MaintenanceDialog, RepairDialog, VehicleDialog,
} from "@/components/fleet/FleetDialogs";
import CompleteDialog from "@/components/fleet/CompleteDialog";
import {
  buildTodo, costTotals, dateLabel, fetchCosts, fetchFleetEvents, fetchInspections,
  fetchMaintenance, fetchRepairs, fetchVehicles, money, PRIORITY_LABELS,
  REPAIR_STATUS_LABELS, scanDue, SERVICE_STATUS_LABELS, vehicleLabel,
  type Cost, type FleetEvent, type Inspection, type Maintenance, type Repair, type Vehicle,
} from "@/lib/fleet/api";
import type { Driver } from "@/lib/calendar-utils";
import { ExpenseDialog, WorkItemDialog } from "@/components/fleet/FleetDialogsV2";
import {
  buildDashboard, EXPENSE_LABELS, fetchExpenses, fetchWorkItems, kmLabel, hoursLabel,
  OPS_STATUS, TONE_CLASS, opsStatus, unitSubtitle, unitTitle, maintenanceDue,
  type Expense, type WorkItem,
} from "@/lib/fleet/v2";
import { useToast } from "@/hooks/use-toast";
import { useFleetTenant } from "@/lib/fleet/tenant";
import { CompanySwitcher, SupportBanner } from "@/components/fleet/FleetTenantBar";

const TABS = [
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { key: "vehicules", label: "Véhicules", icon: TruckIcon },
  { key: "entretien", label: "Entretien", icon: Wrench },
  { key: "reparations", label: "Réparations", icon: AlertTriangle },
  { key: "inspections", label: "Inspections", icon: ClipboardCheck },
  { key: "afaire", label: "À faire bientôt", icon: Bell },
  { key: "historique", label: "Historique", icon: History },
  { key: "depenses", label: "Dépenses", icon: DollarSign },
  { key: "couts", label: "Coûts", icon: DollarSign },
] as const;

type TabKey = typeof TABS[number]["key"];

function Kpi({ label, value, tone, to }: { label: string; value: string; tone?: string; to?: string }) {
  const body = (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-body text-muted-foreground">{label}</div>
      <div className={`text-2xl font-display font-bold mt-1 ${tone ?? "text-foreground"}`}>{value}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function AdminFleet() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const tenant = useFleetTenant(isAdmin, isReady && !roleLoading);
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabKey) || "dashboard";
  const setTab = (t: TabKey) => setParams({ tab: t }, { replace: true });

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [maint, setMaint] = useState<Maintenance[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [vehicleDialog, setVehicleDialog] = useState(false);
  const [maintDialog, setMaintDialog] = useState<{ open: boolean; record?: Maintenance | null }>({ open: false });
  const [repairDialog, setRepairDialog] = useState<{ open: boolean; record?: Repair | null }>({ open: false });
  const [inspDialog, setInspDialog] = useState<{ open: boolean; record?: Inspection | null }>({ open: false });
  const [complete, setComplete] = useState<
    { kind: "entretien"; record: Maintenance } | { kind: "reparation"; record: Repair } | null>(null);
  const [todoFilter, setTodoFilter] = useState<"tous" | "urgent" | "avenir" | "retard">("tous");
  const [todoVehicle, setTodoVehicle] = useState("tous");
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; record?: Expense | null }>({ open: false });
  const [workDialog, setWorkDialog] = useState<{ open: boolean; record?: WorkItem | null }>({ open: false });
  const [vehFilter, setVehFilter] = useState("tous");

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Balayage des échéances → alimente le centre de notifications EXISTANT.
      await scanDue().catch(() => undefined);
      const [v, d, m, r, i, c, e, w, x] = await Promise.all([
        fetchVehicles(),
        supabase.from("drivers").select("*").order("name"),
        fetchMaintenance(), fetchRepairs(), fetchInspections(), fetchCosts(), fetchFleetEvents(),
        fetchWorkItems(), fetchExpenses(),
      ]);
      setVehicles(v);
      setDrivers((d.data as Driver[]) ?? []);
      setMaint(m); setRepairs(r); setInspections(i); setCosts(c); setEvents(e);
      setWorkItems(w); setExpenses(x);
    } catch (err) {
      toast({ title: "Chargement impossible", description: (err as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  // Rechargement complet quand le Super Admin change d'entreprise.
  useEffect(() => { if (isAdmin && tenant.companyId) load(); }, [isAdmin, tenant.companyId, load]);

  const byId = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const todo = useMemo(() => buildTodo(maint, repairs, inspections), [maint, repairs, inspections]);
  const totals = useMemo(() => costTotals(costs), [costs]);
  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => ({
    inService: vehicles.filter((v) => (v.service_status ?? "en_service") === "en_service").length,
    maintSoon: todo.filter((t) => t.kind === "entretien" && !t.late).length,
    maintLate: todo.filter((t) => t.kind === "entretien" && t.late).length,
    urgentRepairs: repairs.filter((r) => r.priority === "urgente" && r.status !== "terminee").length,
    inspectionsSoon: events.filter((e) => e.fleet_ref_type === "inspection" && e.start_at >= today).length,
    // Problèmes encore ouverts : la réparation liée n'est pas terminée.
    problems: inspections.filter((i) => {
      if (!i.has_problem) return false;
      const linked = repairs.filter((r) => r.inspection_id === i.id);
      return !linked.length || linked.some((r) => r.status !== "terminee");
    }).length,
  }), [vehicles, todo, repairs, events, inspections, today]);

  const filteredTodo = useMemo(() => todo.filter((t) => {
    if (todoVehicle !== "tous" && t.vehicleId !== todoVehicle) return false;
    if (todoFilter === "urgent") return t.priority === "urgente";
    if (todoFilter === "retard") return t.late;
    if (todoFilter === "avenir") return !t.late;
    return true;
  }), [todo, todoFilter, todoVehicle]);

  const dash = useMemo(
    () => buildDashboard({ vehicles, maint, repairs, inspections, workItems }),
    [vehicles, maint, repairs, inspections, workItems]);

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (vehFilter !== "tous" && (v.ops_status ?? "disponible") !== vehFilter) return false;
      if (!q) return true;
      return [v.name, v.unit_number, v.plate, v.make, v.model, v.vin].filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [vehicles, search, vehFilter]);

  // Résumé par véhicule affiché sur la carte : prochain entretien + réparations ouvertes.
  const vehicleBadges = useMemo(() => {
    const map = new Map<string, { due: string | null; open: number; tone: string }>();
    for (const v of vehicles) {
      const rows = maint.filter((m) => m.vehicle_id === v.id
        && (m.next_due_date || m.next_due_km || m.next_due_hours));
      let due: string | null = null; let tone = TONE_CLASS.ok;
      for (const m of rows) {
        const d = maintenanceDue(m, v);
        if (d.state === "ok" || !d.reason) continue;
        if (d.state === "retard") { due = `${m.next_type || m.maintenance_type} — ${d.reason}`; tone = TONE_CLASS.bad; break; }
        if (!due) { due = `${m.next_type || m.maintenance_type} — ${d.reason}`; tone = TONE_CLASS.soon; }
      }
      map.set(v.id, {
        due,
        open: repairs.filter((r) => r.vehicle_id === v.id && r.status !== "terminee" && r.status !== "annulee").length,
        tone,
      });
    }
    return map;
  }, [vehicles, maint, repairs]);

  if (!isReady || roleLoading) return <FullPageState title="Chargement de la flotte" />;
  if (!isAdmin) return null;

  const runScan = async () => {
    try {
      await scanDue();
      toast({ title: "Échéances vérifiées", description: "Les alertes ont été mises à jour dans les notifications." });
    } catch (e) {
      toast({ title: "Vérification impossible", description: (e as Error).message, variant: "destructive" });
    }
  };

  const vName = (id: string) => vehicleLabel(byId.get(id));

  // Variation des coûts vs mois précédent (texte + couleur, jamais la couleur seule).
  const variation = (() => {
    const prev = totals.lastMonth;
    if (!prev) return { text: totals.thisMonth ? "Nouveau" : "—", tone: "text-muted-foreground" };
    const pct = Math.round(((totals.thisMonth - prev) / prev) * 100);
    return {
      text: `${pct > 0 ? "+" : ""}${pct} %`,
      tone: pct > 0 ? "text-destructive" : pct < 0 ? "text-primary" : "text-muted-foreground",
    };
  })();

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <SupportBanner tenant={tenant} />
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/admin" className="p-2 -ml-2 rounded-lg hover:bg-secondary" aria-label="Retour à l'administration">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <TruckIcon className="w-5 h-5 text-primary shrink-0" />
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Gestion de la flotte</h1>
          </div>
          <div className="flex items-center gap-2">
            <CompanySwitcher tenant={tenant} />
            <Button variant="outline" size="sm" onClick={runScan}>
              <RefreshCw className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Vérifier les échéances</span>
            </Button>
            <Link to="/admin/calendrier">
              <Button variant="outline" size="sm"><CalendarDays className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Calendrier</span></Button>
            </Link>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 overflow-x-auto">
          <div className="flex gap-1 pb-2 min-w-max">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-body whitespace-nowrap ${
                  tab === t.key ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-secondary"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-5 space-y-5">
        {/* Actions rapides */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setVehicleDialog(true)}><Plus className="w-4 h-4 mr-1" /> Véhicule</Button>
          <Button size="sm" variant="outline" onClick={() => setMaintDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Entretien</Button>
          <Button size="sm" variant="outline" onClick={() => setRepairDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Réparation</Button>
          <Button size="sm" variant="outline" onClick={() => setInspDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Inspection</Button>
          <Button size="sm" variant="outline" onClick={() => setExpenseDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Dépense</Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground font-body">Chargement…</p>}

        {tab === "dashboard" && (
          <div className="space-y-5">
            {/* À SURVEILLER */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display font-bold mb-3">À surveiller</h2>
              {dash.attention.length ? (
                <div className="space-y-2">
                  {dash.attention.slice(0, 8).map((a) => (
                    <Link key={a.id} to={`/admin/flotte/vehicule/${a.vehicleId}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:border-primary">
                      <div className="min-w-0">
                        <div className="text-sm font-display font-semibold truncate">{a.title}</div>
                        <div className="text-xs text-muted-foreground font-body truncate">
                          {vName(a.vehicleId)} · {a.detail}
                        </div>
                      </div>
                      <span className={`text-[11px] px-2 py-1 rounded font-display font-semibold shrink-0 ${
                        a.level === "urgent" ? TONE_CLASS.bad : a.level === "bientot" ? TONE_CLASS.soon : TONE_CLASS.warn}`}>
                        {a.level === "urgent" ? "Urgent" : a.level === "bientot" ? "Bientôt" : "À surveiller"}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-body text-muted-foreground">
                  Aucun problème urgent — votre flotte est à jour.
                </p>
              )}
            </section>

            {/* ÉTAT DE LA FLOTTE */}
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display font-bold">État de la flotte</h2>
                <span className="text-sm font-body text-muted-foreground">{dash.total} unité(s)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {dash.fleetState.map((st) => (
                  <button key={st.value} onClick={() => { setVehFilter(st.value); setTab("vehicules"); }}
                    className="rounded-lg border border-border p-3 text-left hover:border-primary">
                    <div className="text-xl font-display font-bold">{st.count}</div>
                    <div className="text-xs font-body text-muted-foreground">{st.label}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* ENTRETIENS / RÉPARATIONS / INSPECTIONS */}
            <div className="grid sm:grid-cols-3 gap-3">
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display font-bold mb-2">Entretiens</h3>
                <button onClick={() => setTab("entretien")} className="block text-sm font-body">À jour : <b>{dash.maintenance.ok}</b></button>
                <button onClick={() => setTab("afaire")} className="block text-sm font-body">Bientôt dus : <b>{dash.maintenance.soon}</b></button>
                <button onClick={() => setTab("afaire")} className="block text-sm font-body text-destructive">En retard : <b>{dash.maintenance.late}</b></button>
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display font-bold mb-2">Réparations</h3>
                <button onClick={() => setTab("reparations")} className="block text-sm font-body text-destructive">Urgentes : <b>{dash.repairs.urgent}</b></button>
                <button onClick={() => setTab("reparations")} className="block text-sm font-body">À planifier : <b>{dash.repairs.toPlan}</b></button>
                <button onClick={() => setTab("reparations")} className="block text-sm font-body">En cours : <b>{dash.repairs.inProgress}</b></button>
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display font-bold mb-2">Inspections</h3>
                <button onClick={() => setTab("inspections")} className="block text-sm font-body">Complétées : <b>{dash.inspections.done}</b></button>
                <button onClick={() => setTab("afaire")} className="block text-sm font-body">À faire : <b>{stats.inspectionsSoon}</b></button>
                <button onClick={() => setTab("inspections")} className="block text-sm font-body text-amber-600">Problèmes : <b>{dash.inspections.problems}</b></button>
              </section>
            </div>

            {/* AUJOURD'HUI */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display font-bold mb-3">Aujourd'hui</h2>
              {dash.todayRows.length ? dash.todayRows.map((a) => (
                <Link key={`t-${a.id}`} to={`/admin/flotte/vehicule/${a.vehicleId}`}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                  <span className="text-sm font-body truncate">{a.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{vName(a.vehicleId)}</span>
                </Link>
              )) : <p className="text-sm font-body text-muted-foreground">Rien ne demande votre attention aujourd'hui.</p>}
              <button onClick={() => setTab("afaire")} className="mt-3 text-sm font-body text-primary">Voir toutes les tâches →</button>
            </section>

            {/* PROCHAINES ÉCHÉANCES */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display font-bold mb-3">Prochaines échéances</h2>
              {todo.slice(0, 8).map((t) => (
                <Link key={`${t.kind}-${t.id}`} to={`/admin/flotte/vehicule/${t.vehicleId}`}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-body truncate">{t.work}</div>
                    <div className="text-xs text-muted-foreground">{vName(t.vehicleId)} · {dateLabel(t.date)}</div>
                  </div>
                  <span className={`text-xs font-display font-semibold ${t.late ? "text-destructive" : "text-muted-foreground"}`}>{t.status}</span>
                </Link>
              ))}
              {!todo.length && <p className="text-sm text-muted-foreground font-body">Aucune échéance.</p>}
              <Link to="/admin/calendrier" className="mt-3 inline-block text-sm font-body text-primary">Voir le calendrier →</Link>
            </section>

            {/* COÛTS */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display font-bold mb-3">Coûts</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Kpi label="Ce mois-ci" value={money(totals.thisMonth)} />
                <Kpi label="Mois précédent" value={money(totals.lastMonth)} />
                <Kpi label="Variation" value={variation.text} tone={variation.tone} />
                <Kpi label="Cette année" value={money(totals.thisYear)} />
              </div>
              <button onClick={() => setTab("couts")} className="mt-3 text-sm font-body text-primary">Voir l'analyse des coûts →</button>
            </section>
          </div>
        )}

        {tab === "vehicules" && (
          <div className="space-y-3">
            <Input placeholder="Rechercher : numéro d'unité, marque, modèle, plaque, NIV…"
              value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
            <div className="flex flex-wrap gap-2">
              {[{ value: "tous", label: "Tous" }, ...OPS_STATUS].map((o) => (
                <button key={o.value} onClick={() => setVehFilter(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-body ${
                    vehFilter === o.value ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredVehicles.map((v) => {
                const badge = vehicleBadges.get(v.id);
                const st = opsStatus(v);
                return (
                  <Link key={v.id} to={`/admin/flotte/vehicule/${v.id}`}
                    className="rounded-xl border border-border bg-card p-4 hover:border-primary transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-display font-bold">{unitTitle(v)}</div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-display shrink-0 ${TONE_CLASS[st.tone]}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-body mt-1">{unitSubtitle(v)}</div>
                    <div className="text-xs text-muted-foreground font-body mt-1">
                      {[kmLabel(v.odometer_km as number | null), hoursLabel(v.engine_hours as number | null),
                        v.plate ? `Plaque ${v.plate}` : null].filter(Boolean).join(" • ") || "—"}
                    </div>
                    {badge?.due && <div className={`mt-2 inline-block text-[11px] px-2 py-0.5 rounded font-display ${badge.tone}`}>{badge.due}</div>}
                    {!!badge?.open && (
                      <div className="mt-1 text-xs font-body text-muted-foreground">{badge.open} réparation(s) ouverte(s)</div>
                    )}
                  </Link>
                );
              })}
              {!filteredVehicles.length && !loading && <p className="text-sm text-muted-foreground font-body">Aucun véhicule.</p>}
            </div>
          </div>
        )}

        {tab === "entretien" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {maint.map((m) => (
              <button key={m.id} onClick={() => setMaintDialog({ open: true, record: m })} className="w-full text-left p-3 hover:bg-secondary/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-display font-semibold truncate">{m.maintenance_type}</div>
                    <div className="text-xs text-muted-foreground font-body">{vName(m.vehicle_id)} · {dateLabel(m.performed_on)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-display">{money(m.cost)}</div>
                    {m.next_due_date && <div className="text-xs text-muted-foreground">Prochain : {dateLabel(m.next_due_date)}</div>}
                  </div>
                </div>
              </button>
            ))}
            {!maint.length && !loading && <p className="p-4 text-sm text-muted-foreground font-body">Aucun entretien enregistré.</p>}
          </div>
        )}

        {tab === "reparations" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {repairs.map((r) => (
              <button key={r.id} onClick={() => setRepairDialog({ open: true, record: r })} className="w-full text-left p-3 hover:bg-secondary/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-display font-semibold truncate">{r.problem}</div>
                    <div className="text-xs text-muted-foreground font-body">{vName(r.vehicle_id)} · {dateLabel(r.reported_on)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-display font-semibold ${r.priority === "urgente" ? "text-destructive" : "text-muted-foreground"}`}>
                      {PRIORITY_LABELS[r.priority] ?? r.priority}
                    </div>
                    <div className="text-xs text-muted-foreground">{REPAIR_STATUS_LABELS[r.status] ?? r.status}</div>
                  </div>
                </div>
              </button>
            ))}
            {!repairs.length && !loading && <p className="p-4 text-sm text-muted-foreground font-body">Aucune réparation.</p>}
          </div>
        )}

        {tab === "inspections" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {inspections.map((i) => (
              <div key={i.id} className="p-3 flex items-center justify-between gap-3">
                <button onClick={() => setInspDialog({ open: true, record: i })} className="min-w-0 text-left flex-1">
                  <div className="text-sm font-display font-semibold truncate">{vName(i.vehicle_id)}</div>
                  <div className="text-xs text-muted-foreground font-body truncate">{i.comment || "Inspection quotidienne"}</div>
                </button>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{dateLabel(i.inspected_on)}</div>
                    {i.has_problem && <div className="text-xs font-display font-semibold text-destructive">Problème</div>}
                  </div>
                  <Link to={`/admin/flotte/vehicule/${i.vehicle_id}?tab=inspections`}>
                    <Button size="sm" variant="outline">Ouvrir</Button>
                  </Link>
                </div>
              </div>
            ))}
            {!inspections.length && !loading && <p className="p-4 text-sm text-muted-foreground font-body">Aucune inspection.</p>}
          </div>
        )}

        {tab === "afaire" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {([["tous", "Tous"], ["urgent", "Urgent"], ["avenir", "À venir"], ["retard", "En retard"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTodoFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-body ${todoFilter === k ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
              <select value={todoVehicle} onChange={(e) => setTodoVehicle(e.target.value)}
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm font-body">
                <option value="tous">Tous les véhicules</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
              </select>
            </div>
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr className="text-left text-xs font-display uppercase text-muted-foreground">
                    <th className="p-3">Véhicule</th><th className="p-3">Travail</th><th className="p-3">Date</th>
                    <th className="p-3">Kilométrage</th><th className="p-3">Priorité</th><th className="p-3">Statut</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTodo.map((t) => (
                    <tr key={`${t.kind}-${t.id}`} className="border-t border-border cursor-pointer hover:bg-secondary/40"
                      onClick={() => navigate(`/admin/flotte/vehicule/${t.vehicleId}?tab=afaire`)}>
                      <td className="p-3 font-body">{vName(t.vehicleId)}</td>
                      <td className="p-3 font-body">{t.work}</td>
                      <td className="p-3 font-body">{dateLabel(t.date)}</td>
                      <td className="p-3 font-body">{t.km ? `${t.km.toLocaleString("fr-CA")} km` : "—"}</td>
                      <td className="p-3 font-body">{PRIORITY_LABELS[t.priority] ?? t.priority}</td>
                      <td className={`p-3 font-body ${t.late ? "text-destructive font-semibold" : ""}`}>{t.status}</td>
                      <td className="p-3 text-right">
                        {t.kind !== "inspection" && (
                          <Button size="sm" variant="outline" onClick={(e) => {
                            e.stopPropagation();
                            if (t.kind === "entretien") {
                              const rec = maint.find((m) => m.id === t.id);
                              if (rec) setComplete({ kind: "entretien", record: rec });
                            } else {
                              const rec = repairs.find((r) => r.id === t.id);
                              if (rec) setComplete({ kind: "reparation", record: rec });
                            }
                          }}>Terminé</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!filteredTodo.length && <tr><td colSpan={7} className="p-4 text-muted-foreground font-body">Rien à faire pour le moment.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "depenses" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {expenses.map((x) => (
              <button key={x.id} onClick={() => setExpenseDialog({ open: true, record: x })}
                className="w-full text-left p-3 hover:bg-secondary/50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-display font-semibold truncate">
                    {EXPENSE_LABELS[x.category] ?? x.category}{x.description ? ` — ${x.description}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground font-body">{vName(x.vehicle_id)} · {dateLabel(x.spent_on)}</div>
                </div>
                <div className="text-sm font-display shrink-0">{money(x.amount)}</div>
              </button>
            ))}
            {!expenses.length && !loading && <p className="p-4 text-sm text-muted-foreground font-body">Aucune dépense.</p>}
          </div>
        )}

        {tab === "historique" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {[
              ...maint.map((m) => ({ date: m.performed_on, label: `Entretien — ${m.maintenance_type}`, v: m.vehicle_id, amount: Number(m.cost || 0) })),
              ...repairs.map((r) => ({ date: r.completed_date ?? r.reported_on, label: `Réparation — ${r.problem}`, v: r.vehicle_id, amount: Number(r.cost_actual ?? r.cost_estimated ?? 0) })),
              ...inspections.map((i) => ({ date: i.inspected_on, label: `Inspection${i.has_problem ? " (problème)" : ""}`, v: i.vehicle_id, amount: 0 })),
            ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 200).map((row, idx) => (
              <div key={idx} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-body truncate">{row.label}</div>
                  <div className="text-xs text-muted-foreground">{vName(row.v)} · {dateLabel(row.date)}</div>
                </div>
                {row.amount > 0 && <span className="text-sm font-display">{money(row.amount)}</span>}
              </div>
            ))}
          </div>
        )}

        {tab === "couts" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Mois en cours" value={money(totals.thisMonth)} />
              <Kpi label="Année en cours" value={money(totals.thisYear)} />
              <Kpi label="Total" value={money(totals.total)} />
            </div>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {vehicles.map((v) => {
                const t = costTotals(costs.filter((c) => c.vehicle_id === v.id));
                return (
                  <Link key={v.id} to={`/admin/flotte/vehicule/${v.id}?tab=couts`} className="flex items-center justify-between p-3 hover:bg-secondary/50">
                    <span className="text-sm font-body">{vehicleLabel(v)}</span>
                    <span className="text-sm font-display">{money(t.total)} <span className="text-xs text-muted-foreground">(année {money(t.thisYear)})</span></span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <ExpenseDialog open={expenseDialog.open} onOpenChange={(o) => setExpenseDialog({ open: o })}
        vehicles={vehicles} record={expenseDialog.record} onSaved={load} />
      <WorkItemDialog open={workDialog.open} onOpenChange={(o) => setWorkDialog({ open: o })}
        vehicles={vehicles} record={workDialog.record} onSaved={load} />
      <CompleteDialog target={complete} onOpenChange={(o) => !o && setComplete(null)} onSaved={load} />
      <VehicleDialog open={vehicleDialog} onOpenChange={setVehicleDialog} onSaved={load} />
      <MaintenanceDialog open={maintDialog.open} onOpenChange={(o) => setMaintDialog({ open: o })}
        vehicles={vehicles} record={maintDialog.record} onSaved={load} />
      <RepairDialog open={repairDialog.open} onOpenChange={(o) => setRepairDialog({ open: o })}
        vehicles={vehicles} record={repairDialog.record} onSaved={load} />
      <InspectionDialog open={inspDialog.open} onOpenChange={(o) => setInspDialog({ open: o })}
        vehicles={vehicles} drivers={drivers} record={inspDialog.record} onSaved={load} />
    </div>
  );
}
