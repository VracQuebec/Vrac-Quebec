import { useEffect, useMemo, useState } from "react";
import CityCoverageDialog from "@/components/seo/CityCoverageDialog";
import { coverageLabel, coveragePct } from "@/lib/seo/cityCoverage";
import { useSeoControlCenter, type ControlCityRow, type ControlProblem } from "@/lib/seo/useSeoControlCenter";
import { useSeoPipelineV2 } from "@/lib/seo/useSeoPipelineV2";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CityPagesDialog from "@/components/seo/CityPagesDialog";
import { CityDetailDialog } from "@/components/seo/CityGenerator";
import { useCityGeneration } from "@/lib/seo/useCityGeneration";
import { repairSeoPages } from "@/lib/seo/useSeoCityMatrix";
import CityCombinationAudit from "@/components/seo/CityCombinationAudit";
import DraftAudit from "@/components/seo/DraftAudit";
import QaControlPanel from "@/components/seo/QaControlPanel";
import PublishReadyPanel from "@/components/seo/PublishReadyPanel";
import { useGlobalGeneration } from "@/lib/seo/useGlobalGeneration";
import { summarize } from "@/lib/seo/cityAudit";
import { collectFixes, type QualityFix } from "@/lib/seo/coverageDisplay";
import { fetchSeoStats, type SeoStats } from "@/lib/seo/api";
import {
  canStartGlobal, confirmationLines, finalSummary, failureNotice,
  globalPhase, PHASE_LABEL, runProgress, shouldOfferRetry,
} from "@/lib/seo/globalGeneration";
import {
  Play, Pause, Square, Rocket, RefreshCw, Send, ListRestart,
  Loader2, AlertTriangle, ExternalLink, FileText, CheckCircle2, Wand2,
} from "lucide-react";

/** Champs lus en lecture seule pour l'encadré « Pages à corriger » (critères de qualité). */
type SeoPageRow = {
  slug: string; city_slug: string; title: string | null;
  status: string; meta_title: string | null; internal_link_count: number | null;
};

type FilterKey = "all" | "done" | "partial" | "running" | "todo" | "error";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "done", label: "Pages prévues créées" },
  { key: "partial", label: "Partielles" },
  { key: "running", label: "En cours" },
  { key: "todo", label: "En attente" },
  { key: "error", label: "Avec erreurs" },
];

