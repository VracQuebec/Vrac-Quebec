// Tableau de bord Direction — chiffres réels, aucune valeur codée en dur.
import { AlertTriangle, Clock, PackageCheck, Percent, TrendingUp, Truck, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CAD, stars, type Entity, type ExecDashboard } from "@/lib/jsc/intel";

const Kpi = ({ label, value, sub, icon: Icon }: {
  label: string; value: string; sub?: string; icon: typeof Wallet;
}) => (
  <Card>
    <CardContent className="flex items-start justify-between gap-3 p-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <Icon className="h-5 w-5 shrink-0 text-primary" />
    </CardContent>
  </Card>
);

const Ranking = ({ title, rows }: { title: string; rows: Entity[] }) => (
  <Card>
    <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
    <CardContent className="space-y-1.5">
      {rows.length === 0 && <p className="text-xs text-muted-foreground">Aucune donnée pour l'instant.</p>}
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{r.name}</span>
          <span className="shrink-0 font-medium">{CAD(r.revenue)} <span className="text-xs text-muted-foreground">({r.orders})</span></span>
        </div>
      ))}
    </CardContent>
  </Card>
);

export default function DirectionOverview({ data }: { data: ExecDashboard }) {
  const cap = data.capacity;
  const freeTrucks = Math.max(0, (cap?.trucks_total ?? 0) - (cap?.trucks_busy ?? 0));
  const freeDrivers = Math.max(0, (cap?.drivers_total ?? 0) - (cap?.drivers_busy ?? 0));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="CA aujourd'hui" value={CAD(data.revenue?.today)} sub={`Mois : ${CAD(data.revenue?.month)}`} icon={Wallet} />
        <Kpi label="CA année" value={CAD(data.revenue?.year)} sub={`Impayé : ${CAD(data.revenue?.outstanding)}`} icon={TrendingUp} />
        <Kpi label="Profit estimé" value={CAD(data.profit?.profit)} sub={`Marge ${data.profit?.margin_pct ?? 0} %`} icon={Percent} />
        <Kpi label="Taux de conversion" value={`${data.conversion?.rate_pct ?? 0} %`}
          sub={`${data.conversion?.requests ?? 0} demandes → ${data.conversion?.orders ?? 0} commandes`} icon={PackageCheck} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Livraisons du jour" value={String(data.deliveries_today?.length ?? 0)} icon={Truck} />
        <Kpi label="Commandes en retard" value={String(data.late_orders?.length ?? 0)} icon={AlertTriangle} />
        <Kpi label="Capacité disponible" value={`${freeTrucks} camions`} sub={`${freeDrivers} chauffeurs libres`} icon={Users} />
        <Kpi label="Délai demande → soumission" value={`${data.delays?.avg_request_to_quote_hours ?? 0} h`}
          sub={`Acceptation : ${data.delays?.avg_quote_to_order_hours ?? 0} h`} icon={Clock} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Demandes à fort potentiel</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.hot_leads ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Aucune demande notée. Lancez la notation IA dans l'onglet « IA commerciale ».</p>
            )}
            {(data.hot_leads ?? []).map((l) => (
              <div key={l.id} className="rounded-lg border p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{l.request_number ?? "Demande"} — {l.city ?? "—"}</span>
                  <span className="text-sm text-primary">{stars(l.stars)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline">{l.priority}</Badge>
                  {l.client_type && <Badge variant="outline">{l.client_type}</Badge>}
                  {l.project_type && <Badge variant="outline">{l.project_type}</Badge>}
                  <span>Potentiel {CAD(l.potential_revenue)} · {Math.round(l.win_probability)} % de vente</span>
                  {l.recommended_rep_name && <span>· {l.recommended_rep_name}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Livraisons du jour</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {(data.deliveries_today ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Aucune livraison planifiée aujourd'hui.</p>
            )}
            {(data.deliveries_today ?? []).map((d) => {
              const row = d as { id: string; delivery_number?: string; city?: string; status?: string; scheduled_time?: string };
              return (
                <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{row.delivery_number ?? "—"} · {row.city ?? "—"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{row.scheduled_time ?? ""} {row.status}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Ranking title="Meilleurs clients" rows={data.top_clients ?? []} />
        <Ranking title="Meilleurs vendeurs" rows={data.top_reps ?? []} />
        <Ranking title="Meilleurs fournisseurs" rows={data.top_suppliers ?? []} />
        <Ranking title="Meilleurs transporteurs" rows={data.top_carriers ?? []} />
      </div>

      {(data.late_orders ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-destructive">Commandes en retard</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {(data.late_orders ?? []).map((o) => {
              const row = o as { id: string; order_number?: string; status?: string; scheduled_date?: string; total?: number };
              return (
                <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{row.order_number ?? "—"} · prévue le {row.scheduled_date}</span>
                  <span className="shrink-0">{CAD(row.total)} <Badge variant="outline">{row.status}</Badge></span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}