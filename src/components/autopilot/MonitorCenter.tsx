// Surveillance temps réel — alertes automatiques détectées par le moteur de veille.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, RadioTower, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CAD, invokeIntel } from "@/lib/jsc/intel";

type Alert = {
  id: string; code: string; severity: string; title: string; detail: string | null;
  entity_type: string | null; impact_amount: number; status: string; created_at: string;
};

const SEV: Record<string, "destructive" | "secondary" | "outline"> = {
  critical: "destructive", warning: "secondary", info: "outline",
};

export default function MonitorCenter({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("jsc_monitor_alerts").select("*")
      .order("severity", { ascending: true }).order("created_at", { ascending: false }).limit(120);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as unknown as Alert[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const scan = async () => {
    setScanning(true);
    try {
      const res = await invokeIntel<{ detected: number; created: number; resolved: number }>(
        "vqos-monitor", { company_id: companyId },
      );
      toast.success(`${res.detected} anomalie(s) · ${res.created} nouvelle(s) · ${res.resolved} résolue(s)`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setScanning(false); }
  };

  const resolve = async (a: Alert) => {
    const { error } = await supabase.from("jsc_monitor_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", a.id);
    if (error) toast.error(error.message); else await load();
  };

  const open = rows.filter((r) => r.status === "open");
  const impact = open.reduce((s, r) => s + Number(r.impact_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {open.length} alerte(s) ouverte(s) · impact estimé {CAD(impact)}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button size="sm" onClick={() => void scan()} disabled={scanning}>
            {scanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RadioTower className="mr-1.5 h-4 w-4" />}
            Lancer une surveillance
          </Button>
        </div>
      </div>

      {loading && !rows.length && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      {!loading && !open.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">Aucune anomalie détectée.</p>
      )}

      <div className="space-y-2">
        {open.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <Badge variant={SEV[a.severity] ?? "outline"}>{a.severity}</Badge>
                  <Badge variant="outline">{a.code}</Badge>
                  {a.impact_amount > 0 && <span className="text-sm font-semibold">{CAD(a.impact_amount)}</span>}
                </div>
                <p className="font-medium">{a.title}</p>
                {a.detail && <p className="text-sm text-muted-foreground">{a.detail}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => void resolve(a)}>
                <Check className="mr-1.5 h-4 w-4" /> Résoudre
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