const STATUS_META: Record<ControlCityRow["status"], { label: string; className: string; dot: string }> = {
  done:    { label: "PAGES ACTUELLEMENT COUVERTES", className: "bg-green-500/15 text-green-700 border-green-500/30", dot: "bg-green-500" },
  partial: { label: "PAGES PRÉVUES À CRÉER", className: "bg-amber-500/15 text-amber-700 border-amber-500/30", dot: "bg-amber-500" },
  running: { label: "EN COURS", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30", dot: "bg-yellow-500" },
  error:   { label: "ERREUR",   className: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive" },
  todo:    { label: "EN ATTENTE",  className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

function nf(n: number) { return n.toLocaleString("fr-CA"); }

export default function PipelineControlCenter() {
  const { state, loading, error, reload } = useSeoControlCenter();
  const { pause, resume, stop, retryErrors } = useSeoPipelineV2();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(24);
  const [busy, setBusy] = useState<string | null>(null);
  const [logsCity, setLogsCity] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [pagesCity, setPagesCity] = useState<{ slug: string; name: string } | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [workSlug, setWorkSlug] = useState<string | null>(null);
  const [coverageCity, setCoverageCity] = useState<{ slug: string; name: string } | null>(null);
  // Même logique de génération que le Générateur (aucune architecture parallèle).
  const gen = useCityGeneration();
  const workCity = workSlug ? gen.bySlug.get(workSlug) ?? null : null;

  // ── COUVERTURE SEO — lectures complémentaires (aucune écriture) ──
  // Pages totales / villes historiques : seo_dashboard_stats (même source que le reste du tableau de bord).
  const [stats, setStats] = useState<SeoStats | null>(null);
  // Pages à corriger : critères de qualité (audit) appliqués en lecture seule sur les pages réelles.
  const [fixRows, setFixRows] = useState<QualityFix<SeoPageRow>[] | null>(null);
  useEffect(() => { void fetchSeoStats().then(setStats).catch(() => setStats(null)); }, []);
  useEffect(() => {
    // Lecture complète (pagination) : la table dépasse 1 000 pages.
    void (async () => {
      const all: SeoPageRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("seo_pages")
          .select("slug, city_slug, title, status, meta_title, internal_link_count")
          .range(from, from + 999);
        if (error) break;
        all.push(...((data ?? []) as SeoPageRow[]));
        if (!data || data.length < 1000) break;
      }
      setFixRows(collectFixes(all));
    })();
  }, []);
  // Statuts des villes déduits uniquement des chiffres réels du Centre de pilotage.
  const citySummary = useMemo(() => summarize(state?.cities ?? []), [state]);
  // ── Génération globale (orchestration du moteur existant) ──
  const [confirmOpen, setConfirmOpen] = useState(false);
  const activeRun = state?.active_run ?? null;
  const phase = globalPhase(activeRun as never);
  const global = useGlobalGeneration(phase === "running" || phase === "paused");
  const startable = canStartGlobal(global.preview, activeRun as never);
  const prog = runProgress(activeRun as never);

  async function launchGlobal() {
    setConfirmOpen(false);
    try {
      const r = await global.start();
      await reload();
      toast({
        title: r.created
          ? `Génération lancée sur ${r.cities} ville(s)`
          : "Génération déjà en cours — rien n'a été relancé",
        description: "Les nouvelles pages sont créées en brouillon. Aucune publication automatique.",
      });
    } catch (e) {
      toast({ title: "Lancement impossible", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  }

  const totals = state?.totals ?? null;
  const run = state?.active_run ?? null;
  const pipelineState = state?.pipeline_state ?? "completed";
  // Progression = GÉNÉRATION. La publication reste manuelle et ne change jamais un statut.
  const globalPct = totals && totals.target_total > 0
    ? Math.round((totals.generated / totals.target_total) * 100) : 0;
  const publishedPct = totals && totals.target_total > 0
    ? Math.round((totals.published / totals.target_total) * 100) : 0;
  // Une vraie alerte uniquement : erreurs réelles, tâches interrompues ou génération arrêtée.
  // Les combinaisons potentielles restantes ne déclenchent jamais d'alerte.
  const actionRequired =
    (totals?.errors ?? 0) > 0 ||
    (state?.stalled_tasks ?? 0) > 0 ||
    (!!run && !["running", "queued", "completed"].includes(run.status));

  const cities = useMemo(() => {
    const list = state?.cities ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((c) =>
      (filter === "all" || (filter === "error" ? c.errors > 0 : c.status === filter)) &&
      (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q))
    );
  }, [state, filter, search]);

  const errorProblems = useMemo(
    () => (state?.problems ?? []).filter((p) => p.gen_state === "error" || p.gen_state === "invalid"),
    [state],
  );

  async function act(key: string, fn: () => Promise<void>, okMsg: string) {
    setBusy(key);
    try { await fn(); await reload(); toast({ title: okMsg }); }
    catch (e) { toast({ title: "Erreur", description: e instanceof Error ? e.message : "Action impossible", variant: "destructive" }); }
    finally { setBusy(null); }
  }

  async function openLogs(slug: string) {
    setLogsCity(slug); setLogs([]);
    const { data } = await supabase.from("seo_page_tasks")
      .select("id, city_slug, material_slug, service_slug, kind, status, step, attempts, qa_score, last_error, updated_at")
      .eq("city_slug", slug).order("updated_at", { ascending: false }).limit(200);
    setLogs(data ?? []);
  }

  return (
    <div className="space-y-4">
      {/* ── En-tête + contrôles globaux ─────────────────────────── */}
      <Card className="p-4 md:p-6 space-y-4">
        <header className="flex flex-wrap items-start gap-3 justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold flex items-center gap-2">
              <Rocket className="w-5 h-5 text-primary" /> Centre de pilotage SEO
            </h2>
            <p className="text-xs text-muted-foreground">
              Chiffres calculés en direct depuis la base (pages, villes, tâches). Aucune estimation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void reload()} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Rafraîchir
            </Button>
            {!run && (
              <Button size="sm" className="gap-2" disabled={!startable.allowed || global.starting || global.loading}
                title={startable.allowed ? "Génère uniquement les pages pertinentes manquantes" : startable.reason}
                onClick={() => setConfirmOpen(true)}>
                {global.starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Générer toutes les pages manquantes
              </Button>
            )}
            {run && ["running", "queued"].includes(run.status) && (
              <Button size="sm" variant="outline" onClick={() => act("pause", () => pause(run.id), "Pipeline en pause")} className="gap-2"><Pause className="w-4 h-4" /> Pause</Button>
            )}
            {run?.status === "paused" && (
              <Button size="sm" onClick={() => act("resume", () => resume(run.id), "Pipeline reprise")} className="gap-2"><Play className="w-4 h-4" /> Reprendre</Button>
            )}
            {run && (
              <Button size="sm" variant="ghost" onClick={() => act("stop", () => stop(run.id), "Pipeline arrêtée")} className="gap-2"><Square className="w-4 h-4" /> Arrêter</Button>
            )}
          </div>
        </header>

        {error && <div className="text-sm text-destructive">{error}</div>}
        {loading && !state && (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
        )}

        {totals && (
          <>
            {/* ── COUVERTURE SEO — source officielle : seo_control_center() (même logique que le Générateur) ── */}
            <section className="rounded-xl border border-border p-4 md:p-5 space-y-4">
              <div>
                <h3 className="text-sm font-display font-bold tracking-wide">COUVERTURE SEO</h3>
                <p className="text-xs text-muted-foreground">
                  Même source que le Générateur : uniquement les combinaisons pertinentes (municipalité active du
                  registre × matériau réellement demandé sur le territoire × service actif). Aucune combinaison
                  théorique dans ces chiffres.
                </p>
              </div>

              {/* Métrique principale */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Combinaisons pertinentes créées</div>
                    <div className="text-4xl font-display font-extrabold text-primary leading-tight">
                      {nf(totals.generated)} <span className="text-xl text-muted-foreground font-bold">/ {nf(totals.target_total)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Couverture</div>
                    <div className="text-4xl font-display font-extrabold text-primary leading-tight">
                      {globalPct}<span className="text-lg text-muted-foreground font-bold"> %</span>
                    </div>
                  </div>
                </div>
                <Progress value={globalPct} className="h-2 mt-3" />
                <div className="text-xs text-muted-foreground mt-2">
                  Publication (manuelle) : {publishedPct}% — {nf(totals.published)} publiée(s), {nf(totals.drafts)} en brouillon.
                  Une page générée n'est jamais publiée automatiquement.
                </div>
              </div>

              {/* Tuiles officielles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
                <Kpi label="Municipalités analysées" value={nf(state.cities.length)} hint="Registre municipal actuel" />
                <Kpi label="Combinaisons pertinentes" value={nf(totals.target_total)} hint="Ville × matériau × service" />
                <Kpi label="Combinaisons créées" value={nf(totals.generated)} tone="good" hint="Pages existantes, brouillons inclus" />
                <button type="button" onClick={() => setProblemsOpen(true)} className="text-left">
                  <Kpi label="Combinaisons manquantes" value={nf(totals.remaining)} tone={totals.remaining > 0 ? "bad" : "muted"} hint="Pages pertinentes non générées — voir la liste" />
                </button>
                <Kpi label="Pages publiées" value={nf(totals.published)} tone="good" hint="En ligne" />
                <Kpi label="Pages en brouillon" value={nf(totals.drafts)} hint="Générées, à publier manuellement" />
                <Kpi label="Pages à corriger" value={fixRows ? nf(fixRows.length) : "…"} tone={fixRows && fixRows.length > 0 ? "bad" : "muted"} hint="Qualité — voir l'encadré" />
                <button type="button" onClick={() => setErrorsOpen(true)} className="text-left">
                  <Kpi label="Pages avec erreurs" value={nf(totals.errors)} tone={totals.errors > 0 ? "bad" : "muted"} hint="Génération — voir la liste" />
                </button>
                <Kpi label="Villes complètes" value={`${nf(citySummary.complete)} / ${nf(state.cities.length)}`} tone={citySummary.complete === state.cities.length ? "good" : undefined} hint="Toutes les combinaisons créées" />
                <Kpi label="Villes incomplètes" value={nf(citySummary.incomplete)} tone={citySummary.incomplete > 0 ? "bad" : "muted"} hint="Certaines combinaisons manquent" />
                <Kpi label="Villes sans page" value={nf(citySummary.none)} tone={citySummary.none > 0 ? "bad" : "muted"} hint="Aucune page générée" />
                <Kpi label="Villes à vérifier" value={nf(citySummary.check)} tone={citySummary.check > 0 ? "bad" : "muted"} hint="Incohérence à contrôler" />
              </div>

              {/* Pages existantes — jamais mélangées au taux de couverture */}
              <div className="rounded-lg border border-border bg-background/50 p-3 text-xs space-y-1">
                <div className="font-semibold text-sm">Pages existantes : {stats ? nf(stats.pages_total) : "…"} au total</div>
                <p className="text-muted-foreground">
                  {nf(totals.generated)} pages correspondent aux combinaisons pertinentes actuelles du Générateur.
                  {stats && stats.pages_total > totals.generated && (
                    <> Les {nf(stats.pages_total - totals.generated)} pages restantes correspondent aux{" "}
                    {nf(stats.cities_historical ?? 0)} villes historiques hors registre municipal actuel (pages
                    conservées, jamais supprimées).</>
                  )}
                </p>
              </div>

              {/* Encadré « Pages à corriger » — lecture seule, aucune correction automatique */}
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-2">
                <div className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Pages à corriger ({fixRows ? nf(fixRows.length) : "…"})
                </div>
                {fixRows === null ? (
                  <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Vérification de la qualité…</p>
                ) : fixRows.length === 0 ? (
                  <p className="text-green-700 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> Aucune page à corriger.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {fixRows.map((f) => {
                      const cityName = state.cities.find((c) => c.slug === f.city_slug)?.name ?? f.city_slug;
                      return (
                        <li key={f.slug} className="flex flex-wrap items-center gap-2">
                          <strong>{cityName}</strong>
                          <span className="text-muted-foreground">{f.title ?? f.slug}</span>
                          <Badge variant="outline" className="text-[10px]">{f.status === "published" ? "Publiée" : "Brouillon"}</Badge>
                          <span className="text-destructive">{f.reason}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <div className="rounded-lg border border-border bg-background/50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Badge variant="outline" className={
                  pipelineState === "running" ? "bg-primary/15 text-primary border-primary/30 gap-1"
                    : actionRequired ? "bg-destructive/15 text-destructive border-destructive/30"
                    : "bg-green-500/15 text-green-700 border-green-500/30"
                }>
                  {pipelineState === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                  {pipelineState === "running" ? "GÉNÉRATION EN COURS" : actionRequired ? "ACTION REQUISE" : "MODE MANUEL — VILLE PAR VILLE"}
                </Badge>
                {run?.current_city_slug && <span className="text-muted-foreground">Ville : <strong className="text-foreground">{run.current_city_slug}</strong></span>}
                <span className="text-muted-foreground">
                  File : {nf(state?.queued_tasks ?? 0)} tâche{(state?.queued_tasks ?? 0) > 1 ? "s" : ""}
                  {(state?.queued_tasks ?? 0) === 0 ? " — aucune tâche en attente" : ""}
                </span>
                {(state?.processing_tasks ?? 0) > 0 && <span className="text-muted-foreground">Traitement : {state?.processing_tasks}</span>}
                {(state?.stalled_tasks ?? 0) > 0 && <span className="text-destructive">Interrompues : {state?.stalled_tasks}</span>}
              </div>
              {actionRequired && (
                <div className="mt-2 text-xs text-destructive">
                  {[
                    totals.errors > 0 ? `${nf(totals.errors)} page(s) en erreur ou à corriger` : null,
                    (state?.stalled_tasks ?? 0) > 0 ? `${state?.stalled_tasks} tâche(s) interrompue(s)` : null,
                    run && run.status !== "running" && run.status !== "completed" ? `Génération ${run.status} sur ${run.current_city_slug ?? "une ville"}` : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>

            {/* ── Génération globale : état, progression, résumé ───── */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="text-sm font-semibold flex items-center gap-2">
                  {phase === "running" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  {PHASE_LABEL[phase]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(phase === "interrupted" || phase === "paused") && activeRun && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                      onClick={() => act("resume-global", () => resume(activeRun.id), "Génération reprise")}>
                      <Play className="w-3 h-3" /> Reprendre la génération
                    </Button>
                  )}
                  {shouldOfferRetry(activeRun as never, global.preview) && activeRun && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                      onClick={() => act("retry-global", () => retryErrors(activeRun.id), "Erreurs remises en file")}>
                      <ListRestart className="w-3 h-3" /> Régénérer les erreurs
                    </Button>
                  )}
                  {shouldOfferRetry(activeRun as never, global.preview) && (
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setErrorsOpen(true)}>
                      Voir les erreurs
                    </Button>
                  )}
                </div>
              </div>

              {phase === "running" || phase === "completed" ? (
                <>
                  <Progress value={prog.pct} className="h-2" />
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>{nf(prog.done)} / {nf(prog.total)} pages · {prog.pct} %</span>
                    {activeRun?.current_city_slug && <span>Ville actuelle : <strong className="text-foreground">{activeRun.current_city_slug}</strong></span>}
                    <span className="text-green-700">✓ Générées : {nf(prog.succeeded)}</span>
                    <span className="text-destructive">⚠ Erreurs : {nf(prog.failed)}</span>
                    <span>○ Restantes : {nf(prog.remaining)}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {global.preview.remaining > 0
                    ? "Génère uniquement les pages pertinentes qui ne sont pas encore créées. Les pages existantes et publiées sont protégées."
                    : "Aucune page pertinente à générer."}
                </p>
              )}

              {phase === "completed" && global.baseline && (
                <div className="rounded-md border border-border bg-background/60 p-2 text-xs space-y-0.5">
                  <div className="font-semibold">Génération terminée</div>
                  {finalSummary(global.baseline, global.preview, activeRun as never).map((l) => <div key={l}>{l}</div>)}
                  {failureNotice(activeRun as never) && (
                    <div className="text-destructive">{failureNotice(activeRun as never)}</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      {/* ── État des villes ─────────────────────────────────────── */}
      <Card className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h3 className="text-base font-display font-bold">État des villes ({state?.cities.length ?? 0})</h3>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une ville…" className="h-9 w-full sm:w-56" />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"}
              className="h-8 text-xs" onClick={() => { setFilter(f.key); setVisible(24); }}>
              {f.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cities.slice(0, visible).map((c) => {
            const genRow = gen.bySlug.get(c.slug) ?? null;
            const isRunning = gen.run?.citySlug === c.slug || gen.dbActive?.city_slug === c.slug;
            const lockedByOther = !!gen.lockedBy && gen.lockedBy !== c.slug;
            const meta = STATUS_META[isRunning ? "running" : c.status];
            const liveDone = gen.run?.citySlug === c.slug ? gen.run.done : gen.dbActive?.city_slug === c.slug ? gen.dbActive.done : null;
            const liveTotal = gen.run?.citySlug === c.slug ? gen.run.total : gen.dbActive?.city_slug === c.slug ? gen.dbActive.total : null;
            return (
              <div key={c.slug} onClick={() => setWorkSlug(c.slug)}
                className="rounded-xl border border-border bg-card p-3 space-y-2.5 cursor-pointer hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />{c.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.slug}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${meta.className}`}>{meta.label}</Badge>
                </div>

                <Progress value={coveragePct(c.generated, state?.totals.per_city ?? 0)} className="h-2" />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs">
                  <span>{c.generated} page{c.generated > 1 ? "s" : ""} existante{c.generated > 1 ? "s" : ""}</span>
                  <span>{c.published} publiée{c.published > 1 ? "s" : ""}</span>
                  <span>{c.drafts} en brouillon</span>
                  <span>{c.remaining} prévue{c.remaining > 1 ? "s" : ""} non créée{c.remaining > 1 ? "s" : ""}</span>
                  <span className={c.errors > 0 ? "text-destructive font-medium" : ""}>{c.errors} erreur{c.errors > 1 ? "s" : ""}</span>
                  <span className="font-semibold">Couverture SEO : {coverageLabel(c.generated, state?.totals.per_city ?? 0)}</span>
                </div>

                {isRunning && liveTotal ? (
                  <div className="text-xs text-yellow-700">
                    🟡 {liveDone} / {liveTotal} page(s) traitée(s)
                    {gen.run?.citySlug === c.slug && gen.run.label ? ` · ${gen.run.label}` : ""}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" onClick={() => setPagesCity({ slug: c.slug, name: c.name })}>
                    <FileText className="w-3 h-3" /> Voir les pages
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" onClick={() => setCoverageCity({ slug: c.slug, name: c.name })}>
                    <FileText className="w-3 h-3" /> Couverture
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1"
                    disabled={!genRow || gen.verifying === c.slug || isRunning}
                    onClick={() => genRow && void gen.verifyCity(genRow)}>
                    {gen.verifying === c.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Vérifier la ville
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1"
                    disabled={c.errors === 0 || busy === `retry-${c.slug}`}
                    onClick={() => act(`retry-${c.slug}`, async () => {
                      await repairSeoPages({ citySlug: c.slug, allErrors: true });
                    }, `Régénération lancée — ${c.name}`)}>
                    {busy === `retry-${c.slug}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListRestart className="w-3 h-3" />} Régénérer les erreurs
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1"
                    disabled={c.unpublished === 0 || busy === `pub-${c.slug}`}
                    onClick={() => act(`pub-${c.slug}`, async () => { await supabase.rpc("seo_city_publish_missing" as never, { _city_slug: c.slug } as never); }, `Pages non publiées publiées — ${c.name}`)}>
                    <Send className="w-3 h-3" /> Publier les non publiées
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => openLogs(c.slug)}>Voir les logs</Button>
                  {c.remaining > 0 && (
                    <Button size="sm" className="h-8 px-2.5 text-xs gap-1"
                      disabled={!genRow || isRunning || lockedByOther}
                      onClick={() => genRow && void gen.generateCity(genRow)}>
                      {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {c.generated > 0 ? "Reprendre la génération" : "Générer cette ville"}
                    </Button>
                  )}
                </div>
                {lockedByOther && c.remaining > 0 && (
                  <div className="text-[10px] text-muted-foreground">Une autre ville est en cours de génération.</div>
                )}
              </div>
            );
          })}
        </div>

        {cities.length === 0 && !loading && (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">Aucune ville pour ce filtre.</div>
        )}
        {cities.length > visible && (
          <div className="text-center">
            <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + 24)}>Afficher plus ({cities.length - visible})</Button>
          </div>
        )}
      </Card>

      {/* ── Audit lecture seule des combinaisons par ville ───────── */}
      <CityCombinationAudit />

      {/* ── Contrôle qualité lecture seule des pages à vérifier ─── */}
      <QaControlPanel cities={state?.cities ?? []} />

      {/* ── Audit lecture seule des brouillons ──────────────────── */}
      <DraftAudit cities={state?.cities ?? []} />

      {/* ── Publication par lots des pages prêtes ───────────────── */}
      <PublishReadyPanel cities={state?.cities ?? []} />

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Générer toutes les pages manquantes</DialogTitle></DialogHeader>
          <div className="space-y-1.5 text-sm">
            {confirmationLines(global.preview).map((l) => <p key={l}>{l}</p>)}
            <p className="pt-2 font-medium">Voulez-vous lancer la génération complète ?</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button onClick={() => void launchGlobal()} disabled={global.starting}>
              {global.starting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Lancer la génération
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={errorsOpen} onOpenChange={setErrorsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Pages en erreur — {totals?.errors ?? 0}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
            {errorProblems.length === 0 && <div className="text-muted-foreground">Aucune erreur réelle : toutes les pages prévues existent et sont valides.</div>}
            {errorProblems.map((problem) => (
              <ProblemRow key={`${problem.city_slug}|${problem.material_slug ?? ""}|${problem.service_slug ?? ""}`} problem={problem} busy={busy}
                onRepair={() => act(`problem-${problem.city_slug}-${problem.material_slug ?? problem.service_slug ?? "hub"}`, async () => {
                  await repairSeoPages({ citySlug: problem.city_slug, materialSlug: problem.material_slug, serviceSlug: problem.service_slug });
                }, `Régénération terminée — ${problem.city_name} · ${problem.label}`)} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={problemsOpen} onOpenChange={setProblemsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>Pages prévues non encore générées — {state?.problems.length ?? 0}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(state?.problems ?? []).map((problem) => (
              <ProblemRow key={`${problem.city_slug}|${problem.material_slug ?? ""}|${problem.service_slug ?? ""}`} problem={problem} busy={busy}
                onRepair={() => act(`problem-${problem.city_slug}-${problem.material_slug ?? problem.service_slug ?? "hub"}`, async () => {
                  await repairSeoPages({ citySlug: problem.city_slug, materialSlug: problem.material_slug, serviceSlug: problem.service_slug });
                }, `Régénération terminée — ${problem.city_name} · ${problem.label}`)} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logsCity} onOpenChange={(o) => !o && setLogsCity(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Logs — {logsCity}</DialogTitle></DialogHeader>
          <div className="space-y-1 text-xs font-mono">
            {logs.length === 0 && <div className="text-muted-foreground">Aucune tâche enregistrée pour cette ville.</div>}
            {logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 py-1 border-b border-border last:border-0">
                <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                <span>{[l.material_slug, l.service_slug].filter(Boolean).join(" · ") || "hub"}</span>
                <span className="text-muted-foreground">{l.step ?? "—"}</span>
                <span className="ml-auto text-muted-foreground">{new Date(l.updated_at).toLocaleString("fr-CA")}</span>
                {l.last_error && <span className="text-destructive w-full break-words">{l.last_error}</span>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CityDetailDialog
        city={workCity}
        run={gen.run && workCity && gen.run.citySlug === workCity.slug ? gen.run : null}
        lockedByOther={!!gen.lockedBy && gen.lockedBy !== workCity?.slug}
        onClose={() => { setWorkSlug(null); void reload(); }}
        onGenerate={(city) => void gen.generateCity(city)}
        onRegenerateErrors={(city) => void gen.regenerateErrors(city)}
        onGenerateSlot={(city, slot) => void gen.generate(city, [slot], slot.state === "invalid" ? "repair" : "missing")}
      />

      <CityCoverageDialog city={coverageCity} onClose={() => setCoverageCity(null)} />

      <CityPagesDialog
        citySlug={pagesCity?.slug ?? null}
        cityName={pagesCity?.name}
        onClose={() => setPagesCity(null)}
        onChanged={() => void reload()}
      />
    </div>
  );
}

function ProblemRow({ problem, busy, onRepair }: { problem: ControlProblem; busy: string | null; onRepair: () => void }) {
  const key = `problem-${problem.city_slug}-${problem.material_slug ?? problem.service_slug ?? "hub"}`;
  const status = problem.gen_state === "error" ? "ERREUR" : problem.gen_state === "invalid" ? "INVALIDE" : problem.gen_state === "pending" ? "EN ATTENTE" : "À GÉNÉRER";
  return (
    <div className="rounded-lg border border-border p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{problem.city_name}</strong><span>— {problem.label}</span>
        <Badge variant="outline">{problem.kind === "material" ? "Matériau" : problem.kind === "service" ? "Service" : "Hub"}</Badge>
        <Badge variant="outline" className={problem.gen_state === "error" ? "text-destructive border-destructive/30" : "text-amber-700 border-amber-500/30"}>{status}</Badge>
        <Button size="sm" className="h-7 ml-auto" disabled={busy === key || problem.gen_state === "pending"} onClick={onRepair}>
          {busy === key ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} Régénérer
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span>Statut tâche : {problem.task_status ?? "aucune"}</span>
        <span>Tentatives : {problem.task_attempts ?? 0}</span>
        <span>Dernière tentative : {problem.task_updated_at ? new Date(problem.task_updated_at).toLocaleString("fr-CA") : "jamais"}</span>
      </div>
      {(problem.task_error || problem.issues?.length) && <div className="text-destructive break-words">{problem.task_error ?? problem.issues?.join(" · ")}</div>}
    </div>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: "good" | "bad" | "muted"; hint?: string }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3 h-full">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold leading-tight ${cls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
