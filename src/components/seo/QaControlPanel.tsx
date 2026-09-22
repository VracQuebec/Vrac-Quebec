// Carte « CONTRÔLE QUALITÉ » du Centre de pilotage — LECTURE SEULE.
// Le contrôle lit les pages et calcule un verdict en mémoire : aucune page n'est
// publiée, créée, supprimée ni modifiée, et aucune écriture n'est faite en base.
// Périmètre : toutes les pages PERTINENTES actuelles (municipalités du registre),
// jamais un échantillon et jamais un ancien signalement historique.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSeoPagesPaged } from "@/lib/seo/useStrategicCounters";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShieldCheck, ExternalLink, RefreshCw } from "lucide-react";
import type { ControlCityRow } from "@/lib/seo/useSeoControlCenter";
import { CONFIRMED_NOT_INDEXED } from "@/lib/seo/strategicCounters";
import {
  runQaControl, summarizeQaControl, mergeResults, duplicateTitles,
  QA_VERDICT_LABEL, type QaControlPage, type QaControlResult, type QaVerdict,
} from "@/lib/seo/qaControl";


type Row = QaControlPage & {
  status: string;
  proc_status?: string | null;
  proc_error?: string | null;
  noindex?: boolean | null;
  google_index_status?: string | null;
};

const LAST_RUN_KEY = "seo-qa-control-last-run";

const TONE: Record<QaVerdict, string> = {
  ready: "bg-green-500/15 text-green-700 border-green-500/30",
  fix: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  blocked: "bg-destructive/15 text-destructive border-destructive/30",
};

const FILTERS: Array<{ key: QaVerdict | "all"; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "ready", label: "Conformes" },
  { key: "fix", label: "Améliorations facultatives" },
  { key: "blocked", label: "Erreurs bloquantes" },
];

function nf(n: number) { return n.toLocaleString("fr-CA"); }

