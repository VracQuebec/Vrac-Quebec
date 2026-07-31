// IA commerciale — notation des demandes, recommandations et apprentissage continu.
import { useCallback, useEffect, useState } from "react";
import { Lightbulb, Loader2, RefreshCw, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CAD, invokeIntel, stars } from "@/lib/jsc/intel";

type Score = {
  id: string; request_id: string; stars: number; score: number | null; priority: string;
  client_type: string | null; project_type: string | null; potential_revenue: number | null;
  win_probability: number | null; recommended_rep_name: string | null; reasoning: string | null;
  created_at: string;
  jsc_requests?: { request_number: string | null; city: string | null; status: string | null } | null;
};

type Reco = {
  id: string; kind: string; title: string; body: string | null;
  confidence: number | null; created_at: string; request_id: string | null;
};

export default function SalesIntelligence({ companyId }: { companyId: string | null }) {
  const [scores, setScores] = useState<Score[]>([]);
  const [recos, setRecos] = useState<Reco[]>([]);
  const [learning, setLearning] = useState<{ total: number; won: number; lost: number; avgWon: number }>({ total: 0, won: 0, lost: 0, avgWon: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let sq = supabase.from("jsc_lead_scores")
      .select("id, request_id, stars, score, priority, client_type, project_type, potential_revenue, win_probability, recommended_rep_name, reasoning, created_at, jsc_requests(request_number, city, status)")
      .order("stars", { ascending: false }).order("potential_revenue", { ascending: false }).limit(40);
    if (companyId) sq = sq.eq("company_id", companyId);

    const [{ data: sc, error: se }, { data: rc }, { data: ls }] = await Promise.all([
      sq,
      supabase.from("jsc_recommendations")
        .select("id, kind, title, body, confidence, created_at, request_id")
        .order("created_at", { ascending: false }).limit(30),
      supabase.from("jsc_learning_signals").select("outcome, amount").limit(1000),
    ]);
    if (se) toast.error(se.message);
    setScores((sc as unknown as Score[]) ?? []);
    setRecos((rc as Reco[]) ?? []);
    const rows = (ls as { outcome: string; amount: number | null }[]) ?? [];
    const won = rows.filter((r) => r.outcome === "won");
    setLearning({
      total: rows.length, won: won.length, lost: rows.filter((r) => r.outcome === "lost").length,
      avgWon: won.length ? won.reduce((s, r) => s + Number(r.amount ?? 0), 0) / won.length : 0,
    });
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: string, label: string) => {
    setBusy(fn);
    try {
      await invokeIntel(fn, { limit: 15 });
      toast.success(`${label} terminée.`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const winRate = learning.total ? Math.round((learning.won / learning.total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Chaque demande est notée de 1 à 5 étoiles, priorisée, estimée en valeur et attribuée à un représentant.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button size="sm" onClick={() => void run("vqos-ai-score", "Notation IA")} disabled={busy !== null}>
            {busy === "vqos-ai-score" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Star className="mr-1.5 h-4 w-4" />}
            Noter les demandes
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void run("vqos-ai-recommend", "Génération des recommandations")} disabled={busy !== null}>
            {busy === "vqos-ai-recommend" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Générer les recommandations
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Taux de réussite appris</p>
          <p className="text-2xl font-bold">{winRate} %</p>
          <p className="text-xs text-muted-foreground">{learning.won} gagnées · {learning.lost} perdues</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Valeur moyenne gagnée</p>
          <p className="text-2xl font-bold">{CAD(learning.avgWon)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Signaux d'apprentissage</p>
          <p className="text-2xl font-bold">{learning.total}</p>
          <p className="text-xs text-muted-foreground">Collectés automatiquement à chaque décision</p>
        </CardContent></Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Demandes notées</CardTitle></CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-y-auto">
            {scores.length === 0 && <p className="text-xs text-muted-foreground">Aucune demande notée pour l'instant.</p>}
            {scores.map((s) => (
              <div key={s.id} className="rounded-lg border p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {s.jsc_requests?.request_number ?? "Demande"} — {s.jsc_requests?.city ?? "—"}
                  </span>
                  <span className="text-sm text-primary">{stars(s.stars)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{s.priority}</Badge>
                  {s.client_type && <Badge variant="outline">{s.client_type}</Badge>}
                  {s.project_type && <Badge variant="outline">{s.project_type}</Badge>}
                  <Badge variant="secondary">{CAD(s.potential_revenue)}</Badge>
                  <Badge variant="secondary">{Math.round(Number(s.win_probability ?? 0))} % de vente</Badge>
                  {s.recommended_rep_name && <Badge variant="outline">{s.recommended_rep_name}</Badge>}
                </div>
                {s.reasoning && <p className="mt-1.5 text-xs text-muted-foreground">{s.reasoning}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4" /> Recommandations IA</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-y-auto">
            {recos.length === 0 && <p className="text-xs text-muted-foreground">Aucune recommandation générée.</p>}
            {recos.map((r) => (
              <div key={r.id} className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.title}</span>
                  <Badge variant="outline">{r.kind}</Badge>
                </div>
                {r.body && <p className="mt-1 text-xs text-muted-foreground">{r.body}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}