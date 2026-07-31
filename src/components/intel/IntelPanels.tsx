// Panneaux du Centre IA : apprentissage, scores, prédictions, anomalies, optimisations, mémoire.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  ANOMALY_LABELS, CAD, ENTITY_LABELS, METRIC_LABELS, OPTIM_LABELS,
  type AnomalyRow, type IntelDashboard, type MemoryRow, type OptimizationRow, type ScoreRow,
} from "@/lib/jsc/intelligence";

const sevVariant = (s: string) => (s === "high" ? "destructive" : s === "medium" ? "default" : "secondary");

/* ---------------- Apprentissage ---------------- */
export function LearningPanel({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("jsc_intel_learning")
        .select("id,topic,subject_label,metrics,samples,confidence,computed_at")
        .order("topic").limit(500);
      if (error) toast.error(error.message);
      setRows((data as Record<string, unknown>[]) ?? []);
      setLoading(false);
    })();
  }, [companyId]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">Aucun apprentissage. Lancez un cycle d'intelligence.</p>;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Ce que l'IA a appris des données réelles</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Domaine</TableHead><TableHead>Sujet</TableHead>
            <TableHead>Mesures apprises</TableHead><TableHead className="text-right">Échantillons</TableHead>
            <TableHead className="text-right">Confiance</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={String(r.id)}>
                <TableCell><Badge variant="outline">{String(r.topic)}</Badge></TableCell>
                <TableCell className="max-w-[180px] truncate">{String(r.subject_label ?? "—")}</TableCell>
                <TableCell className="max-w-[420px] text-xs text-muted-foreground">
                  {Object.entries((r.metrics ?? {}) as Record<string, unknown>)
                    .map(([k, v]) => `${k}: ${v ?? "—"}`).join(" · ")}
                </TableCell>
                <TableCell className="text-right">{String(r.samples)}</TableCell>
                <TableCell className="text-right">{Math.round(Number(r.confidence) * 100)} %</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- Scores ---------------- */
