// Tableau de bord opérationnel : état réel de la journée en un coup d'œil.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Truck, Users, AlertTriangle, CalendarClock, DollarSign, PackageCheck, Clock } from "lucide-react";
import { money } from "@/lib/jsc/operations";

type Stats = Record<string, unknown>;

const Kpi = ({ icon: Icon, label, value, tone = "default" }: {
  icon: typeof Truck; label: string; value: string | number; tone?: "default" | "warn" | "good";
}) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-display font-bold text-muted-foreground">
      <Icon className={`w-3.5 h-3.5 ${tone === "warn" ? "text-destructive" : tone === "good" ? "text-primary" : ""}`} />
      {label}
    </div>
    <div className="mt-1 text-2xl font-display font-bold">{value}</div>
  </div>
);

export default function OpsDashboard({ companyId }: { companyId?: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.rpc as any)("jsc_ops_dashboard", { _company_id: companyId ?? null });
    setStats((data as Stats) ?? {});
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><Loader2 className="w-4 h-4 animate-spin" /> Chargement des opérations…</div>;
  }

  const n = (k: string) => Number(stats?.[k] ?? 0);
  const trend = (stats?.trend as { day: string; count: number }[] | undefined) ?? [];
  const max = Math.max(1, ...trend.map((t) => Number(t.count)));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={PackageCheck} label="Livraisons aujourd'hui" value={n("deliveries_today")} />
        <Kpi icon={CalendarClock} label="À planifier" value={n("to_plan")} tone={n("to_plan") ? "warn" : "default"} />
        <Kpi icon={Truck} label="Camions en route" value={`${n("trucks_busy")}/${n("trucks_total")}`} />
        <Kpi icon={Users} label="Chauffeurs actifs" value={`${n("drivers_busy")}/${n("drivers_total")}`} />
        <Kpi icon={Clock} label="Livraisons en retard" value={n("late")} tone={n("late") ? "warn" : "good"} />
        <Kpi icon={AlertTriangle} label="Incidents ouverts" value={n("open_incidents")} tone={n("open_incidents") ? "warn" : "good"} />
        <Kpi icon={PackageCheck} label="Livrées aujourd'hui" value={n("delivered_today")} tone="good" />
        <Kpi icon={DollarSign} label="Revenu du jour" value={money(stats?.revenue_today)} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-[11px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-3">
          Livraisons — 7 derniers jours
        </div>
        <div className="flex items-end gap-2 h-28">
          {trend.length === 0 && <div className="text-xs text-muted-foreground">Aucune donnée récente.</div>}
          {trend.map((t) => (
            <div key={t.day} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t bg-primary/80" style={{ height: `${(Number(t.count) / max) * 100}%`, minHeight: 3 }} />
              <div className="text-[9px] text-muted-foreground">{t.day.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}