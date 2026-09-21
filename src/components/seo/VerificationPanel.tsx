import { useCallback, useEffect, useState } from "react";
import { Loader2, ExternalLink, ShieldCheck, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionGroup, ActionPriorityPage } from "@/lib/seo/actionGroups";
import { buildLogEntry } from "@/lib/seo/workflow";
import {
  VERIFICATION_LABEL, runVerification, verificationButtonLabel, verificationStatusLabel,
  type VerificationKind, type VerificationPageRow, type VerificationResult,
} from "@/lib/seo/verification";

type LogRow = {
  id: string; status: string; page_slug: string | null; error: string | null;
  created_at: string; note: string | null; after_data: unknown;
};

/**
 * Panneau de DIAGNOSTIC. Il ne fait que des lectures : aucune écriture sur
 * seo_pages n'est possible depuis ce composant.
 */
export default function VerificationPanel({
  group, kind, priorityPages, open, onClose,
}: {
  group: ActionGroup | null;
  kind: VerificationKind | null;
  priorityPages: ActionPriorityPage[];
  open: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const loadLogs = useCallback(async (oppId: string) => {
    const { data } = await supabase
      .from("seo_opportunity_actions")
      .select("id,status,page_slug,error,created_at,note,after_data")
      .eq("opportunity_id", oppId)
      .order("created_at", { ascending: false })
      .limit(30);
    setLogs((data ?? []) as LogRow[]);
  }, []);

  useEffect(() => {
    setState("idle"); setResult(null); setErr(null); setLogs([]);
    if (group && open) void loadLogs(group.primary.id);
  }, [group, open, loadLogs]);

  if (!group || !kind) return null;
  const o = group.primary;
  const alreadyRun = logs.some((l) => l.status === "checked" || l.status === "issue");

  const run = async () => {
    setState("running"); setErr(null);
    try {
      const slugs = priorityPages.map((p) => p.slug).filter((s): s is string => Boolean(s));
      const cols = "id,slug,title,status,noindex,google_index_status,qa_last_score,qa_blockers,city_slug,service_slug";
      let q = supabase.from("seo_pages").select(cols);
      if (group.kind === "page" && o.page_id) q = q.eq("id", o.page_id);
      else if (slugs.length) q = q.in("slug", slugs);
      else if (group.service && group.city) q = q.eq("service_slug", group.service).eq("city_slug", group.city);
      else if (group.service) q = q.eq("service_slug", group.service);
      else if (group.city) q = q.eq("city_slug", group.city);
      else q = q.in("slug", ["__none__"]);
      const { data, error } = await q.limit(300);
      if (error) throw error;
      const rows = (data ?? []) as unknown as VerificationPageRow[];
      const res = runVerification(kind, rows);
      setResult(res);
      setState("done");
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("seo_opportunity_actions").insert({
        ...buildLogEntry(group, {
          status: res.outcome === "issue" ? "issue" : "checked",
          note: `Vérification — ${VERIFICATION_LABEL[kind]}`,
          after_data: { checked: res.checked, issues: res.issues.length, summary: res.summary } as never,
        }),
        user_id: auth.user?.id ?? null,
      } as never);
      await loadLogs(o.id);
      toast.success(res.outcome === "issue" ? `Problème détecté : ${res.summary}` : `Vérification terminée : ${res.summary}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "object" && e ? String((e as Record<string, unknown>).message ?? "Erreur inconnue") : "Erreur inconnue";
      setErr(msg); setState("error");
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("seo_opportunity_actions").insert({
        ...buildLogEntry(group, { status: "check_failed", error: msg, note: `Vérification — ${VERIFICATION_LABEL[kind]}` }),
        user_id: auth.user?.id ?? null,
      } as never);
      await loadLogs(o.id);
      toast.error(`Impossible d'effectuer la vérification : ${msg}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Vérifier — {VERIFICATION_LABEL[kind]}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-border p-3 text-xs space-y-1" data-testid="verification-header">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-secondary uppercase font-display font-bold">VÉRIFICATION</span>
            <span className="font-display font-bold text-sm text-foreground">{group.title}</span>
            <span className="px-2 py-0.5 rounded bg-secondary" data-testid="verification-status">
              {verificationStatusLabel(state, result?.outcome, alreadyRun)}
            </span>
          </div>
          <div className="text-muted-foreground"><span className="text-foreground font-semibold">Pourquoi :</span> {o.reason ?? o.rationale}</div>
          <div className="text-muted-foreground">
            Une vérification est un diagnostic en lecture seule : aucune page n'est modifiée, créée ni publiée.
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => void run()} disabled={state === "running"}
            data-testid="run-verification"
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold disabled:opacity-60">
            {state === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : state === "error" ? <RotateCcw className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            {verificationButtonLabel(state, alreadyRun)}
          </button>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm font-display font-semibold">Fermer</button>
        </div>

        {state === "error" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive" data-testid="verification-error">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" /> Impossible d'effectuer cette vérification — {err}
          </div>
        )}

        {result && (
          <div className="rounded-md border border-border p-3 text-xs space-y-2" data-testid="verification-result">
            <div className="font-display font-bold text-foreground">
              Résultat : {result.outcome === "issue" ? "Problème détecté" : "Vérifiée"} · {result.checked} page(s) vérifiée(s)
            </div>
            <div className="text-muted-foreground">{result.summary}</div>
            {result.issues.length > 0 && (
              <ul className="space-y-1">
                {result.issues.slice(0, 50).map((i) => (
                  <li key={`${i.slug}-${i.message}`} className="rounded bg-secondary/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-muted-foreground truncate">{i.url}</span>
                      <a href={i.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 shrink-0">
                        <ExternalLink className="w-3 h-3" /> Ouvrir la page
                      </a>
                    </div>
                    <div className="text-foreground">{i.message}</div>
                  </li>
                ))}
                {result.issues.length > 50 && <li className="text-muted-foreground">+{result.issues.length - 50} autre(s).</li>}
              </ul>
            )}
          </div>
        )}

        <div className="rounded-md border border-border p-3 text-xs space-y-1">
          <div className="font-display font-bold text-foreground">Historique de cette vérification ({logs.length})</div>
          {logs.length === 0 && <div className="text-muted-foreground">Aucune vérification enregistrée pour l'instant.</div>}
          {logs.map((l) => (
            <div key={l.id} className="text-muted-foreground">
              {l.status} · {new Date(l.created_at).toLocaleString("fr-CA")} · {l.note ?? "—"}
              {l.error ? ` · ${l.error}` : ""}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
