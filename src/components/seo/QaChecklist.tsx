import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";

export type QaCheck = {
  key: string;
  label: string;
  ok: boolean;
  status: "ok" | "warn" | "fail";
  blocker?: boolean;
  detail?: string;
  fixable?: boolean;
  fix_action?: string;
};

type QaResult = { score: number; checks: QaCheck[]; blockers: string[]; warnings: string[] };

export default function QaChecklist({
  pageId,
  onScoreChange,
}: {
  pageId: string;
  onScoreChange?: (score: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [autofixing, setAutofixing] = useState<string | null>(null);
  const [result, setResult] = useState<QaResult | null>(null);

  async function runCheck() {
    setLoading(true);
    try {
      const { data, error } = await invokeWithFreshSession("seo-qa-check", {
        page_id: pageId,
        enforce_draft: false,
      });
      if (error) throw new Error(error.message);
      const d = data as QaResult & { error?: string };
      if (d.error) throw new Error(d.error);
      setResult(d);
      onScoreChange?.(d.score);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur QA");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void runCheck(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pageId]);

  async function autofix(actions: string[] | null) {
    setAutofixing(actions?.[0] ?? "all");
    try {
      const { data, error } = await invokeWithFreshSession("seo-qa-autofix", {
        page_id: pageId,
        actions: actions ?? [],
      });
      if (error) throw new Error(error.message);
      const d = data as { ok?: boolean; fixed?: string[]; new_score?: number; error?: string; message?: string };
      if (d.error) throw new Error(d.error);
      if ((d.fixed?.length ?? 0) === 0) toast.info(d.message ?? "Aucune correction appliquée.");
      else toast.success(`${d.fixed?.length} correction(s) appliquée(s)${d.new_score != null ? ` — nouveau score ${d.new_score}/100` : ""}`);
      await runCheck();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur autofix");
    } finally {
      setAutofixing(null);
    }
  }

  if (loading && !result) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Analyse QA en cours…
      </div>
    );
  }
  if (!result) return null;

  const failing = result.checks.filter((c) => c.status !== "ok").length;
  const fixableFails = result.checks.filter((c) => c.status !== "ok" && c.fixable).length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <header className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase font-display tracking-wider text-muted-foreground">Score QA</div>
          <div className={`text-3xl font-display font-extrabold ${result.score >= 80 ? "text-primary" : result.score >= 60 ? "text-amber-500" : "text-red-500"}`}>
            {result.score}<span className="text-base text-muted-foreground">/100</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{failing} points à améliorer · {fixableFails} corrigeables automatiquement</div>
        </div>
        <button
          type="button"
          onClick={() => autofix(null)}
          disabled={autofixing !== null || fixableFails === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold shadow hover:opacity-90 disabled:opacity-50"
        >
          {autofixing === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {autofixing === "all" ? "Correction en cours…" : "Corriger automatiquement"}
        </button>
      </header>
      <ul className="divide-y divide-border">
        {result.checks.map((c) => (
          <li key={c.key} className="p-3 flex items-start gap-3">
            <StatusIcon status={c.status} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-display font-semibold text-foreground">
                {c.label}
                {c.blocker && c.status !== "ok" && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-destructive font-bold">Bloquant</span>
                )}
              </div>
              {c.detail && <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>}
            </div>
            {c.status !== "ok" && c.fixable && c.fix_action && (
              <button
                type="button"
                onClick={() => autofix([c.fix_action!])}
                disabled={autofixing !== null}
                className="text-xs font-display font-semibold text-primary hover:underline whitespace-nowrap disabled:opacity-50 flex items-center gap-1"
              >
                {autofixing === c.fix_action ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                Corriger
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: "ok" | "warn" | "fail" }) {
  if (status === "ok") return <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />;
  if (status === "warn") return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />;
  return <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />;
}