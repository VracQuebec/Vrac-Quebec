// Automatisation CRM et livraisons — règles paramétrables et journal d'exécution.
import { useCallback, useEffect, useState } from "react";
import { Loader2, PlayCircle, RefreshCw, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { invokeIntel, RULE_LABELS, type AutomationRun } from "@/lib/jsc/intel";

type Rule = { id?: string; code: string; label: string; is_active: boolean };

const DEFAULT_ORDER = Object.keys(RULE_LABELS);

export default function AutomationPanel({ companyId }: { companyId: string | null }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: dbRules }, { data: dbRuns }] = await Promise.all([
      supabase.from("jsc_automation_rules").select("id, code, label, is_active").is("archived_at", null),
      supabase.from("jsc_automation_runs")
        .select("id, rule_code, entity_type, entity_id, status, detail, executed_at")
        .order("executed_at", { ascending: false }).limit(60),
    ]);
    const map = new Map((dbRules ?? []).map((r) => [r.code, r as Rule]));
    setRules(DEFAULT_ORDER.map((code) => map.get(code) ?? { code, label: RULE_LABELS[code], is_active: true }));
    setRuns((dbRuns as AutomationRun[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (rule: Rule, active: boolean) => {
    setRules((prev) => prev.map((r) => (r.code === rule.code ? { ...r, is_active: active } : r)));
    const { error } = await supabase.from("jsc_automation_rules").upsert({
      id: rule.id, company_id: companyId, code: rule.code,
      label: RULE_LABELS[rule.code] ?? rule.code, trigger_event: rule.code, is_active: active,
    }, { onConflict: "company_id,code" });
    if (error) { toast.error(error.message); await load(); }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await invokeIntel<{ executed: number }>("vqos-automation-runner", {});
      toast.success(`${res.executed} action(s) automatique(s) exécutée(s).`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setRunning(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Demande → notation → soumission → relances 24 h / 72 h → commande → livraisons → assignation → facturation.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button size="sm" onClick={() => void runNow()} disabled={running}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-1.5 h-4 w-4" />}
            Exécuter maintenant
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><Workflow className="h-4 w-4" /> Règles automatiques</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rules.map((r) => (
              <div key={r.code} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <span className="text-sm">{RULE_LABELS[r.code] ?? r.label}</span>
                <Switch checked={r.is_active} onCheckedChange={(v) => void toggle(r, v)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Journal d'exécution</CardTitle></CardHeader>
          <CardContent className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {runs.length === 0 && <p className="text-xs text-muted-foreground">Aucune exécution enregistrée.</p>}
            {runs.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs">
                <div>
                  <p className="font-medium">{RULE_LABELS[r.rule_code] ?? r.rule_code}</p>
                  <p className="text-muted-foreground">{r.detail}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant={r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge>
                  <p className="mt-1 text-muted-foreground">
                    {new Date(r.executed_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}