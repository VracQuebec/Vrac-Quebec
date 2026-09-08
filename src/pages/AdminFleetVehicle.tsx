// Fiche individuelle d'un véhicule (back-office Vrac Québec).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarDays, Pencil, Plus } from "lucide-react";
import {
  InspectionDialog, MaintenanceDialog, RepairDialog, VehicleDialog,
} from "@/components/fleet/FleetDialogs";
import {
  buildTodo, CHECK_LABELS, costTotals, dateLabel, fetchCosts, fetchFleetEvents,
  fetchInspections, fetchMaintenance, fetchParts, fetchRepairs, inspectionToRepair,
  money, PRIORITY_LABELS, REPAIR_STATUS_LABELS, SERVICE_STATUS_LABELS,
  updateVehicleReadings, vehicleLabel, fetchChangeLog, logSentence, type FleetLogEntry,
  type CheckValue, type Cost, type FleetEvent, type Inspection, type Maintenance,
  type Part, type Repair, type Vehicle,
} from "@/lib/fleet/api";
import { TRUCK_TYPE_LABELS } from "@/lib/calendar-utils";
import type { Driver } from "@/lib/calendar-utils";
import { useToast } from "@/hooks/use-toast";
import { useFleetTenant } from "@/lib/fleet/tenant";
import { SupportBanner } from "@/components/fleet/FleetTenantBar";
import PageHeader from "@/components/layout/PageHeader";
import FleetDocuments from "@/components/fleet/FleetDocuments";
import CompleteDialog from "@/components/fleet/CompleteDialog";
import { Input } from "@/components/ui/input";
import { setStatus, type CrmNotification } from "@/lib/notifications/api";
import { ExpenseDialog, ReadingDialog, WorkItemDialog } from "@/components/fleet/FleetDialogsV2";
import {
  EXPENSE_LABELS, TONE_CLASS, WORK_STATUS_LABELS, adminStatusLabel, categoryLabel,
  closeWorkItem, fetchExpenses, fetchReadings, fetchWorkItems, hoursLabel, kmLabel,
  maintenanceDue, opsStatus, saveWorkItem, unitSubtitle, unitTitle,
  type Expense, type MeterReading, type WorkItem,
} from "@/lib/fleet/v2";

const FLEET_REF_LABELS: Record<string, string> = {
  entretien: "Entretien", reparation: "Réparation",
  inspection: "Inspection", echeance: "Échéance",
};

const TABS = [
  { key: "resume", label: "Résumé" },
  { key: "infos", label: "Informations" },
  { key: "entretien", label: "Entretien" },
  { key: "reparations", label: "Réparations" },
  { key: "pieces", label: "Pièces" },
  { key: "inspections", label: "Inspections" },
  { key: "historique", label: "Historique" },
  { key: "depenses", label: "Dépenses" },
  { key: "compteurs", label: "Compteurs" },
  { key: "couts", label: "Coûts" },
  { key: "afaire", label: "À faire" },
  { key: "alertes", label: "Alertes" },
  { key: "documents", label: "Documents" },
  { key: "calendrier", label: "Calendrier" },
  { key: "journal", label: "Journal" },
] as const;

