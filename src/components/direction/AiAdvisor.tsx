// Conseiller IA — alertes, opportunités, risques et économies détectées automatiquement.
import { useCallback, useEffect, useState } from "react";
import { Brain, Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CAD, invokeIntel, type Insight } from "@/lib/jsc/intel";

const KIND_LABEL: Record<string, string> = {
  alert: "Alerte", opportunity: "Opportunité", risk: "Risque",
  saving: "Économie possible", recommendation: "Recommandation",
};
const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  info: "secondary", warning: "default", critical: "destructive",
};

export default function AiAdvisor({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("jsc_ai_insights")
      .select("id, kind, severity, title, body, impact_amount, created_at, status")
      .neq("status", "dismissed").order("created_at", { ascending: false }).limit(40);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as Insight[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const analyse = async () => {
    setRunning(true);
    try {
      const res = await invokeIntel<{ created: number }>("vqos-ai-advisor", { company_id: companyId });
      toast.success(`${res.created} constat(s) généré(s).`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setRunning(false); }
  };

  const dismiss = async (id: string) => {
    const { error } = await supabase.from("jsc_ai_insights").update({ status: "dismissed" }).eq("id", id);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Analyse quotidienne des ventes, marges, clients, fournisseurs, transporteurs, délais et erreurs.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button size="sm" onClick={() => void analyse()} disabled={running}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Brain className="mr-1.5 h-4 w-4" />}
            Lancer l'analyse IA
          </Button>
        </div>
      </div>

      {rows.length === 0 && !loading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Aucun constat pour l'instant. Lancez l'analyse IA.
        </CardContent></Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((i) => (
          <Card key={i.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div>
                <CardTitle className="text-sm">{i.title}</CardTitle>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{KIND_LABEL[i.kind] ?? i.kind}</Badge>
                  <Badge variant={SEVERITY_VARIANT[i.severity] ?? "secondary"}>{i.severity}</Badge>
                  {!!i.impact_amount && <Badge variant="outline">Impact {CAD(i.impact_amount)}</Badge>}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => void dismiss(i.id)} title="Marquer comme traité">
                <Check className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">{i.body}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}