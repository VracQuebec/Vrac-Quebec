// Carte « CONTRÔLE QUALITÉ » du Centre de pilotage — LECTURE SEULE.
// Le contrôle lit les pages et calcule un verdict en mémoire : aucune page n'est
// publiée, créée, supprimée ni modifiée, et aucune écriture n'est faite en base.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShieldCheck, ExternalLink } from "lucide-react";
import type { ControlCityRow } from "@/lib/seo/useSeoControlCenter";
import { classifyDraft, type DraftPage } from "@/lib/seo/draftAudit";
import {
  runQaControl, summarizeQaControl, mergeResults, duplicateTitles,
  QA_VERDICT_LABEL, type QaControlPage, type QaControlResult, type QaVerdict,
} from "@/lib/seo/qaControl";

const SELECT =
  "id, slug, city_slug, material_slug, service_slug, title, h1, status, meta_title, meta_description, " +
  "content_html, internal_link_count, internal_links, word_count, qa_last_score, qa_last_checked_at, " +
  "qa_blockers, proc_status, proc_error, priority_locked, last_generated_at";

type Row = DraftPage & QaControlPage;

const TONE: Record<QaVerdict, string> = {
  ready: "bg-green-500/15 text-green-700 border-green-500/30",
  fix: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  blocked: "bg-destructive/15 text-destructive border-destructive/30",
};

const FILTERS: Array<{ key: QaVerdict | "all"; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "ready", label: "Prêtes à publier" },
  { key: "fix", label: "À corriger" },
  { key: "blocked", label: "Erreurs bloquantes" },
];

function nf(n: number) { return n.toLocaleString("fr-CA"); }

export default function QaControlPanel({ cities }: { cities: ControlCityRow[] }) {
  const [pages, setPages] = useState<Row[] | null>(null);
  const [dups, setDups] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<QaControlResult[]>([]);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<QaVerdict | "all">("all");
  const [visible, setVisible] = useState(25);

  useEffect(() => {
    void (async () => {
      const all: Row[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from("seo_pages").select(SELECT).range(from, from + 499);
        if (error) break;
        all.push(...((data ?? []) as unknown as Row[]));
        if (!data || data.length < 500) break;
      }
      setDups(duplicateTitles(all));
      setPages(all.filter((p) => p.status === "draft" && classifyDraft(p) === "check"));
    })();
  }, []);

  const readyDraftsBefore = useMemo(
    () => (pages === null ? 0 : 0),
    [pages],
  );

  const targets = pages ?? [];
  const summary = useMemo(() => summarizeQaControl(results, targets.length), [results, targets.length]);

  const run = useCallback(async () => {
    if (!pages || running) return;
    setRunning(true);
    setResults([]);
    let acc: QaControlResult[] = [];
    for (let i = 0; i < pages.length; i += 10) {
      const batch = pages.slice(i, i + 10).map((p) =>
        runQaControl(p, { duplicateTitle: dups.has((p.meta_title ?? "").trim()) }),
      );
      acc = mergeResults(acc, batch);
      setResults(acc);
      // Laisse l'interface rafraîchir la progression entre les lots.
      await new Promise((r) => setTimeout(r, 0));
    }
    setRunning(false);
  }, [pages, dups, running]);

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
            <ShieldCheck className="w-4 h-4 text-primary" /> Contrôle qualité — {nf(targets.length)} pages à vérifier
          </h3>
          <p className="text-xs text-muted-foreground">
            Contrôle automatisé en lecture seule : aucune page n'est publiée, corrigée, créée ni supprimée.
            Relançable à volonté, sans doublon.
          </p>
        </div>
        <Button size="sm" onClick={() => void run()} disabled={running || pages === null}>
          {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
          {running ? "Contrôle en cours…" : results.length ? "Relancer le contrôle" : "Lancer le contrôle"}
        </Button>
      </header>

      {pages === null ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Lecture des pages…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {[
              { label: "Pages contrôlées", value: summary.checked },
              { label: "Pages prêtes", value: summary.ready },
              { label: "Pages à corriger", value: summary.fix },
              { label: "Erreurs bloquantes", value: summary.blocked },
              { label: "Restantes à contrôler", value: summary.remaining },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-background/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
                <div className="text-xl font-bold">{nf(k.value)}</div>
              </div>
            ))}
          </div>

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
            restent des décisions manuelles. {readyDraftsBefore === 0 ? "" : null}
          </p>
        </>
      )}
    </Card>
  );
}
