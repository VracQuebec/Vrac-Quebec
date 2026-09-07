import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Sparkles, X, ExternalLink, AlertTriangle, CheckCircle2, Search,
  RefreshCw, ChevronRight, Check, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import ImproveDialog from "@/components/seo/ImproveDialog";

export type Scope = "to_optimize" | "zero_impressions";

export type Candidate = {
  id: string; slug: string; title: string;
  meta_title: string | null; meta_description: string | null;
  google_index_status: string | null; indexed_at: string | null; published_at: string | null;
  impressions: number; clicks: number; ctr: number; avg_position: number;
  primary_keyword: string | null; top_queries: Array<{ query: string; clicks?: number; impressions?: number }>;
  word_count: number; internal_link_count: number; seo_score: number | null; qa_last_score: number | null;
  backlinks_count: number; intelligence_flags: string[];
  reasons: string[]; priority_level: "haute" | "moyenne" | "basse"; priority_score: number;
  last_improved_at: string | null; improvements_applied: number;
};

export const REASON_LABELS: Record<string, string> = {
  need_meta_rewrite: "Impressions sans clic (meta à réécrire)",
  boost_position: "Position 8–20 (potentiel de boost)",
  not_indexed_14d: "Non indexée depuis 14 j+",
  thin_content: "Contenu trop court (< 600 mots)",
  weak_internal_links: "Maillage interne insuffisant (< 3 liens)",
  bad_meta: "Balises meta hors normes",
  zero_impressions: "Aucune impression sur 28 jours",
};

const CAUSE_LABELS: Record<string, string> = {
  indexation: "Indexation",
  contenu: "Contenu",
  ciblage: "Ciblage SEO",
  mot_cle: "Mot-clé",
  maillage: "Maillage interne",
  autorite: "Autorité",
  seo_local: "SEO local",
  autre: "Autre",
};

/** Cause dominante d'une page sans impression, déduite des données réelles du CRM. */
export function diagnoseZeroImpression(c: Candidate): { cause: string; explanation: string; action: string } {
  if (!c.indexed_at || (c.google_index_status && c.google_index_status !== "indexed")) {
    return {
      cause: "indexation",
      explanation: "La page n'est pas encore indexée par Google : elle ne peut donc générer aucune impression.",
      action: "Vérifier l'indexation (sitemap, ping Google) avant toute réécriture de contenu.",
    };
  }
  if (c.word_count < 600) {
    return {
      cause: "contenu",
      explanation: `Contenu jugé insuffisant (${c.word_count} mots) pour se positionner sur des requêtes concurrentielles.`,
      action: "Enrichir le contenu et les FAQ via l'optimisation IA.",
    };
  }
  if (c.internal_link_count < 3) {
    return {
      cause: "maillage",
      explanation: `Seulement ${c.internal_link_count} lien(s) interne(s) : la page reçoit peu de signal du reste du site.`,
      action: "Régénérer le maillage interne depuis les pages de la même ville / du même matériau.",
    };
  }
  if (!c.top_queries || c.top_queries.length === 0) {
    return {
      cause: "ciblage",
      explanation: "Aucune requête associée dans Search Console : le ciblage sémantique est probablement trop générique ou trop concurrentiel.",
      action: "Retravailler le mot-clé principal, le H1 et le champ sémantique local.",
    };
  }
  if (!c.meta_title || !c.meta_description) {
    return { cause: "mot_cle", explanation: "Balises meta incomplètes : le mot-clé principal n'est pas exprimé clairement.", action: "Réécrire le title et la meta description autour du mot-clé principal." };
  }
  if (c.backlinks_count === 0) {
    return { cause: "autorite", explanation: "Aucun backlink détecté : l'autorité de la page est faible.", action: "Renforcer le maillage interne et la notoriété locale (GBP, blogue)." };
  }
  return { cause: "autre", explanation: "Aucune cause technique évidente détectée à partir des données disponibles.", action: "Surveiller sur le prochain cycle Search Console avant intervention." };
}

