import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, Check, AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";

/**
 * Optimisation réelle d'UNE page SEO :
 *  1. Analyse (seo-qa-check) → score réel + critères en échec
 *  2. Optimisation ciblée (seo-improve-page mode "propose" avec `focus`)
 *  3. Application du contenu (mode "apply") — jamais de changement de slug ni de statut
 *  4. Recalcul du score réel (seo-qa-check)
 *  5. Si le score baisse : rollback automatique vers la version d'origine + explication
 */

export type QaCheck = {
  key: string;
  label: string;
  ok: boolean;
  status: "ok" | "warn" | "fail";
  blocker?: boolean;
  detail?: string;
};

type Phase = "analyze" | "optimize" | "apply" | "rescore" | "done" | "reverted" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  analyze: "Analyse en cours…",
  optimize: "Optimisation en cours…",
  apply: "Application des améliorations…",
  rescore: "Recalcul du score…",
  done: "Optimisation terminée",
  reverted: "Version d'origine conservée",
  error: "Échec de l'optimisation",
};

type Snapshot = Record<string, unknown>;

async function runQa(pageId: string): Promise<{ score: number; checks: QaCheck[] }> {
  const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { score?: number; checks?: QaCheck[]; error?: string }>(
    "seo-qa-check",
    { page_id: pageId, enforce_draft: false },
  );
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return { score: Number(data?.score ?? 0), checks: Array.isArray(data?.checks) ? data!.checks! : [] };
}

const RESTORE_KEYS = [
  "title", "meta_title", "meta_description", "og_title", "og_description", "cover_image_alt",
  "intro", "content_html", "faq", "internal_links", "keywords",
  "word_count", "h2_count", "h3_count", "internal_link_count", "seo_score",
] as const;

