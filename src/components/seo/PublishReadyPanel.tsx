// Carte « PUBLICATION DES PAGES PRÊTES » du Centre de pilotage.
// Publie par lots sécurisés les pages déjà validées « prêtes à publier ».
// Aucune création, suppression, régénération ni modification de contenu :
// seule la bascule brouillon → publié est écrite, après vérification du statut réel.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Rocket, Pause, Play, RefreshCw, AlertTriangle, FlaskConical } from "lucide-react";
import type { ControlCityRow } from "@/lib/seo/useSeoControlCenter";
import { classifyDraft } from "@/lib/seo/draftAudit";
import { duplicateTitles, runQaControl } from "@/lib/seo/qaControl";
import {
  PUBLISH_BATCH_SIZE, EMPTY_TALLY, SKIP_LABEL, applyOutcome, batchCount, batchNumber,
  chunk, confirmationLines, decideForPage, elapsedLabel, finalReport, progressPct,
  selectPublishable, successSentence,
  type PublishCandidate, type PublishOutcome, type PublishRow, type PublishTally,
} from "@/lib/seo/publishRun";

const SELECT =
  "id, slug, city_slug, material_slug, service_slug, title, h1, status, meta_title, meta_description, " +
  "content_html, internal_link_count, internal_links, word_count, qa_last_score, qa_last_checked_at, " +
  "qa_blockers, proc_status, proc_error, priority_locked, last_generated_at";

type Failure = { slug: string; reason: string };
const nf = (n: number) => n.toLocaleString("fr-CA");

async function loadAll(): Promise<PublishRow[]> {
  const all: PublishRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from("seo_pages").select(SELECT).range(from, from + 499);
    if (error) break;
    all.push(...((data ?? []) as unknown as PublishRow[]));
    if (!data || data.length < 500) break;
  }
  return all;
}

