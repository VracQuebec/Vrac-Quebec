// Centre de contrôle — santé globale et indicateurs temps réel.
import { Activity, AlertTriangle, Brain, DollarSign, Gauge, PackageCheck, Percent, Timer, TrendingUp, Truck } from "lucide-react";
import { CAD, NUM, RISK_LEVELS, type OrchControl } from "@/lib/jsc/orchestrator";

const Card = ({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
    <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
    {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
  </div>
);

export default function ControlCenter({ data }: { data: OrchControl }) {
  const k = data.kpis;
  const health = data.health_score;
  const healthTone = health >= 80 ? "text-primary" : health >= 60 ? "text-yellow-600" : "text-destructive";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 md:col-span-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Gauge className="h-4 w-4" />Santé globale</div>
          <div className={`mt-2 text-5xl font-black ${healthTone}`}>{NUM(health)}</div>
          <div className="mt-2 h-2 w-full rounded-full bg-secondary">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, health))}%` }} />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {data.risks.open} risque(s) ouvert(s) · {data.rules.active} règle(s) active(s) · {data.events_24h} événement(s) 24 h
          </div>
        </div>
        <div className="grid gap-4 md:col-span-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card icon={DollarSign} label="CA du jour" value={CAD(k.revenue_today)} hint={`Mois : ${CAD(k.revenue_month)}`} />
          <Card icon={TrendingUp} label="Bénéfice 90 j" value={CAD(k.profit_90d)} hint={`CA 90 j : ${CAD(k.revenue_90d)}`} />
          <Card icon={Percent} label="Marge moyenne" value={`${NUM(k.avg_margin_pct, 1)} %`} hint={`Conversion : ${NUM(k.conversion_pct, 1)} %`} />
          <Card icon={PackageCheck} label="Commandes ouvertes" value={NUM(k.open_orders)} hint={`${NUM(k.requests_90d)} demandes 90 j`} />
          <Card icon={Truck} label="Capacité utilisée" value={`${NUM(k.capacity_used_pct, 1)} %`} hint={`${NUM(k.deliveries_90d)} livraisons 90 j`} />
          <Card icon={Timer} label="Livraisons en retard" value={NUM(k.deliveries_late)} hint={`À recevoir : ${CAD(k.outstanding)}`} />
          <Card icon={Activity} label="Coût moyen / tonne" value={CAD(k.cost_per_tonne)} hint={`${NUM(k.tonnes_90d, 1)} t sur 90 j`} />
          <Card icon={Activity} label="Coût moyen / km" value={CAD(k.cost_per_km)} hint={`Par livraison : ${CAD(k.cost_per_delivery)}`} />
          <Card icon={Brain} label="Performance IA" value={CAD(k.ai_savings)} hint={`${NUM(k.ai_pending)} optimisation(s) en attente · ${NUM(k.ai_decisions_7d)} décision(s) 7 j`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-destructive" />Risques prioritaires</h3>
          {data.top_risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun risque ouvert détecté.</p>
          ) : (
            <ul className="space-y-2">
              {data.top_risks.slice(0, 6).map((r) => {
                const lvl = RISK_LEVELS[r.level] ?? RISK_LEVELS.low;
                return (
                  <li key={r.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{r.title}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${lvl.className}`}>{lvl.label}</span>
                    </div>
                    {r.detail && <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" />Derniers événements</h3>
          {data.recent_events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun événement enregistré pour l'instant.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-auto text-sm">
              {data.recent_events.slice(0, 15).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5">
                  <span className="truncate">{e.label ?? e.event_type}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
