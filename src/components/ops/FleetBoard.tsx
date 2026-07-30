// Flotte : camions et chauffeurs, état en temps réel et charge du jour.
import { Delivery, OpsRefs, TRUCK_STATUSES, DRIVER_STATUSES, truckStatusMeta, todayISO } from "@/lib/jsc/operations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Truck, User } from "lucide-react";

interface Props {
  deliveries: Delivery[];
  refs: OpsRefs;
  onChanged: () => void;
}

export default function FleetBoard({ deliveries, refs, onChanged }: Props) {
  const today = todayISO();
  const todays = deliveries.filter((d) => d.scheduled_date === today);

  const setField = async (table: string, id: string, patch: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table as never) as any).update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Statut mis à jour"); onChanged(); }
  };

  const input = "px-2 py-1 text-[11px] rounded-lg border border-border bg-background";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase font-display font-bold text-muted-foreground mb-3">
          <Truck className="w-3.5 h-3.5" /> Camions ({refs.trucks.length})
        </div>
        <div className="space-y-2">
          {refs.trucks.map((t) => {
            const load = todays.filter((d) => d.truck_id === t.id);
            const meta = truckStatusMeta(t.operational_status);
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-display font-bold truncate">{t.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {t.capacity_tonnes ?? "?"} t · {load.length} livraison(s) aujourd'hui
                  </div>
                </div>
                <select value={t.operational_status} onChange={(e) => setField("jsc_trucks", t.id, { operational_status: e.target.value })} className={input}>
                  {TRUCK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            );
          })}
          {refs.trucks.length === 0 && <div className="text-xs text-muted-foreground">Aucun camion enregistré.</div>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase font-display font-bold text-muted-foreground mb-3">
          <User className="w-3.5 h-3.5" /> Chauffeurs ({refs.drivers.length})
        </div>
        <div className="space-y-2">
          {refs.drivers.map((d) => {
            const load = todays.filter((x) => x.driver_id === d.id);
            return (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-display font-bold truncate">{d.first_name} {d.last_name ?? ""}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {d.schedule || "Horaire non défini"} · {load.length} livraison(s) aujourd'hui
                  </div>
                </div>
                <select value={d.status ?? "disponible"} onChange={(e) => setField("jsc_drivers", d.id, { status: e.target.value })} className={input}>
                  {DRIVER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            );
          })}
          {refs.drivers.length === 0 && <div className="text-xs text-muted-foreground">Aucun chauffeur enregistré.</div>}
        </div>
      </div>
    </div>
  );
}