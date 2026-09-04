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
  updateVehicleReadings, vehicleLabel,
  type CheckValue, type Cost, type FleetEvent, type Inspection, type Maintenance,
  type Part, type Repair, type Vehicle,
} from "@/lib/fleet/api";
import type { Driver } from "@/lib/calendar-utils";
import { useToast } from "@/hooks/use-toast";
import FleetDocuments from "@/components/fleet/FleetDocuments";
import { Input } from "@/components/ui/input";
import { setStatus, type CrmNotification } from "@/lib/notifications/api";

const TABS = [
  { key: "infos", label: "Informations" },
  { key: "entretien", label: "Entretien" },
  { key: "reparations", label: "Réparations" },
  { key: "pieces", label: "Pièces" },
  { key: "inspections", label: "Inspections" },
  { key: "historique", label: "Historique" },
  { key: "couts", label: "Coûts" },
  { key: "afaire", label: "À faire" },
  { key: "alertes", label: "Alertes" },
  { key: "documents", label: "Documents" },
  { key: "calendrier", label: "Calendrier" },
] as const;

export default function AdminFleetVehicle() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "infos";

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [maint, setMaint] = useState<Maintenance[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [alerts, setAlerts] = useState<CrmNotification[]>([]);
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
      const [v, d, m, r, i, p, c, e] = await Promise.all([
        supabase.from("trucks").select("*").eq("id", id).maybeSingle(),
        supabase.from("drivers").select("*").order("name"),
        fetchMaintenance(id), fetchRepairs(id), fetchInspections(id),
        fetchParts(id), fetchCosts(id), fetchFleetEvents(id),
      ]);
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
    } catch (err) {
      toast({ title: "Chargement impossible", description: (err as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [id, toast]);

  useEffect(() => { if (isAdmin && id) load(); }, [isAdmin, id, load]);

  const todo = useMemo(() => buildTodo(maint, repairs, inspections), [maint, repairs, inspections]);
  const totals = useMemo(() => costTotals(costs), [costs]);

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
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/admin/flotte?tab=vehicules" className="p-2 -ml-2 rounded-lg hover:bg-secondary" aria-label="Retour à la flotte">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">{vehicleLabel(vehicle)}</h1>
          </div>
          <Button size="sm" variant="outline" onClick={() => setVehicleDialog(true)}>
            <Pencil className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Modifier</span>
          </Button>
        </div>
        <div className="max-w-5xl mx-auto px-3 sm:px-6 overflow-x-auto">
          <div className="flex gap-1 pb-2 min-w-max">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setParams({ tab: t.key }, { replace: true })}
                className={`px-3 py-2 rounded-lg text-sm font-body whitespace-nowrap ${
                  tab === t.key ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-secondary"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMaintDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Entretien</Button>
          <Button size="sm" variant="outline" onClick={() => setRepairDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Réparation</Button>
          <Button size="sm" variant="outline" onClick={() => setInspDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Inspection</Button>
        </div>

        {tab === "infos" && vehicle && (
          <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Info label="Nom" value={vehicle.name} />
            <Info label="Numéro d'unité" value={vehicle.unit_number} />
            <Info label="Type" value={vehicle.type} />
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
              <button key={m.id} onClick={() => setMaintDialog({ open: true, record: m })} className="w-full text-left p-3 hover:bg-secondary/50">
                <div className="flex justify-between gap-3">
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
              </button>
            ))}
            {!maint.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucun entretien.</p>}
          </div>
        )}

        {tab === "reparations" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {repairs.map((r) => (
              <button key={r.id} onClick={() => setRepairDialog({ open: true, record: r })} className="w-full text-left p-3 hover:bg-secondary/50">
                <div className="flex justify-between gap-3">
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
              </button>
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
                      {i.has_problem && <Button size="sm" onClick={() => convert(i)}>Créer une réparation</Button>}
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
            {events.map((e) => (
              <Link key={e.id} to={`/admin/calendrier?event=${e.id}`} className="p-3 flex justify-between gap-3 hover:bg-secondary/50">
                <div>
                  <div className="text-sm font-body">{e.title}</div>
                  <div className="text-xs text-muted-foreground">{dateLabel(e.start_at)} · {e.fleet_ref_type}</div>
                </div>
                <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
            {!events.length && <p className="p-4 text-sm text-muted-foreground font-body">Aucun événement au calendrier pour ce véhicule.</p>}
          </div>
        )}
      </main>

      <VehicleDialog open={vehicleDialog} onOpenChange={setVehicleDialog} vehicle={vehicle} onSaved={load} />
      <MaintenanceDialog open={maintDialog.open} onOpenChange={(o) => setMaintDialog({ open: o })}
        vehicles={vehicle ? [vehicle] : []} vehicleId={id} record={maintDialog.record} onSaved={load} />
      <RepairDialog open={repairDialog.open} onOpenChange={(o) => setRepairDialog({ open: o })}
        vehicles={vehicle ? [vehicle] : []} vehicleId={id} record={repairDialog.record} onSaved={load} />
      <InspectionDialog open={inspDialog.open} onOpenChange={(o) => setInspDialog({ open: o })}
        vehicles={vehicle ? [vehicle] : []} drivers={drivers} vehicleId={id} record={inspDialog.record} onSaved={load} />
    </div>
  );
}