/** Analyse individuelle bâtie uniquement à partir des données réelles de la page. */
export function analyzePage(c: Candidate) {
  const good: string[] = [];
  const bad: string[] = [];
  const reco: string[] = [];

  if (c.indexed_at) good.push("Page indexée par Google.");
  else bad.push("Page non indexée (aucune date d'indexation enregistrée).");

  if (c.impressions > 0) good.push(`${c.impressions.toLocaleString("fr-CA")} impressions sur 28 jours.`);
  else bad.push("Aucune impression sur les 28 derniers jours.");

  if (c.clicks > 0) good.push(`${c.clicks} clic(s), CTR de ${(Number(c.ctr) * 100).toFixed(1)} %.`);
  else if (c.impressions >= 100) {
    bad.push("Impressions élevées mais aucun clic : le titre et la description n'incitent pas au clic.");
    reco.push("Réécrire le meta title et la meta description avec le mot-clé principal et un bénéfice concret.");
  }

  if (c.avg_position > 0 && c.avg_position <= 7) good.push(`Bonne position moyenne (${Number(c.avg_position).toFixed(1)}).`);
  if (c.avg_position >= 8 && c.avg_position <= 20) {
    bad.push(`Position moyenne ${Number(c.avg_position).toFixed(1)} : la page est en page 1–2, à un pas du top 5.`);
    reco.push("Enrichir le contenu et le champ sémantique pour gagner des positions.");
  }

  if (c.word_count >= 800) good.push(`Contenu volumineux (${c.word_count} mots).`);
  else {
    bad.push(`Contenu court (${c.word_count} mots).`);
    reco.push("Étendre le contenu à 800–1 200 mots avec des sections H2/H3 et une FAQ.");
  }

  if (c.internal_link_count >= 5) good.push(`${c.internal_link_count} liens internes.`);
  else {
    bad.push(`Maillage interne faible (${c.internal_link_count} lien(s)).`);
    reco.push("Ajouter des liens vers les pages de la même ville, du même matériau et du même service.");
  }

  const mt = c.meta_title?.length ?? 0;
  const md = c.meta_description?.length ?? 0;
  if (mt >= 30 && mt <= 65) good.push(`Meta title conforme (${mt} caractères).`);
  else { bad.push(`Meta title hors normes (${mt} caractères).`); reco.push("Ramener le meta title entre 30 et 65 caractères."); }
  if (md >= 120 && md <= 175) good.push(`Meta description conforme (${md} caractères).`);
  else { bad.push(`Meta description hors normes (${md} caractères).`); reco.push("Ramener la meta description entre 120 et 175 caractères."); }

  if (typeof c.seo_score === "number") (c.seo_score >= 80 ? good : bad).push(`Score SEO interne : ${c.seo_score}/100.`);
  if (c.backlinks_count > 0) good.push(`${c.backlinks_count} backlink(s).`);

  for (const f of c.intelligence_flags ?? []) bad.push(`Diagnostic automatique : ${f}.`);

  const why = (c.reasons ?? []).map((r) => REASON_LABELS[r] ?? r);
  return { good, bad, reco: Array.from(new Set(reco)), why };
}

type JobState = "pending" | "analyzing" | "proposed" | "applied" | "error" | "skipped";