export default function AdminFleetVehicle() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const tenant = useFleetTenant(isAdmin, isReady && !roleLoading);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "resume";

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [maint, setMaint] = useState<Maintenance[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [alerts, setAlerts] = useState<CrmNotification[]>([]);
  const [journal, setJournal] = useState<FleetLogEntry[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [meterReadings, setMeterReadings] = useState<MeterReading[]>([]);
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; record?: Expense | null }>({ open: false });
  const [workDialog, setWorkDialog] = useState<{ open: boolean; record?: WorkItem | null }>({ open: false });
  const [readingDialog, setReadingDialog] = useState(false);
  const [complete, setComplete] = useState<
    { kind: "entretien"; record: Maintenance } | { kind: "reparation"; record: Repair } | null>(null);
  const [readings, setReadings] = useState({ km: "", hours: "" });
  const [loading, setLoading] = useState(true);

  const [vehicleDialog, setVehicleDialog] = useState(false);
  const [maintDialog, setMaintDialog] = useState<{ open: boolean; record?: Maintenance | null }>({ open: false });
  const [repairDialog, setRepairDialog] = useState<{ open: boolean; record?: Repair | null }>({ open: false });
  const [inspDialog, setInspDialog] = useState<{ open: boolean; record?: Inspection | null }>({ open: false });

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, d, m, r, i, p, c, e, w, x, mr] = await Promise.all([
        supabase.from("trucks").select("*").eq("id", id).maybeSingle(),
        supabase.from("drivers").select("*").order("name"),
        fetchMaintenance(id), fetchRepairs(id), fetchInspections(id),
        fetchParts(id), fetchCosts(id), fetchFleetEvents(id),
        fetchWorkItems(id), fetchExpenses(id), fetchReadings(id),
      ]);
      setWorkItems(w); setExpenses(x); setMeterReadings(mr);
      setVehicle((v.data as Vehicle) ?? null);
      setDrivers((d.data as Driver[]) ?? []);
      setMaint(m); setRepairs(r); setInspections(i); setParts(p); setCosts(c); setEvents(e);
      const veh = (v.data as Vehicle) ?? null;
      setReadings({
        km: veh?.odometer_km != null ? String(veh.odometer_km) : "",
        hours: veh?.engine_hours != null ? String(veh.engine_hours) : "",
      });
      // Alertes : centre de notifications EXISTANT, filtré sur les éléments de ce véhicule.
      const refIds = new Set<string>([id, ...m.map((x) => x.id), ...r.map((x) => x.id), ...i.map((x) => x.id)]);
      const { data: notif } = await supabase
        .from("crm_notifications").select("*").like("dedupe_key", "fleet:%")
        .order("created_at", { ascending: false }).limit(200);
      setAlerts(((notif ?? []) as unknown as CrmNotification[])
        .filter((n) => [...refIds].some((rid) => n.dedupe_key.includes(rid))));
      setJournal(await fetchChangeLog([...refIds]));
    } catch (err) {
      toast({ title: "Chargement impossible", description: (err as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [id, toast]);

  useEffect(() => { if (isAdmin && id) load(); }, [isAdmin, id, load]);

  const todo = useMemo(() => buildTodo(maint, repairs, inspections), [maint, repairs, inspections]);
  const totals = useMemo(() => costTotals(costs), [costs]);
  const openWork = useMemo(
    () => workItems.filter((w) => w.status !== "termine" && w.status !== "annule"), [workItems]);
  const openRepairs = useMemo(
    () => repairs.filter((r) => r.status !== "terminee" && r.status !== "annulee"), [repairs]);
  const nextMaint = useMemo(() => {
    const rows = maint.filter((m) => m.next_due_date || m.next_due_km || m.next_due_hours);
    for (const m of rows) {
      const d = maintenanceDue(m, vehicle);
      if (d.reason) return `${m.next_type || m.maintenance_type} — ${d.reason}`;
    }
    const first = rows[0];
    return first ? `${first.next_type || first.maintenance_type} — ${dateLabel(first.next_due_date)}` : null;
  }, [maint, vehicle]);

  if (!isReady || roleLoading) return <FullPageState title="Chargement du véhicule" />;
  if (!isAdmin) return null;
  if (!loading && !vehicle) return <FullPageState title="Véhicule introuvable" message="Ce véhicule n'existe plus." showSpinner={false} />;

  const convert = async (insp: Inspection) => {
    try {
      await inspectionToRepair(insp, insp.comment || "Problème signalé à l'inspection");
      toast({ title: "Réparation créée", description: "Ajoutée à « À faire » et aux notifications." });
      load();
    } catch (e) {
      toast({ title: "Action impossible", description: (e as Error).message, variant: "destructive" });
    }
  };

  const Info = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
    <div>
      <div className="text-xs text-muted-foreground font-body">{label}</div>
      <div className="text-sm font-display font-semibold">{value ?? "—"}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-16">
      <PageHeader
        above={<SupportBanner tenant={tenant} />}
        maxWidthClass="max-w-5xl"
        backTo="/admin/flotte?tab=vehicules"
        backLabel="Retour à la flotte"
        title={unitTitle(vehicle)}
        subtitle={[unitSubtitle(vehicle), kmLabel(vehicle?.odometer_km as number | null),
          hoursLabel(vehicle?.engine_hours as number | null)].filter(Boolean).join(" • ")}
        badge={vehicle ? (
          <span className={`text-[10px] px-2 py-0.5 rounded font-display shrink-0 ${TONE_CLASS[opsStatus(vehicle).tone]}`}>
            {opsStatus(vehicle).label}
          </span>
        ) : undefined}
        actions={
          <Button size="sm" variant="outline" onClick={() => setVehicleDialog(true)}>
            <Pencil className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Modifier</span>
          </Button>
        }
        tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
        activeTab={tab}
        onTabChange={(k) => setParams({ tab: k }, { replace: true })}
      />


      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMaintDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Entretien</Button>
          <Button size="sm" variant="outline" onClick={() => setRepairDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Réparation</Button>
          <Button size="sm" variant="outline" onClick={() => setInspDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Inspection</Button>
          <Button size="sm" variant="outline" onClick={() => setExpenseDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Dépense</Button>
          <Button size="sm" variant="outline" onClick={() => setReadingDialog(true)}><Plus className="w-4 h-4 mr-1" /> Relevé</Button>
        </div>

        {tab === "infos" && vehicle && (
          <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Info label="Nom" value={vehicle.name} />
            <Info label="Numéro d'unité" value={vehicle.unit_number} />
            <Info label="Type" value={TRUCK_TYPE_LABELS[vehicle.type] ?? vehicle.type} />
            <Info label="Marque" value={vehicle.make} />
            <Info label="Modèle" value={vehicle.model} />
            <Info label="Année" value={vehicle.year} />
            <Info label="Plaque" value={vehicle.plate} />
            <Info label="NIV" value={vehicle.vin} />
            <Info label="Kilométrage" value={vehicle.odometer_km ? `${Number(vehicle.odometer_km).toLocaleString("fr-CA")} km` : null} />
            <Info label="Heures moteur" value={vehicle.engine_hours} />
            <Info label="Statut" value={SERVICE_STATUS_LABELS[vehicle.service_status ?? "en_service"]} />
            <Info label="Ajouté le" value={dateLabel(vehicle.created_at)} />
            <div className="col-span-2 sm:col-span-3"><Info label="Notes" value={vehicle.notes} /></div>
            <div className="col-span-2 sm:col-span-3 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground font-body mb-2">Mise à jour rapide des relevés</div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <div className="text-[11px] text-muted-foreground font-body">Kilométrage</div>
                  <Input inputMode="numeric" className="w-36" value={readings.km}
                    onChange={(e) => setReadings({ ...readings, km: e.target.value })} />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-body">Heures moteur</div>
                  <Input inputMode="numeric" className="w-36" value={readings.hours}
                    onChange={(e) => setReadings({ ...readings, hours: e.target.value })} />
                </div>
                <Button size="sm" onClick={async () => {
                  try {
                    await updateVehicleReadings(id, readings.km ? Number(readings.km) : null,
                      readings.hours ? Number(readings.hours) : null);
                    toast({ title: "Relevés mis à jour" });
                    load();
                  } catch (e) {
                    toast({ title: "Mise à jour impossible", description: (e as Error).message, variant: "destructive" });
                  }
                }}>Enregistrer</Button>
              </div>
            </div>
          </div>
        )}

        {tab === "resume" && vehicle && (
          <div className="space-y-4">
            {opsStatus(vehicle).value === "au_garage" && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="font-display font-bold mb-2">Mode « Au garage » — travaux ouverts</div>
                {openWork.length || openRepairs.length ? (
                  <ul className="space-y-1 text-sm font-body">
                    {openRepairs.map((r) => <li key={r.id}>Réparation — {r.problem} ({REPAIR_STATUS_LABELS[r.status] ?? r.status})</li>)}
                    {openWork.map((w) => <li key={w.id}>Travail — {w.title}</li>)}
                  </ul>
                ) : <p className="text-sm font-body">Aucun travail ouvert.</p>}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Info label="Numéro d'unité" value={vehicle.unit_number} />
              <Info label="Marque / modèle" value={[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || null} />
              <Info label="Type" value={categoryLabel(vehicle.category)} />
              <Info label="Plaque" value={vehicle.plate} />
              <Info label="Kilométrage" value={kmLabel(vehicle.odometer_km as number | null)} />
              <Info label="Heures moteur" value={hoursLabel(vehicle.engine_hours as number | null)} />
              <Info label="Statut opérationnel" value={opsStatus(vehicle).label} />
              <Info label="Statut administratif" value={adminStatusLabel(vehicle)} />
              <Info label="Prochain entretien" value={nextMaint} />
              <Info label="Réparations ouvertes" value={openRepairs.length} />
              <Info label="À surveiller" value={openWork.filter((w) => w.priority !== "urgente").length} />
              <Info label="Coûts (12 mois)" value={money(totals.thisYear)} />
            </div>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-bold">Travaux à faire</h2>
                <Button size="sm" variant="outline" onClick={() => setWorkDialog({ open: true })}>
                  <Plus className="w-4 h-4 mr-1" /> Ajouter
                </Button>
              </div>
              {openWork.length ? openWork.map((w) => (
                <div key={w.id} className="py-2 border-b border-border last:border-0 flex items-start justify-between gap-3">
                  <button className="text-left min-w-0" onClick={() => setWorkDialog({ open: true, record: w })}>
                    <div className="text-sm font-display font-semibold truncate">{w.title}</div>
                    <div className="text-xs text-muted-foreground font-body">
                      {PRIORITY_LABELS[w.priority] ?? w.priority} · {WORK_STATUS_LABELS[w.status] ?? w.status}
                      {" · "}créé le {dateLabel(w.created_at)}
                      {w.scheduled_date ? ` · prévu le ${dateLabel(w.scheduled_date)}` : ""}
                      {" · "}source : {w.source}
                      {(w.occurrences ?? 1) > 1 ? ` · signalé ${w.occurrences} fois` : ""}
                    </div>
                  </button>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={async () => {
                      await saveWorkItem({ ...w, status: "en_cours" } as never);
                      setRepairDialog({ open: true, record: null });
                    }}>En réparation</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await closeWorkItem(w.id); load(); }}>Terminé</Button>
                  </div>
                </div>
              )) : <p className="text-sm font-body text-muted-foreground">Aucun travail en attente.</p>}
            </section>
          </div>
        )}

        {tab === "depenses" && (
          <div className="space-y-3">
            <Button size="sm" variant="outline" onClick={() => setExpenseDialog({ open: true })}>
              <Plus className="w-4 h-4 mr-1" /> Ajouter une dépense
            </Button>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {expenses.map((x) => (
                <button key={x.id} onClick={() => setExpenseDialog({ open: true, record: x })}
                  className="w-full text-left p-3 flex justify-between gap-3 hover:bg-secondary/50">
                  <div className="min-w-0">
                    <div className="text-sm font-display font-semibold truncate">
                      {EXPENSE_LABELS[x.category] ?? x.category}{x.description ? ` — ${x.description}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground font-body">{dateLabel(x.spent_on)}{x.supplier ? ` · ${x.supplier}` : ""}</div>
                  </div>
                  <span className="text-sm font-display shrink-0">{money(x.amount)}</span>
                </button>
              ))}
              {!expenses.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucune dépense pour ce véhicule.</p>}
            </div>
          </div>
        )}

        {tab === "compteurs" && (
          <div className="space-y-3">
            <Button size="sm" variant="outline" onClick={() => setReadingDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nouveau relevé
            </Button>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {meterReadings.map((r) => (
                <div key={r.id} className="p-3 flex justify-between gap-3">
                  <div>
                    <div className="text-sm font-body">
                      {[kmLabel(r.odometer_km as number | null), hoursLabel(r.engine_hours as number | null)].filter(Boolean).join(" • ") || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dateLabel(r.read_at)} · source : {r.source}{r.is_correction ? " · correction" : ""}
                    </div>
                  </div>
                </div>
              ))}
              {!meterReadings.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucun relevé enregistré.</p>}
            </div>
          </div>
        )}

        {tab === "documents" && (
          <div className="rounded-xl border border-border bg-card p-4">
            <FleetDocuments ownerType="fleet_vehicle" ownerId={id} label="Documents du véhicule" />
          </div>
        )}

        {tab === "alertes" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {alerts.map((n) => (
              <div key={n.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-body truncate">{n.title}</div>
                  <div className="text-xs text-muted-foreground">{dateLabel(n.created_at)} · {n.status === "done" ? "Résolue" : n.status === "unread" ? "Non lue" : "Lue"}</div>
                </div>
                {n.status !== "done" && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    await setStatus(n.id, "done");
                    load();
                  }}>Marquer résolue</Button>
                )}
              </div>
            ))}
            {!alerts.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucune alerte pour ce véhicule.</p>}
          </div>
        )}

        {tab === "entretien" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {maint.map((m) => (
              <div key={m.id} className="p-3 hover:bg-secondary/50">
                <div className="flex justify-between gap-3 cursor-pointer" onClick={() => setMaintDialog({ open: true, record: m })}>
                  <div className="min-w-0">
                    <div className="text-sm font-display font-semibold">{m.maintenance_type}</div>
                    <div className="text-xs text-muted-foreground font-body">{dateLabel(m.performed_on)} · {m.work_done || "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-display">{money(m.cost)}</div>
                    {m.next_due_date && <div className="text-xs text-muted-foreground">Prochain : {dateLabel(m.next_due_date)}</div>}
                    {m.next_due_km && <div className="text-xs text-muted-foreground">{Number(m.next_due_km).toLocaleString("fr-CA")} km</div>}
                  </div>
                </div>
                {(m.next_due_date || m.next_due_km || m.next_due_hours) && (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => setComplete({ kind: "entretien", record: m })}>
                      Marquer comme terminé
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!maint.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucun entretien.</p>}
          </div>
        )}

        {tab === "reparations" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {repairs.map((r) => (
              <div key={r.id} className="p-3 hover:bg-secondary/50">
                <div className="flex justify-between gap-3 cursor-pointer" onClick={() => setRepairDialog({ open: true, record: r })}>
                  <div className="min-w-0">
                    <div className="text-sm font-display font-semibold truncate">{r.problem}</div>
                    <div className="text-xs text-muted-foreground font-body">{dateLabel(r.reported_on)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-display font-semibold ${r.priority === "urgente" ? "text-destructive" : "text-muted-foreground"}`}>
                      {PRIORITY_LABELS[r.priority] ?? r.priority}
                    </div>
                    <div className="text-xs text-muted-foreground">{REPAIR_STATUS_LABELS[r.status] ?? r.status}</div>
                  </div>
                </div>
                {r.status !== "terminee" && (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => setComplete({ kind: "reparation", record: r })}>
                      Marquer comme terminé
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!repairs.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucune réparation.</p>}
          </div>
        )}

        {tab === "pieces" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {parts.map((p) => (
              <div key={p.id} className="p-3 flex justify-between gap-3">
                <div>
                  <div className="text-sm font-display font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground font-body">{p.part_number || "—"} · {dateLabel(p.installed_on)}</div>
                </div>
                <span className="text-sm font-display">{money(Number(p.quantity) * Number(p.unit_cost))}</span>
              </div>
            ))}
            {!parts.length && <p className="p-4 text-sm text-muted-foreground font-body">Les pièces remplacées lors des entretiens et réparations apparaîtront ici.</p>}
          </div>
        )}

        {tab === "inspections" && (
          <div className="space-y-3">
            {inspections.map((i) => {
              const checks = (i.checks ?? {}) as Record<string, CheckValue>;
              return (
                <div key={i.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="text-sm font-display font-semibold">{dateLabel(i.inspected_on)}</div>
                      <div className="text-xs text-muted-foreground font-body">{i.comment || "—"}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setInspDialog({ open: true, record: i })}>Ouvrir</Button>
                      {i.has_problem && !repairs.some((r) => r.inspection_id === i.id) && (
                        <Button size="sm" onClick={() => convert(i)}>Créer une réparation</Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(checks).map(([k, v]) => (
                      <span key={k} className={`text-[11px] px-2 py-0.5 rounded font-body ${
                        v === "probleme" ? "bg-destructive/15 text-destructive"
                          : v === "surveiller" ? "bg-amber-500/15 text-amber-600" : "bg-secondary text-muted-foreground"}`}>
                        {k} : {CHECK_LABELS[v]}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {!inspections.length && <p className="text-sm text-muted-foreground font-body">Aucune inspection.</p>}
          </div>
        )}

        {tab === "historique" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {[
              ...maint.map((m) => ({ date: m.performed_on, label: `Entretien — ${m.maintenance_type}`, amount: Number(m.cost || 0) })),
              ...repairs.map((r) => ({ date: r.completed_date ?? r.reported_on, label: `Réparation — ${r.problem}`, amount: Number(r.cost_actual ?? r.cost_estimated ?? 0) })),
              ...inspections.map((i) => ({ date: i.inspected_on, label: `Inspection${i.has_problem ? " (problème)" : ""}`, amount: 0 })),
              ...parts.map((p) => ({ date: p.installed_on, label: `Pièce — ${p.name}`, amount: Number(p.quantity) * Number(p.unit_cost) })),
            ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).map((row, idx) => (
              <div key={idx} className="p-3 flex justify-between gap-3">
                <div>
                  <div className="text-sm font-body">{row.label}</div>
                  <div className="text-xs text-muted-foreground">{dateLabel(row.date)}</div>
                </div>
                {row.amount > 0 && <span className="text-sm font-display">{money(row.amount)}</span>}
              </div>
            ))}
          </div>
        )}

        {tab === "couts" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[["Mois", totals.thisMonth], ["Année", totals.thisYear], ["Total", totals.total]].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground font-body">{l}</div>
                  <div className="text-xl font-display font-bold">{money(Number(v))}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {costs.map((c) => (
                <div key={c.id} className="p-3 flex justify-between gap-3">
                  <div className="text-sm font-body">{c.cost_type === "entretien" ? "Entretien" : "Réparation"} · {dateLabel(c.incurred_on)}</div>
                  <span className="text-sm font-display">{money(c.amount)}</span>
                </div>
              ))}
              {!costs.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucun coût enregistré.</p>}
            </div>
          </div>
        )}

        {tab === "afaire" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {todo.map((t) => (
              <div key={`${t.kind}-${t.id}`} className="p-3 flex justify-between gap-3">
                <div>
                  <div className="text-sm font-body">{t.work}</div>
                  <div className="text-xs text-muted-foreground">{dateLabel(t.date)}{t.km ? ` · ${t.km.toLocaleString("fr-CA")} km` : ""}</div>
                </div>
                <span className={`text-xs font-display font-semibold ${t.late ? "text-destructive" : "text-muted-foreground"}`}>{t.status}</span>
              </div>
            ))}
            {!todo.length && <p className="p-4 text-sm text-muted-foreground font-body">Rien à faire pour ce véhicule.</p>}
          </div>
        )}

        {tab === "calendrier" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {events.filter((e) => e.status !== "termine" && e.status !== "annule").map((e) => (
              <Link key={e.id} to={`/admin/calendrier?event=${e.id}`} className="p-3 flex justify-between gap-3 hover:bg-secondary/50">
                <div>
                  <div className="text-sm font-body">{e.title}</div>
                  <div className="text-xs text-muted-foreground">{dateLabel(e.start_at)} · {FLEET_REF_LABELS[e.fleet_ref_type ?? ""] ?? e.fleet_ref_type}</div>
                </div>
                <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
            {!events.filter((e) => e.status !== "termine" && e.status !== "annule").length && <p className="p-4 text-sm text-muted-foreground font-body">Aucun événement au calendrier pour ce véhicule.</p>}
          </div>
        )}
        {tab === "journal" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {journal.map((e) => (
              <div key={e.id} className="p-3">
                <div className="text-sm font-body flex flex-wrap items-center gap-2">
                  {logSentence(e)}
                  {e.origin === "support_vrac_quebec" && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      Support Vrac Québec
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dateLabel(e.created_at)}{e.actor_email ? ` · ${e.actor_email}` : ""}
                  {e.origin === "support_vrac_quebec" ? "" : " · Utilisateur de l'entreprise"}
                </div>
              </div>
            ))}
            {!journal.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucune modification enregistrée.</p>}
          </div>
        )}
      </main>

      <ExpenseDialog open={expenseDialog.open} onOpenChange={(o) => setExpenseDialog({ open: o })}
        vehicles={vehicle ? [vehicle] : []} vehicleId={id} record={expenseDialog.record} onSaved={load} />
      <WorkItemDialog open={workDialog.open} onOpenChange={(o) => setWorkDialog({ open: o })}
        vehicles={vehicle ? [vehicle] : []} vehicleId={id} record={workDialog.record} onSaved={load} />
      <ReadingDialog open={readingDialog} onOpenChange={setReadingDialog} vehicle={vehicle} onSaved={load} />
      <CompleteDialog target={complete} onOpenChange={(o) => !o && setComplete(null)} onSaved={load} />
      <VehicleDialog
        open={vehicleDialog}
        onOpenChange={setVehicleDialog}
        vehicle={vehicle}
        onSaved={async () => {
          // Après une suppression, la fiche n'existe plus : on revient à la liste.
          const { data } = await supabase.from("trucks").select("id").eq("id", id!).maybeSingle();
          if (!data) navigate("/admin/flotte?tab=vehicules");
          else load();
        }}
      />
      <MaintenanceDialog open={maintDialog.open} onOpenChange={(o) => setMaintDialog({ open: o })}
        vehicles={vehicle ? [vehicle] : []} vehicleId={id} record={maintDialog.record} onSaved={load} />
      <RepairDialog open={repairDialog.open} onOpenChange={(o) => setRepairDialog({ open: o })}
        vehicles={vehicle ? [vehicle] : []} vehicleId={id} record={repairDialog.record} onSaved={load} />
      <InspectionDialog open={inspDialog.open} onOpenChange={(o) => setInspDialog({ open: o })}
        vehicles={vehicle ? [vehicle] : []} drivers={drivers} vehicleId={id} record={inspDialog.record} onSaved={load} />
    </div>
  );
}