export default function OptimizeDialog({
  pageId, pageTitle, onClose, onFinished,
}: {
  pageId: string; pageTitle: string; onClose: () => void; onFinished: (finalScore: number | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>("analyze");
  const [beforeScore, setBeforeScore] = useState<number | null>(null);
  const [afterScore, setAfterScore] = useState<number | null>(null);
  const [problems, setProblems] = useState<QaCheck[]>([]);
  const [fixed, setFixed] = useState<QaCheck[]>([]);
  const [remaining, setRemaining] = useState<QaCheck[]>([]);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    try {
      // 1 — Analyse réelle avant optimisation
      setPhase("analyze");
      const before = await runQa(pageId);
      setBeforeScore(before.score);
      const failing = before.checks.filter((c) => !c.ok);
      setProblems(failing);

      if (failing.length === 0) {
        setAfterScore(before.score);
        setMessage("Aucun critère en échec : la page est déjà conforme à tous les critères SEO du système. Aucune modification appliquée.");
        setPhase("done");
        onFinished(before.score);
        return;
      }

      // 2 — Optimisation ciblée sur les critères en échec
      setPhase("optimize");
      const focus = failing.map((c) => `${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
      const { data: propData, error: propErr } = await invokeWithFreshSession<Record<string, unknown>, { improvement_id?: string; before?: Snapshot; notes?: string; error?: string }>(
        "seo-improve-page",
        { page_id: pageId, mode: "propose", focus },
      );
      if (propErr) throw new Error(propErr.message);
      if (propData?.error) throw new Error(propData.error);
      const improvementId = propData?.improvement_id;
      if (!improvementId) throw new Error("Aucune proposition d'optimisation reçue.");
      setNotes(String(propData?.notes ?? ""));
      const originalSnapshot = propData?.before ?? null;

      // 3 — Application du contenu (contenu uniquement : slug, URL et statut inchangés)
      setPhase("apply");
      const { data: applyData, error: applyErr } = await invokeWithFreshSession<Record<string, unknown>, { ok?: boolean; error?: string }>(
        "seo-improve-page",
        { page_id: pageId, mode: "apply", improvement_id: improvementId },
      );
      if (applyErr) throw new Error(applyErr.message);
      if (applyData?.error) throw new Error(applyData.error);

      // 4 — Recalcul du score réel
      setPhase("rescore");
      const after = await runQa(pageId);

      if (after.score < before.score && originalSnapshot) {
        // 5 — Rollback : on ne garde jamais une version qui dégrade le score réel.
        const payload: Record<string, unknown> = {};
        for (const k of RESTORE_KEYS) {
          if (k in originalSnapshot) payload[k] = (originalSnapshot as Record<string, unknown>)[k];
        }
        payload.last_analyzed_at = new Date().toISOString();
        await supabase.from("seo_pages").update(payload as never).eq("id", pageId);
        const restored = await runQa(pageId);
        await supabase.from("seo_pages").update({ seo_score: restored.score } as never).eq("id", pageId);
        setAfterScore(restored.score);
        setFixed([]);
        setRemaining(restored.checks.filter((c) => !c.ok));
        setMessage(
          `La version optimisée obtenait un score inférieur (${after.score}/100 contre ${before.score}/100). La version d'origine a été restaurée et le score réel est conservé. Cause probable : les critères restants (unicité, images, longueur) ne peuvent pas être corrigés par une simple réécriture — ils demandent un ajustement manuel.`,
        );
        setPhase("reverted");
        onFinished(restored.score);
        return;
      }

      await supabase.from("seo_pages").update({
        seo_score: after.score,
        last_analyzed_at: new Date().toISOString(),
        needs_refresh: after.checks.some((c) => !c.ok && c.blocker) || after.score < 65,
      } as never).eq("id", pageId);

      const beforeFailKeys = new Set(failing.map((c) => c.key));
      setAfterScore(after.score);
      setFixed(after.checks.filter((c) => c.ok && beforeFailKeys.has(c.key)));
      setRemaining(after.checks.filter((c) => !c.ok));
      if (after.score === before.score) {
        setMessage("Le contenu a été amélioré mais le score réel reste identique : les critères encore en échec ne dépendent pas de la réécriture du texte.");
      }
      setPhase("done");
      onFinished(after.score);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur inattendue");
      setPhase("error");
      onFinished(null);
    }
  }, [pageId, onFinished]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const busy = phase === "analyze" || phase === "optimize" || phase === "apply" || phase === "rescore";

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl border border-border max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-display font-bold text-foreground truncate">Optimiser cette page</div>
            <div className="text-xs text-muted-foreground truncate">{pageTitle}</div>
          </div>
          <button onClick={onClose} disabled={busy}
            className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Étapes */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            {(["analyze", "optimize", "apply", "rescore"] as const).map((p, i) => {
              const order = ["analyze", "optimize", "apply", "rescore"] as const;
              const currentIdx = order.indexOf(phase as typeof order[number]);
              const done = phase === "done" || phase === "reverted" || (currentIdx > i && currentIdx !== -1);
              const active = phase === p;
              return (
                <div key={p} className={`flex items-center gap-2 text-xs font-body ${active ? "text-foreground font-semibold" : done ? "text-primary" : "text-muted-foreground"}`}>
                  {active ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : done ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-current opacity-40" />}
                  {PHASE_LABEL[p]}
                </div>
              );
            })}
          </div>

          {/* Score avant / après */}
          <div className="flex items-center justify-center gap-4 py-2">
            <ScoreBubble label="Score actuel" score={beforeScore} />
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
            <ScoreBubble label="Nouveau score" score={afterScore} highlight={afterScore != null && beforeScore != null && afterScore > beforeScore} />
          </div>

          {phase === "error" && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {message}
            </div>
          )}

          {problems.length > 0 && (
            <Section title={`Problèmes détectés (${problems.length})`}>
              {problems.map((c) => (
                <li key={c.key} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-destructive">•</span>
                  <span><span className="text-foreground">{c.label}</span>{c.detail ? ` — ${c.detail}` : ""}</span>
                </li>
              ))}
            </Section>
          )}

          {(phase === "done" || phase === "reverted") && (
            <>
              {fixed.length > 0 && (
                <Section title={`Améliorations réelles (${fixed.length})`}>
                  {fixed.map((c) => (
                    <li key={c.key} className="flex gap-2 text-xs text-foreground">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" /> {c.label}
                    </li>
                  ))}
                </Section>
              )}
              {remaining.length > 0 && (
                <Section title={`Critères encore en échec (${remaining.length})`}>
                  {remaining.map((c) => (
                    <li key={c.key} className="flex gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span><span className="text-foreground">{c.label}</span>{c.detail ? ` — ${c.detail}` : ""}</span>
                    </li>
                  ))}
                </Section>
              )}
              {notes && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" /> {notes}
                </div>
              )}
              {message && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  {message}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Le score affiché provient du recalcul réel effectué après l'optimisation (mêmes critères que l'analyse SEO). L'URL, le slug et le statut de publication n'ont pas été modifiés.
              </p>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-4 py-3 flex justify-end">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-bold disabled:opacity-40">
            {busy ? PHASE_LABEL[phase] : "Fermer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreBubble({ label, score, highlight }: { label: string; score: number | null; highlight?: boolean }) {
  const color = score == null ? "text-muted-foreground" : score >= 85 ? "text-primary" : score >= 65 ? "text-amber-500" : "text-destructive";
  return (
    <div className={`rounded-lg border ${highlight ? "border-primary" : "border-border"} bg-background px-4 py-2 text-center min-w-[110px]`}>
      <div className="text-[11px] text-muted-foreground font-body">{label}</div>
      <div className={`text-xl font-display font-bold ${color}`}>{score == null ? "—" : `${score}/100`}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-display font-bold text-foreground mb-2">{title}</div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}