export default function PublishReadyPanel({ cities }: { cities: ControlCityRow[] }) {
  const [pages, setPages] = useState<PublishRow[] | null>(null);
  const [dups, setDups] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [tally, setTally] = useState<PublishTally>(EMPTY_TALLY);
  const [total, setTotal] = useState(0);
  const [lastSlug, setLastSlug] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState("0 s");
  const [failures, setFailures] = useState<Failure[]>([]);
  const [showFailures, setShowFailures] = useState(false);
  const [report, setReport] = useState<string[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const pauseRef = useRef(false);
  const runIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await loadAll();
    setDups(duplicateTitles(all));
    setPages(all);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!running || !startedAt) return;
    const t = window.setInterval(() => setElapsed(elapsedLabel(startedAt)), 1000);
    return () => window.clearInterval(t);
  }, [running, startedAt]);

  const stats = useMemo(() => {
    const rows = pages ?? [];
    const drafts = rows.filter((p) => p.status === "draft");
    const ready = selectPublishable(rows, dups);
    const currentResults = drafts.map((p) => ({
      page: p,
      verdict: runQaControl(p, { duplicateTitle: dups.has((p.meta_title ?? "").trim()) }).verdict,
      cls: classifyDraft(p),
    }));
    const errors = currentResults.filter(({ page, verdict }) =>
      page.proc_status === "error" || (page.proc_error ?? "") !== "" || verdict === "blocked"
    ).length;
    return {
      ready,
      published: rows.filter((p) => p.status === "published").length,
      drafts: drafts.length,
      errors,
      toCheck: Math.max(0, drafts.length - ready.length - errors),
      excluded: drafts.length - ready.length,
    };
  }, [pages, dups]);

  /** Publie une page après vérification de son statut réel (idempotent). */
  const publishOne = useCallback(async (c: PublishCandidate, simulate: boolean): Promise<{ outcome: PublishOutcome; error?: string }> => {
    const { data: fresh, error: readErr } = await supabase
      .from("seo_pages").select(SELECT).eq("id", c.id).maybeSingle();
    if (readErr) return { outcome: "failed", error: readErr.message };

    const row = fresh as unknown as PublishRow | null;
    const decision = decideForPage(row, dups.has((row?.meta_title ?? "").trim()));
    const logBase = {
      page_id: c.id, slug: c.slug, city_slug: c.city_slug, topic: c.topic,
      status_before: row?.status ?? null, run_id: runIdRef.current, batch_index: batchNumber(tally),
    };

    if (decision !== "publish") {
      if (!simulate) {
        await supabase.from("seo_publish_log").insert({
          ...logBase, status_after: row?.status ?? null, success: false, outcome: decision,
        });
      }
      return { outcome: decision };
    }
    if (simulate) return { outcome: "published" };

    const { data: updated, error } = await supabase
      .from("seo_pages")
      // Le noindex hérité du brouillon est retiré au moment de la publication.
      // Une page volontairement exclue reste exclue : elle n'est jamais publiée par ce panneau.
      .update({ status: "published", noindex: false, published_at: new Date().toISOString() })
      .eq("id", c.id).eq("status", "draft")
      .select("id, status").maybeSingle();

    if (error || !updated || updated.status !== "published") {
      await supabase.from("seo_publish_log").insert({
        ...logBase, status_after: updated?.status ?? row?.status ?? null, success: false,
        outcome: "failed", error_message: error?.message ?? "La base ne confirme pas la publication",
      });
      return { outcome: "failed", error: error?.message ?? "La base ne confirme pas la publication" };
    }
    await supabase.from("seo_publish_log").insert({
      ...logBase, status_after: "published", success: true, outcome: "published",
    });
    return { outcome: "published" };
  }, [dups, tally]);

  const run = useCallback(async (opts: { limit?: number; simulate?: boolean } = {}) => {
    const simulate = opts.simulate === true;
    const fresh = await loadAll();
    const dupSet = duplicateTitles(fresh);
    setDups(dupSet);
    setPages(fresh);
    let queue = selectPublishable(fresh, dupSet);
    if (opts.limit) queue = queue.slice(0, opts.limit);

    runIdRef.current = crypto.randomUUID();
    pauseRef.current = false;
    setPaused(false);
    setDryRun(simulate);
    setRunning(true);
    setReport(null);
    setFailures([]);
    setTotal(queue.length);
    setTally(EMPTY_TALLY);
    const t0 = Date.now();
    setStartedAt(t0);
    setElapsed("0 s");

    let acc = EMPTY_TALLY;
    const fails: Failure[] = [];
    const batches = chunk(queue, PUBLISH_BATCH_SIZE);

    for (const batch of batches) {
      for (const c of batch) {
        const res = await publishOne(c, simulate);
        acc = applyOutcome(acc, res.outcome);
        if (res.outcome === "failed") fails.push({ slug: c.slug, reason: res.error ?? "Échec inconnu" });
        else if (res.outcome !== "published") fails.push({ slug: c.slug, reason: SKIP_LABEL[res.outcome] });
        setTally(acc);
        setLastSlug(c.slug);
        setFailures([...fails]);
      }
      // Recalcul réel après chaque lot, à partir de la base.
      const after = await loadAll();
      setPages(after);
      setRemaining(selectPublishable(after, duplicateTitles(after)).length);
      if (pauseRef.current) break;
    }

    const after = await loadAll();
    setPages(after);
    const left = selectPublishable(after, duplicateTitles(after)).length;
    setRemaining(left);
    setReport(finalReport(acc, left));
    setRunning(false);
    setElapsed(elapsedLabel(t0));
  }, [publishOne]);

  const cityName = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;
  const pct = progressPct(tally, total);
  const done = report !== null;

  return (
    <Card className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-display font-bold flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" /> Publication des pages prêtes
          </h3>
          <p className="text-xs text-muted-foreground">
            Publication par lots de {PUBLISH_BATCH_SIZE}, statut vérifié page par page, reprise possible après
            interruption. Aucune page n'est créée, supprimée ni modifiée dans son contenu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={running || pages === null}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualiser
          </Button>
          <Button size="sm" variant="outline" onClick={() => void run({ limit: 3, simulate: true })}
            disabled={running || stats.ready.length === 0}>
            <FlaskConical className="w-4 h-4 mr-1" /> Test simulé (3 pages)
          </Button>
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={running || stats.ready.length === 0}>
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Rocket className="w-4 h-4 mr-1" />}
            Publier les {nf(stats.ready.length)} pages prêtes
          </Button>
        </div>
      </header>

      {pages === null ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Lecture des pages…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { label: "Prêtes à publier", value: stats.ready.length },
            { label: "Déjà publiées", value: stats.published },
            { label: "Brouillons", value: stats.drafts },
            { label: "Exclues", value: stats.excluded },
            { label: "Avec erreur", value: stats.errors },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-border bg-background/60 p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
              <div className="text-xl font-bold">{nf(k.value)}</div>
            </div>
          ))}
        </div>
      )}

      {(running || done) && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">
              {dryRun ? "Test simulé" : "Publication SEO"} {running ? "en cours" : "terminée"} — {nf(tally.processed)} / {nf(total)} pages traitées
            </div>
            {running && (
              <Button size="sm" variant="outline" onClick={() => { pauseRef.current = true; setPaused(true); }} disabled={paused}>
                <Pause className="w-4 h-4 mr-1" /> {paused ? "Pause après ce lot…" : "Mettre en pause"}
              </Button>
            )}
            {!running && (remaining ?? 0) > 0 && (
              <Button size="sm" onClick={() => void run()}>
                <Play className="w-4 h-4 mr-1" /> Reprendre la publication ({nf(remaining ?? 0)})
              </Button>
            )}
          </div>
          <Progress value={pct} className="h-2" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
            {[
              ["Réussies", nf(tally.published)],
              ["Déjà publiées", nf(tally.alreadyPublished)],
              ["Ignorées", nf(tally.skipped)],
              ["Échecs", nf(tally.failed)],
              ["Lot", `${nf(Math.min(batchNumber(tally), Math.max(1, batchCount(total))))} / ${nf(Math.max(1, batchCount(total)))}`],
              ["Progression", `${pct} %`],
            ].map(([l, v]) => (
              <div key={l} className="rounded border border-border/60 p-1.5">
                <div className="text-muted-foreground">{l}</div>
                <div className="font-semibold text-sm">{v}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Dernière page traitée : {lastSlug ? `/${lastSlug}` : "—"} · Temps écoulé : {elapsed}
            {dryRun && " · Mode simulation : aucune écriture en base."}
          </div>
          {report && (
            <div className="space-y-1 pt-1">
              <div className="text-sm font-semibold">Publication terminée</div>
              <ul className="text-xs text-muted-foreground list-disc pl-4">
                {report.map((l) => <li key={l}>{l}</li>)}
              </ul>
              {successSentence(tally, remaining ?? 0) && (
                <div className="text-xs font-medium text-green-700">{successSentence(tally, remaining ?? 0)}</div>
              )}
              {failures.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setShowFailures((v) => !v)}>
                  <AlertTriangle className="w-4 h-4 mr-1" /> Voir les échecs ({failures.length})
                </Button>
              )}
            </div>
          )}
          {showFailures && failures.length > 0 && (
            <ul className="text-xs space-y-1 border-t border-border pt-2">
              {failures.map((f) => (
                <li key={f.slug} className="flex flex-wrap gap-2">
                  <span className="font-medium">/{f.slug}</span>
                  <Badge variant="outline" className="text-[10px]">{f.reason}</Badge>
                  <span className="text-muted-foreground">{cityName(f.slug.split("-").slice(-1)[0])}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Publier les {nf(stats.ready.length)} pages prêtes</DialogTitle></DialogHeader>
          <div className="space-y-1.5 text-sm">
            {confirmationLines({
              ready: stats.ready.length, alreadyPublished: stats.published,
              excluded: stats.excluded, errors: stats.errors, toCheck: Math.max(0, stats.toCheck),
            }).map((l) => <p key={l}>{l}</p>)}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button onClick={() => { setConfirmOpen(false); void run(); }}>
              Publier les {nf(stats.ready.length)} pages
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