export default function OptimizationCenter({ scope, onClose, onChanged }: {
  scope: Scope; onClose: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [improve, setImprove] = useState<Candidate | null>(null);
  const [jobs, setJobs] = useState<Record<string, { state: JobState; improvementId?: string; message?: string }>>({});
  const [running, setRunning] = useState(false);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<"all" | "haute" | "moyenne" | "basse">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("seo_optimization_candidates" as never, {
      _scope: scope, _limit: 300, _offset: 0,
    } as never);
    if (error) toast.error(error.message);
    else setRows((data ?? []) as unknown as Candidate[]);
    setLoading(false);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (priority !== "all" && r.priority_level !== priority) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return r.title.toLowerCase().includes(s) || r.slug.toLowerCase().includes(s);
  }), [rows, q, priority]);

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => setSelected((prev) =>
    prev.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)));

  const progress = useMemo(() => {
    const list = Object.values(jobs);
    return {
      selected: selected.size,
      analyzed: list.filter((j) => j.state === "proposed" || j.state === "applied").length,
      applied: list.filter((j) => j.state === "applied").length,
      pendingValidation: list.filter((j) => j.state === "proposed").length,
      errors: list.filter((j) => j.state === "error").length,
      skipped: list.filter((j) => j.state === "skipped").length,
    };
  }, [jobs, selected]);

  /** File de production séquentielle : une page à la fois, aucune application automatique. */
  const runBatch = async () => {
    const ids = filtered.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    setRunning(true);
    setJobs(Object.fromEntries(ids.map((id) => [id, { state: "pending" as JobState }])));
    for (const id of ids) {
      const page = rows.find((r) => r.id === id)!;
      // Anti-doublon : une page déjà optimisée il y a moins de 24 h est ignorée.
      if (page.last_improved_at && Date.now() - new Date(page.last_improved_at).getTime() < 86400_000) {
        setJobs((j) => ({ ...j, [id]: { state: "skipped", message: "Déjà optimisée il y a moins de 24 h" } }));
        continue;
      }
      setJobs((j) => ({ ...j, [id]: { state: "analyzing" } }));
      try {
        const { data, error } = await invokeWithFreshSession("seo-improve-page", { page_id: id, mode: "propose" });
        if (error) throw new Error(error.message);
        const d = data as { improvement_id?: string; error?: string };
        if (d?.error) throw new Error(d.error);
        if (!d?.improvement_id) throw new Error("Réponse IA invalide");
        setJobs((j) => ({ ...j, [id]: { state: "proposed", improvementId: d.improvement_id } }));
      } catch (e) {
        setJobs((j) => ({ ...j, [id]: { state: "error", message: e instanceof Error ? e.message : "Erreur" } }));
      }
    }
    setRunning(false);
    toast.success("File terminée — les propositions attendent votre validation.");
  };

  const applyJob = async (id: string) => {
    const job = jobs[id];
    if (!job?.improvementId) return;
    setJobs((j) => ({ ...j, [id]: { ...j[id], state: "analyzing" } }));
    try {
      const { data, error } = await invokeWithFreshSession("seo-improve-page", {
        page_id: id, mode: "apply", improvement_id: job.improvementId,
      });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setJobs((j) => ({ ...j, [id]: { state: "applied" } }));
      await load();
      onChanged();
    } catch (e) {
      setJobs((j) => ({ ...j, [id]: { state: "error", message: e instanceof Error ? e.message : "Erreur" } }));
    }
  };

  const title = scope === "zero_impressions" ? "Pages sans impression" : "Centre d'optimisation SEO";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-card sm:border border-border sm:rounded-2xl w-full max-w-7xl max-h-full sm:max-h-[92vh] flex flex-col overflow-hidden">
        <header className="p-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display font-extrabold text-foreground flex items-center gap-2">
              {scope === "zero_impressions" ? <Search className="w-4 h-4 text-primary" /> : <Sparkles className="w-4 h-4 text-primary" />}
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Chargement…" : `${rows.length.toLocaleString("fr-CA")} page(s) — données Search Console + CRM réelles`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-md border border-border hover:bg-secondary" aria-label="Rafraîchir">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-md hover:bg-muted" aria-label="Fermer"><X className="w-4 h-4" /></button>
          </div>
        </header>

        <div className="p-3 border-b border-border flex flex-wrap items-center gap-2 shrink-0">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une page…"
            className="px-3 py-2 rounded-md border border-border bg-background text-sm flex-1 min-w-[180px]" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="px-3 py-2 rounded-md border border-border bg-background text-sm">
            <option value="all">Toutes priorités</option>
            <option value="haute">Priorité haute</option>
            <option value="moyenne">Priorité moyenne</option>
            <option value="basse">Priorité basse</option>
          </select>
          <button onClick={toggleAll} className="px-3 py-2 rounded-md border border-border text-sm font-display font-semibold hover:bg-secondary">
            {selected.size === filtered.length && filtered.length > 0 ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
          <button onClick={runBatch} disabled={running || selected.size === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-bold disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Optimiser la sélection ({selected.size})
          </button>
        </div>

        {Object.keys(jobs).length > 0 && (
          <div className="px-3 py-2 border-b border-border grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs shrink-0 bg-secondary/40">
            <Chip label="Sélectionnées" value={progress.selected} />
            <Chip label="Analysées" value={progress.analyzed} />
            <Chip label="Optimisées" value={progress.applied} tone="positive" />
            <Chip label="À valider" value={progress.pendingValidation} tone="warning" />
            <Chip label="Erreurs" value={progress.errors} tone={progress.errors ? "danger" : undefined} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-16 text-center">Aucune page ne correspond aux critères.</p>
          ) : (
            <div className="table-scroll">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/50 sticky top-0 z-10">
                <tr>
                  <th className="p-2 w-8" />
                  <th className="text-left p-2">Page</th>
                  <th className="text-left p-2">Index</th>
                  <th className="text-right p-2">Impr.</th>
                  <th className="text-right p-2">Clics</th>
                  <th className="text-right p-2">CTR</th>
                  <th className="text-right p-2">Pos.</th>
                  <th className="text-left p-2">Mot-clé principal</th>
                  <th className="text-left p-2">{scope === "zero_impressions" ? "Cause probable" : "Problèmes détectés"}</th>
                  <th className="text-left p-2">Priorité</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const job = jobs[r.id];
                  const diag = scope === "zero_impressions" ? diagnoseZeroImpression(r) : null;
                  return (
                    <tr key={r.id} className="hover:bg-secondary/30 align-top">
                      <td className="p-2">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-primary" />
                      </td>
                      <td className="p-2 max-w-[240px]">
                        <button onClick={() => setDetail(r)} className="text-left w-full">
                          <div className="truncate font-body text-foreground hover:text-primary">{r.title}</div>
                          <div className="font-mono text-[10px] text-muted-foreground truncate">/{r.slug}</div>
                        </button>
                      </td>
                      <td className="p-2">
                        {r.indexed_at
                          ? <span className="text-primary font-semibold">Indexée</span>
                          : <span className="text-destructive font-semibold">Non indexée</span>}
                      </td>
                      <td className="p-2 text-right font-mono">{r.impressions}</td>
                      <td className="p-2 text-right font-mono">{r.clicks}</td>
                      <td className="p-2 text-right font-mono">{(Number(r.ctr) * 100).toFixed(1)}%</td>
                      <td className="p-2 text-right font-mono">{Number(r.avg_position) > 0 ? Number(r.avg_position).toFixed(1) : "—"}</td>
                      <td className="p-2 max-w-[160px] truncate text-muted-foreground">{r.primary_keyword ?? "—"}</td>
                      <td className="p-2 max-w-[260px]">
                        {diag ? (
                          <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-semibold">
                            {CAUSE_LABELS[diag.cause]}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(r.reasons ?? []).map((f) => (
                              <span key={f} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-semibold">
                                {REASON_LABELS[f] ?? f}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <PriorityBadge level={r.priority_level} />
                        {job && <div className="mt-1"><JobBadge job={job} onApply={() => applyJob(r.id)} /></div>}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <a href={`/${r.slug}`} target="_blank" rel="noreferrer" className="inline-flex p-1.5 text-primary hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => setDetail(r)} className="inline-flex p-1.5 text-muted-foreground hover:text-foreground">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <PageAnalysis
          page={detail}
          scope={scope}
          onClose={() => setDetail(null)}
          onImprove={() => { setImprove(detail); setDetail(null); }}
        />
      )}

      {improve && (
        <ImproveDialog
          pageId={improve.id}
          pageTitle={improve.title}
          onClose={() => setImprove(null)}
          onApplied={() => { void load(); onChanged(); }}
        />
      )}
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: "positive" | "warning" | "danger" }) {
  const color = tone === "positive" ? "text-primary" : tone === "warning" ? "text-amber-600" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5 flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-display font-bold ${color}`}>{value}</span>
    </div>
  );
}

function PriorityBadge({ level }: { level: string }) {
  const cls = level === "haute" ? "bg-destructive/10 text-destructive"
    : level === "moyenne" ? "bg-amber-500/10 text-amber-600"
      : "bg-secondary text-muted-foreground";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-display font-bold uppercase ${cls}`}>{level}</span>;
}

function JobBadge({ job, onApply }: { job: { state: JobState; message?: string }; onApply: () => void }) {
  if (job.state === "analyzing") return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyse…</span>;
  if (job.state === "pending") return <span className="text-[10px] text-muted-foreground">En file…</span>;
  if (job.state === "applied") return <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="w-3 h-3" /> Optimisée</span>;
  if (job.state === "skipped") return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={job.message}><Ban className="w-3 h-3" /> Ignorée</span>;
  if (job.state === "error") return <span className="inline-flex items-center gap-1 text-[10px] text-destructive" title={job.message}><AlertTriangle className="w-3 h-3" /> Erreur</span>;
  return (
    <button onClick={onApply} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-display font-bold">
      <Check className="w-3 h-3" /> Appliquer
    </button>
  );
}

function PageAnalysis({ page, scope, onClose, onImprove }: {
  page: Candidate; scope: Scope; onClose: () => void; onImprove: () => void;
}) {
  const a = analyzePage(page);
  const diag = scope === "zero_impressions" ? diagnoseZeroImpression(page) : null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-card sm:border border-border sm:rounded-2xl w-full max-w-3xl max-h-full sm:max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-display font-extrabold truncate">{page.title}</h3>
            <a href={`/${page.slug}`} target="_blank" rel="noreferrer" className="text-xs font-mono text-primary hover:underline inline-flex items-center gap-1">
              /{page.slug} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Impressions" value={page.impressions.toLocaleString("fr-CA")} />
            <Metric label="Clics" value={String(page.clicks)} />
            <Metric label="CTR" value={`${(Number(page.ctr) * 100).toFixed(1)} %`} />
            <Metric label="Position" value={Number(page.avg_position) > 0 ? Number(page.avg_position).toFixed(1) : "—"} />
            <Metric label="Mots" value={String(page.word_count)} />
            <Metric label="Liens internes" value={String(page.internal_link_count)} />
            <Metric label="Score SEO" value={page.seo_score != null ? `${page.seo_score}/100` : "—"} />
            <Metric label="Indexation" value={page.indexed_at ? "Indexée" : "Non indexée"} />
          </div>

          {diag && (
            <Section title="Cause probable de l'absence d'impressions" tone="warning">
              <p className="font-semibold">{CAUSE_LABELS[diag.cause]}</p>
              <p>{diag.explanation}</p>
              <p className="mt-1"><strong>Action proposée :</strong> {diag.action}</p>
            </Section>
          )}

          <Section title="Pourquoi cette page est considérée comme à optimiser" tone="warning">
            {a.why.length ? <ul className="list-disc pl-4 space-y-0.5">{a.why.map((w) => <li key={w}>{w}</li>)}</ul> : <p>Aucun critère d'optimisation actif.</p>}
          </Section>

          <Section title="Ce qui fonctionne" tone="positive">
            {a.good.length ? <ul className="list-disc pl-4 space-y-0.5">{a.good.map((g) => <li key={g}>{g}</li>)}</ul> : <p>Aucun signal positif mesuré.</p>}
          </Section>

          <Section title="Ce qui doit être amélioré" tone="danger">
            {a.bad.length ? <ul className="list-disc pl-4 space-y-0.5">{a.bad.map((b) => <li key={b}>{b}</li>)}</ul> : <p>Aucun problème détecté.</p>}
          </Section>

          <Section title="Recommandations">
            {a.reco.length ? <ul className="list-disc pl-4 space-y-0.5">{a.reco.map((r) => <li key={r}>{r}</li>)}</ul> : <p>Aucune recommandation prioritaire.</p>}
          </Section>

          {page.last_improved_at && (
            <p className="text-xs text-muted-foreground">
              Dernière optimisation appliquée : {new Date(page.last_improved_at).toLocaleString("fr-CA")} · {page.improvements_applied} au total.
            </p>
          )}
        </div>

        <footer className="p-4 border-t border-border flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold">Fermer</button>
          <button onClick={onImprove} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold">
            <Sparkles className="w-4 h-4" /> Optimiser avec l'IA
          </button>
        </footer>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "positive" | "warning" | "danger" }) {
  const cls = tone === "positive" ? "border-primary/30 bg-primary/5"
    : tone === "warning" ? "border-amber-500/30 bg-amber-500/5"
      : tone === "danger" ? "border-destructive/30 bg-destructive/5"
        : "border-border bg-card";
  return (
    <div className={`rounded-lg border p-3 text-sm font-body ${cls}`}>
      <h4 className="font-display font-bold text-foreground mb-1">{title}</h4>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