function fmtDateTime(iso: string | null): string {
  if (!iso) return "jamais";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })} à ${d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function QaControlPanel({ cities }: { cities: ControlCityRow[] }) {
  const [pages, setPages] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dups, setDups] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<QaControlResult[]>([]);
  const [running, setRunning] = useState(false);
  const [reading, setReading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(() => localStorage.getItem(LAST_RUN_KEY));
  const [filter, setFilter] = useState<QaVerdict | "all">("all");
  const [visible, setVisible] = useState(25);

  // Clé stable : le registre est rechargé périodiquement, on ne relit les pages
  // que si la liste des municipalités change réellement.
  const cityKey = cities.map((c) => c.slug).sort().join(",");
  const citySlugs = useMemo(() => new Set(cityKey ? cityKey.split(",") : []), [cityKey]);

  /**
   * Lecture des pages À LA DEMANDE : elle transfère le contenu complet des pages
   * et ne doit jamais partir automatiquement à l'ouverture du Centre.
   */
  const loadPages = useCallback(async (): Promise<{ rows: Row[]; dups: Set<string> } | null> => {
    setPages(null);
    setLoadError(null);
    setReading(true);
    let all: Row[] = [];
    try {
      all = await fetchSeoPagesPaged<Row>(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erreur de lecture");
      setPages([]);
      return null;
    } finally {
      setReading(false);
    }
    const d = duplicateTitles(all);
    setDups(d);
    // Pages pertinentes : municipalités du registre actuel. Sans registre chargé,
    // on retombe sur l'ensemble des pages publiées (jamais un échantillon).
    const targeted = citySlugs.size > 0 ? all.filter((p) => citySlugs.has(p.city_slug)) : all.filter((p) => p.status === "published");
    setPages(targeted);
    return { rows: targeted, dups: d };
  }, [citySlugs]);

  const targets = pages ?? [];
  const summary = useMemo(() => summarizeQaControl(results, targets.length), [results, targets.length]);

  /** Séparation stricte : erreurs réelles d'un côté, rien d'autre n'est compté comme erreur. */
  const errorBreakdown = useMemo(() => {
    const done = new Set(results.map((r) => r.slug));
    const checked = targets.filter((p) => done.has(p.slug));
    const blockedSlugs = new Set(results.filter((r) => r.verdict === "blocked").map((r) => r.slug));
    const faulty = new Set<string>();
    const seo: string[] = [], technical: string[] = [], links: string[] = [], indexation: string[] = [];
    for (const p of checked) {
      if (blockedSlugs.has(p.slug)) { seo.push(p.slug); faulty.add(p.slug); }
      if (p.proc_status === "error" || (p.proc_error ?? "") !== "" || (p.status === "published" && p.noindex === true)) { technical.push(p.slug); faulty.add(p.slug); }
      if ((p.internal_link_count ?? 0) < 2) { links.push(p.slug); faulty.add(p.slug); }
      if (CONFIRMED_NOT_INDEXED.includes(p.google_index_status ?? "")) { indexation.push(p.slug); faulty.add(p.slug); }
    }
    return {
      seo: seo.length,
      technical: technical.length,
      links: links.length,
      indexation: indexation.length,
      /** Pages présentant au moins une erreur réelle aujourd'hui. */
      toFix: faulty.size,
      /** Pages sans aucune erreur réelle (les suggestions facultatives n'en font pas des erreurs). */
      compliant: checked.length - faulty.size,
      /** Suggestions d'amélioration facultatives, jamais des erreurs. */
      optional: results.filter((r) => r.verdict === "fix" && !faulty.has(r.slug)).length,
    };
  }, [results, targets]);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setResults([]);
    setControlErrors([]);
    setDuration(null);
    const startedAt = Date.now();
    // Les pages sont lues au moment du contrôle si elles ne l'ont pas déjà été.
    const loaded = pages ? { rows: pages, dups } : await loadPages();
    if (!loaded) { setRunning(false); return; }
    const { rows: list, dups: titleDups } = loaded;
    let acc: QaControlResult[] = [];
    const failures: string[] = [];
    for (let i = 0; i < list.length; i += 25) {
      const batch: QaControlResult[] = [];
      for (const p of list.slice(i, i + 25)) {
        // Une page illisible est signalée comme erreur de contrôle : elle ne doit
        // jamais interrompre l'ensemble du contrôle.
        try {
          batch.push(runQaControl(p, { duplicateTitle: titleDups.has((p.meta_title ?? "").trim()) }));
        } catch {
          failures.push(p.slug);
        }
      }
      acc = mergeResults(acc, batch);
      setResults(acc);
      setControlErrors([...failures]);
      // Laisse l'interface rafraîchir la progression entre les lots.
      await new Promise((r) => setTimeout(r, 0));
    }
    const at = new Date().toISOString();
    localStorage.setItem(LAST_RUN_KEY, at);
    setLastRun(at);
    setDuration(Math.round((Date.now() - startedAt) / 100) / 10);
    setRunning(false);
  }, [pages, dups, running, loadPages]);


  const rows = useMemo(
    () => (filter === "all" ? results : results.filter((r) => r.verdict === filter)),
    [results, filter],
  );

  const cityName = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <Card className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-display font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Contrôle qualité —{" "}
            {pages ? `${nf(targets.length)} pages pertinentes` : `${nf(cities.length)} municipalités au périmètre`}
          </h3>
          <p className="text-xs text-muted-foreground">
            Contrôle automatisé en lecture seule sur l'état actuel des pages : aucune page n'est publiée, corrigée,
            créée ni supprimée, et aucun ancien signalement n'est réutilisé. Rien n'est lu tant que vous ne lancez
            pas le contrôle.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Dernier contrôle qualité : {fmtDateTime(lastRun)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void loadPages()} disabled={running || reading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${reading ? "animate-spin" : ""}`} /> Recharger les pages
          </Button>
          <Button size="sm" onClick={() => void run()} disabled={running || reading}>
            {running || reading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            {reading ? "Lecture des pages…" : running ? "Contrôle en cours…" : results.length ? "Relancer le contrôle" : "Lancer le contrôle"}
          </Button>
        </div>
      </header>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          Lecture des pages impossible (source : table des pages SEO) — {loadError}
          <button onClick={() => void loadPages()} className="ml-2 underline">Réessayer</button>
        </div>
      )}

      {pages === null ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2 border border-dashed rounded-lg p-4">
          {reading ? <><Loader2 className="w-4 h-4 animate-spin" /> Lecture des pages…</>
            : "Aucun contrôle exécuté pour l'instant — le Centre reste léger tant que vous ne lancez pas le contrôle."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {[
              { label: "Pages contrôlées", value: summary.checked },
              { label: "Pages conformes", value: errorBreakdown.compliant },
              { label: "Pages à corriger (erreurs réelles)", value: errorBreakdown.toFix },
              { label: "Améliorations facultatives", value: errorBreakdown.optional },
              { label: "Restantes à contrôler", value: summary.remaining },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-background/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
                <div className="text-xl font-bold">{nf(k.value)}</div>
              </div>
            ))}
          </div>

          {results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Erreurs SEO", value: errorBreakdown.seo },
                { label: "Erreurs techniques", value: errorBreakdown.technical },
                { label: "Liens internes < 2", value: errorBreakdown.links },
                { label: "Problèmes d'indexation", value: errorBreakdown.indexation },
              ].map((k) => (
                <div key={k.label} className={`rounded-lg border p-2 ${k.value === 0 ? "border-border bg-background/60" : "border-destructive/30 bg-destructive/10"}`}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
                  <div className={`text-xl font-bold ${k.value === 0 ? "" : "text-destructive"}`}>{nf(k.value)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <Progress value={summary.progress} className="h-2" />
            <div className="text-[11px] text-muted-foreground">
              Progression du contrôle : {summary.progress} % ({nf(summary.checked)} / {nf(targets.length)})
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} className="h-8 text-xs"
                onClick={() => { setFilter(f.key); setVisible(25); }}>
                {f.label}
              </Button>
            ))}
          </div>

          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
              Aucun contrôle exécuté pour l'instant — lancez le contrôle pour tester réellement chaque page.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[760px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-2">Municipalité</th>
                      <th className="py-2 px-2">Page</th>
                      <th className="py-2 px-2">Type</th>
                      <th className="py-2 px-2 text-right">Score</th>
                      <th className="py-2 px-2">Problème</th>
                      <th className="py-2 pl-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, visible).map((r) => (
                      <tr key={r.slug} className="border-b border-border/60 align-top">
                        <td className="py-1.5 pr-2 font-medium">{cityName(r.city_slug)}</td>
                        <td className="py-1.5 px-2">
                          <a href={r.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
                            {r.url} <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground">{r.topic}</td>
                        <td className="py-1.5 px-2 text-right font-semibold">{r.score}</td>
                        <td className="py-1.5 px-2">
                          {r.issues.length === 0 ? (
                            <span className="text-muted-foreground">Aucun problème détecté</span>
                          ) : (
                            <ul className="space-y-1">
                              {r.issues.map((i) => (
                                <li key={i.key}>
                                  <span className="font-medium">{i.label}</span> — {i.actual}
                                  <div className="text-muted-foreground">
                                    Attendu : {i.expected} · Action : {i.action}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="py-1.5 pl-2">
                          <Badge variant="outline" className={`text-[10px] ${TONE[r.verdict]}`}>
                            {QA_VERDICT_LABEL[r.verdict]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > visible && (
                <div className="text-center">
                  <Button size="sm" variant="outline" onClick={() => setVisible((v) => v + 25)}>
                    Afficher plus ({rows.length - visible})
                  </Button>
                </div>
              )}
              {rows.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                  Aucune page pour ce filtre.
                </div>
              )}
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            Les pages « à corriger » ne sont jamais modifiées automatiquement : la correction et la publication
            restent des décisions manuelles.
          </p>
        </>
      )}
    </Card>
  );
}