export function ScoresPanel() {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from("jsc_intel_scores")
        .select("entity_type,entity_id,label,score,grade,factors,samples")
        .order("score", { ascending: false }).limit(300);
      if (error) toast.error(error.message);
      setRows((data as unknown as ScoreRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">Aucun score calculé.</p>;

  return (
    <Card>
      <CardContent className="overflow-x-auto p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Type</TableHead><TableHead>Élément</TableHead>
            <TableHead className="text-right">Score</TableHead><TableHead>Note</TableHead>
            <TableHead>Facteurs</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.entity_type}-${r.entity_id}`}>
                <TableCell><Badge variant="outline">{ENTITY_LABELS[r.entity_type] ?? r.entity_type}</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate">{r.label ?? r.entity_id.slice(0, 8)}</TableCell>
                <TableCell className="text-right font-semibold">{r.score}</TableCell>
                <TableCell>{r.grade}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {Object.entries(r.factors ?? {}).map(([k, v]) => `${k}: ${v ?? "—"}`).join(" · ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- Prédictions ---------------- */
export function PredictionsPanel({ data }: { data: IntelDashboard | null }) {
  const preds = data?.predictions ?? [];
  if (!preds.length) return <p className="py-10 text-center text-sm text-muted-foreground">Aucune prévision disponible : historique insuffisant.</p>;
  return (
    <Card>
      <CardContent className="overflow-x-auto p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Indicateur</TableHead><TableHead>Mois</TableHead>
            <TableHead className="text-right">Prévision</TableHead>
            <TableHead className="text-right">Fourchette</TableHead>
            <TableHead className="text-right">Confiance</TableHead>
            <TableHead>Méthode</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {preds.map((p, i) => (
              <TableRow key={`${p.metric}-${p.period_month}-${i}`}>
                <TableCell>{METRIC_LABELS[p.metric] ?? p.metric}</TableCell>
                <TableCell>{new Date(p.period_month).toLocaleDateString("fr-CA", { month: "long", year: "numeric" })}</TableCell>
                <TableCell className="text-right font-semibold">
                  {["revenue", "margin", "cash_in"].includes(p.metric) ? CAD(p.predicted) : Math.round(p.predicted)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {p.low != null ? `${Math.round(p.low)} – ${Math.round(p.high ?? 0)}` : "—"}
                </TableCell>
                <TableCell className="text-right">{Math.round(p.confidence * 100)} %</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.method}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- Anomalies ---------------- */
export function AnomaliesPanel({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("jsc_intel_anomalies")
      .select("*").eq("status", "open").order("created_at", { ascending: false }).limit(200);
    if (error) toast.error(error.message);
    setRows((data as unknown as AnomalyRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resolve = async (id: string) => {
    const { error } = await supabase.from("jsc_intel_anomalies")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Anomalie résolue");
    await load(); onChanged();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">Aucune anomalie ouverte.</p>;

  return (
    <div className="space-y-3">
      {rows.map((a) => (
        <Card key={a.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-[240px] flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant={sevVariant(a.severity) as never}>{ANOMALY_LABELS[a.code] ?? a.code}</Badge>
                <span className="text-sm font-semibold">{a.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{a.detail}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString("fr-CA")}
                {a.impact_amount ? ` · impact estimé ${CAD(a.impact_amount)}` : ""}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void resolve(a.id)}>
              <Check className="mr-1.5 h-4 w-4" /> Résoudre
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Optimisations ---------------- */
export function OptimizationsPanel({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<OptimizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("jsc_intel_optimizations")
      .select("*").order("estimated_saving", { ascending: false }).limit(200);
    if (error) toast.error(error.message);
    setRows((data as unknown as OptimizationRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(id);
    const { error } = await supabase.rpc("jsc_intel_apply_optimization", { _id: id, _decision: decision });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(decision === "approved" ? "Proposition appliquée" : "Proposition refusée");
    await load(); onChanged();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">Aucune proposition d'optimisation.</p>;

  return (
    <div className="space-y-3">
      {rows.map((o) => (
        <Card key={o.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-[260px] flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{OPTIM_LABELS[o.kind] ?? o.kind}</Badge>
                <span className="text-sm font-semibold">{o.title}</span>
                <Badge variant={o.status === "pending" ? "secondary" : o.status === "applied" ? "default" : "outline"}>
                  {o.status === "pending" ? "En attente" : o.status === "applied" ? "Appliquée" : "Refusée"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{o.rationale}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Gain estimé {CAD(o.estimated_saving)} · confiance {Math.round(o.confidence * 100)} ·
                {" "}{new Date(o.created_at).toLocaleDateString("fr-CA")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Actuel : {JSON.stringify(o.current_state)} → Proposé : {JSON.stringify(o.proposed_state)}
              </p>
            </div>
            {o.status === "pending" && (
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === o.id} onClick={() => void decide(o.id, "approved")}>
                  <Check className="mr-1.5 h-4 w-4" /> Valider
                </Button>
                <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => void decide(o.id, "rejected")}>
                  <X className="mr-1.5 h-4 w-4" /> Refuser
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Mémoire globale ---------------- */
export function MemoryPanel() {
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from("jsc_intel_memory")
        .select("id,kind,title,outcome,performance,lesson,created_at")
        .order("created_at", { ascending: false }).limit(200);
      if (error) toast.error(error.message);
      setRows((data as unknown as MemoryRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">Aucune décision mémorisée pour l'instant.</p>;

  return (
    <Card>
      <CardContent className="overflow-x-auto p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Décision</TableHead><TableHead>Résultat</TableHead>
            <TableHead className="text-right">Performance</TableHead><TableHead>Leçon retenue</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(m.created_at).toLocaleDateString("fr-CA")}</TableCell>
                <TableCell className="max-w-[260px] truncate">{m.title}</TableCell>
                <TableCell><Badge variant={m.outcome === "applied" ? "default" : "outline"}>{m.outcome ?? "—"}</Badge></TableCell>
                <TableCell className="text-right">{m.performance != null ? CAD(m.performance) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.lesson}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}