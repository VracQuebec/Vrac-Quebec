// Centre de décision — file des décisions proposées par l'agent IA : accepter, modifier, refuser.
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, PlayCircle, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CAD, invokeIntel } from "@/lib/jsc/intel";

type Decision = {
  id: string; title: string; rationale: string | null; kind: string; domain: string; severity: string;
  impact_amount: number; confidence: number; status: string; entity_type: string | null;
  entity_id: string | null; proposed_action: { type?: string; params?: Record<string, unknown> } | null;
  created_at: string; execution_result: { detail?: string } | null;
};

const SEV: Record<string, string> = { critical: "destructive", warning: "secondary", info: "outline" };
const STATUS_LABEL: Record<string, string> = {
  pending: "En attente", accepted: "Acceptée", rejected: "Refusée", executed: "Exécutée", modified: "Modifiée",
};

export default function DecisionCenter({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [edit, setEdit] = useState<Decision | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editRationale, setEditRationale] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("jsc_decisions").select("*").is("archived_at", null)
      .order("status", { ascending: true }).order("impact_amount", { ascending: false }).limit(60);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as unknown as Decision[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await invokeIntel<{ created: number }>("vqos-agent", { company_id: companyId });
      toast.success(`${res.created} décision(s) proposée(s)`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setGenerating(false); }
  };

  const setStatus = async (d: Decision, status: string, extra: Record<string, unknown> = {}) => {
    setBusy(d.id);
    const { error } = await supabase.from("jsc_decisions")
      .update({ status, decided_at: new Date().toISOString(), ...extra }).eq("id", d.id);
    if (error) toast.error(error.message); else await load();
    setBusy(null);
  };

  const execute = async (d: Decision) => {
    setBusy(d.id);
    try {
      const res = await invokeIntel<{ executed: number; results: { detail: string; status: string }[] }>(
        "vqos-autopilot", { decision_id: d.id, company_id: companyId },
      );
      const r = res.results?.[0];
      if (r?.status === "ok") toast.success(r.detail); else toast.warning(r?.detail ?? "Aucune action exécutée");
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const saveEdit = async () => {
    if (!edit) return;
    await setStatus(edit, "modified", { title: editTitle, rationale: editRationale });
    setEdit(null);
  };

  const pending = rows.filter((r) => r.status === "pending" || r.status === "modified");
  const history = rows.filter((r) => !["pending", "modified"].includes(r.status));

  const card = (d: Decision) => (
    <Card key={d.id}>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={(SEV[d.severity] ?? "outline") as "default"}>{d.severity}</Badge>
          <Badge variant="outline">{d.domain}</Badge>
          <Badge variant="outline">{STATUS_LABEL[d.status] ?? d.status}</Badge>
          {d.impact_amount > 0 && <span className="text-sm font-semibold text-primary">{CAD(d.impact_amount)}</span>}
          <span className="text-xs text-muted-foreground">confiance {Math.round(d.confidence * 100)} %</span>
        </div>
        <p className="font-semibold">{d.title}</p>
        {d.rationale && <p className="text-sm text-muted-foreground">{d.rationale}</p>}
        <p className="text-xs text-muted-foreground">
          Action proposée : <span className="font-mono">{d.proposed_action?.type ?? "manual"}</span>
          {d.execution_result?.detail && ` · ${d.execution_result.detail}`}
        </p>
        {["pending", "modified", "accepted"].includes(d.status) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {d.status !== "accepted" && (
              <Button size="sm" disabled={busy === d.id} onClick={() => void setStatus(d, "accepted")}>
                <Check className="mr-1.5 h-4 w-4" /> Accepter
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy === d.id}
              onClick={() => { setEdit(d); setEditTitle(d.title); setEditRationale(d.rationale ?? ""); }}>
              <Pencil className="mr-1.5 h-4 w-4" /> Modifier
            </Button>
            <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => void setStatus(d, "rejected")}>
              <X className="mr-1.5 h-4 w-4" /> Refuser
            </Button>
            <Button size="sm" variant="secondary" disabled={busy === d.id} onClick={() => void execute(d)}>
              {busy === d.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-1.5 h-4 w-4" />}
              Exécuter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {pending.length} décision(s) en attente · {history.length} traitée(s)
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button size="sm" onClick={() => void generate()} disabled={generating}>
            {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Analyser la plateforme
          </Button>
        </div>
      </div>

      {loading && !rows.length && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      {!loading && !rows.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Aucune décision. Lancez une analyse pour que l'agent examine vos données.
        </p>
      )}

      {!!pending.length && <div className="space-y-3">{pending.map(card)}</div>}
      {!!history.length && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Historique</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {history.slice(0, 20).map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
                <span>{d.title}</span>
                <span className="text-xs text-muted-foreground">
                  {STATUS_LABEL[d.status] ?? d.status} · {new Date(d.created_at).toLocaleDateString("fr-CA")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier la décision</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Titre" />
            <Textarea value={editRationale} onChange={(e) => setEditRationale(e.target.value)} rows={4} placeholder="Justification" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
            <Button onClick={() => void saveEdit()}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
