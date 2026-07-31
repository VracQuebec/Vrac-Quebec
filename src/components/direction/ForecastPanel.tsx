// Moteur de prévision — ventes, volumes, livraisons, besoins en camions et chauffeurs.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CAD, invokeIntel, METRIC_LABELS, type ForecastRow } from "@/lib/jsc/intel";

export default function ForecastPanel({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("jsc_forecasts")
      .select("metric, period_month, predicted, low, high, confidence")
      .order("period_month");
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as ForecastRow[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const compute = async () => {
    setRunning(true);
    try {
      const res = await invokeIntel<{ forecasts: number }>("vqos-forecast", { company_id: companyId, months: 12 });
      toast.success(`${res.forecasts} prévision(s) calculée(s).`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setRunning(false); }
  };

  const byMetric = useMemo(() => {
    const map = new Map<string, ForecastRow[]>();
    rows.forEach((r) => map.set(r.metric, [...(map.get(r.metric) ?? []), r]));
    return map;
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Projection sur 12 mois : tendance linéaire et saisonnalité calculées sur l'historique réel des commandes et livraisons.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button size="sm" onClick={() => void compute()} disabled={running}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-1.5 h-4 w-4" />}
            Recalculer les prévisions
          </Button>
        </div>
      </div>

      {rows.length === 0 && !loading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Aucune prévision enregistrée. Lancez le calcul.
        </CardContent></Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {[...byMetric.entries()].map(([metric, data]) => {
          const chart = data.map((d) => ({
            mois: d.period_month.slice(0, 7),
            prevu: Number(d.predicted),
            bas: Number(d.low ?? d.predicted),
            haut: Number(d.high ?? d.predicted),
          }));
          const isMoney = metric === "sales";
          return (
            <Card key={metric}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {METRIC_LABELS[metric] ?? metric}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    fiabilité {data[0]?.confidence ?? 0} %
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  {isMoney ? (
                    <AreaChart data={chart}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="mois" fontSize={11} />
                      <YAxis fontSize={11} width={70} />
                      <Tooltip formatter={(v: number) => CAD(v)} />
                      <Area type="monotone" dataKey="prevu" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                    </AreaChart>
                  ) : (
                    <LineChart data={chart}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="mois" fontSize={11} />
                      <YAxis fontSize={11} width={45} allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="prevu" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="haut" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} />
                      <Line type="monotone" dataKey="bas" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}