// IA réseau — constats automatiques sur l'ensemble de l'écosystème Vrac Québec.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Network, RefreshCw, TriangleAlert, TrendingUp, Info, AlertOctagon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Insight = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  impact_amount: number | null;
  created_at: string;
};

const KIND_LABELS: Record<string, string> = {
  meilleur_prix: "Meilleur prix",
  penurie: "Risque de pénurie",
  recommandation_fournisseur: "Fournisseur recommandé",
  equilibrage_transporteurs: "Équilibrage des transporteurs",
  delai: "Délais",
  regroupement_livraisons: "Regroupement de livraisons",
};

const SEVERITY: Record<string, { label: string; icon: typeof Info; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  info: { label: "Information", icon: Info, variant: "secondary" },
  opportunite: { label: "Opportunité", icon: TrendingUp, variant: "default" },
  attention: { label: "À surveiller", icon: TriangleAlert, variant: "outline" },
  critique: { label: "Critique", icon: AlertOctagon, variant: "destructive" },
};

export default function NetworkIntelligence({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("jsc_ai_insights")
      .select("id,kind,severity,title,body,impact_amount,created_at")
      .in("kind", Object.keys(KIND_LABELS))
      .order("created_at", { ascending: false })
      .limit(30);
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    setRows((data as Insight[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const analyse = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("vqos-network", { body: { companyId } });
    setRunning(false);
    if (error) { toast.error("L'analyse du réseau a échoué."); return; }
    const inserted = (data as { inserted?: number } | null)?.inserted ?? 0;
    toast.success(inserted ? `${inserted} constat(s) générés.` : "Aucun nouveau constat.");
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Network className="h-5 w-5 text-primary" /> IA réseau
          </h2>
          <p className="text-sm text-muted-foreground">
            Surveille tout l'écosystème : meilleurs prix, pénuries, charge des transporteurs,
            délais et regroupements de livraisons possibles.
          </p>
        </div>
        <Button onClick={analyse} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Analyser le réseau
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des constats…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucun constat pour l'instant. Lancez une analyse du réseau.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const sev = SEVERITY[r.severity] ?? SEVERITY.info;
            const Icon = sev.icon;
            return (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{r.title}</CardTitle>
                    <Badge variant={sev.variant} className="shrink-0">
                      <Icon className="mr-1 h-3 w-3" /> {sev.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABELS[r.kind] ?? r.kind} · {new Date(r.created_at).toLocaleString("fr-CA")}
                  </p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="whitespace-pre-line">{r.body}</p>
                  {r.impact_amount != null && (
                    <p className="font-medium text-foreground">
                      Impact estimé : {r.impact_amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
