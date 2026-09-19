import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, Play, CheckCircle2, AlertTriangle, ExternalLink, ListRestart, Search, FileText,
} from "lucide-react";
import {
  useCityGeneration, fetchReport,
  type CityRow, type ActiveRun, type Slot, type CityReport, type RunHistory, type LocalRun,
} from "@/lib/seo/useCityGeneration";

export type { CityRow, Slot } from "@/lib/seo/useCityGeneration";

/* ------------------------------------------------------------- status UI */

export const CITY_STATUS: Record<CityRow["status"], { dot: string; label: string; cls: string }> = {
  pending_start: { dot: "⚪", label: "EN ATTENTE", cls: "bg-muted text-muted-foreground border-border" },
  running: { dot: "🟡", label: "GÉNÉRATION EN COURS", cls: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
  partial: { dot: "🟠", label: "PARTIELLE", cls: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
  errors: { dot: "🔴", label: "AVEC ERREURS", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  done: { dot: "🟢", label: "TERMINÉE — GÉNÉRATION", cls: "bg-green-500/15 text-green-700 border-green-500/30" },
};

const SLOT_STATE: Record<Slot["state"], { label: string; cls: string }> = {
  missing: { label: "À générer", cls: "bg-muted text-muted-foreground border-border" },
  pending: { label: "En cours", cls: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
  error: { label: "Erreur", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  invalid: { label: "À corriger", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  draft: { label: "Brouillon", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  published: { label: "Publiée", cls: "bg-green-500/15 text-green-700 border-green-500/30" },
};

type FilterKey = "all" | "done" | "partial" | "running" | "pending_start" | "errors";
type SortKey = "name" | "requests" | "pages" | "progress" | "errors";

/* ------------------------------------------------------------ main panel */

export default function CityGenerator() {
  const {
    overview, loading, run, verifying, dbActive, lockedBy,
    load, generate, generateCity, regenerateErrors, verifyCity,
  } = useCityGeneration();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const rows = useMemo(() => {
    let list = overview?.cities ?? [];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c) => `${c.name} ${c.slug}`.toLowerCase().includes(q));
    }
    if (filter !== "all") list = list.filter((c) => c.status === filter);
    const pct = (c: CityRow) => (c.expected > 0 ? c.existing / c.expected : 0);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "requests": return b.request_count - a.request_count;
        case "pages": return b.existing - a.existing;
        case "progress": return pct(b) - pct(a);
        case "errors": return b.errors - a.errors;
        default: return a.name.localeCompare(b.name, "fr-CA");
      }
    });
    return sorted;
  }, [overview, query, filter, sort]);

  const t = overview?.totals;
  const openCity = rows.find((c) => c.slug === openSlug) ?? overview?.cities.find((c) => c.slug === openSlug) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display font-bold text-foreground">Génération ville par ville</h3>
          <Badge variant="outline" className="text-[11px]">Une seule ville à la fois · aucune file globale</Badge>
          <Button size="sm" variant="outline" className="ml-auto h-8 gap-1 text-xs" onClick={() => void load()}>
            <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
          </Button>
        </div>
        {t && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
            <Stat label="Villes CRM" value={t.cities} />
            <Stat label="🟢 Terminées" value={t.done} />
            <Stat label="🟠 Partielles" value={t.partial} />
            <Stat label="🔴 Avec erreurs" value={t.errors} />
            <Stat label="🟡 En cours" value={t.running} />
            <Stat label="⚪ En attente" value={t.waiting} />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Rien n'est généré tant qu'une ville n'est pas lancée manuellement. Le bouton Rafraîchir relit seulement la base.
          Les pages existantes ne sont jamais recréées ni supprimées.
        </p>
        {lockedBy && (
          <div className="text-[11px] rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-800 px-2 py-1.5">
            🟡 Génération en cours : {run?.cityName ?? lockedBy}. Les autres villes restent en attente.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une municipalité…" className="pl-8 h-9" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="all">Toutes</option>
          <option value="done">🟢 Terminées</option>
          <option value="partial">🟠 Partielles</option>
          <option value="running">🟡 En cours</option>
          <option value="pending_start">⚪ En attente</option>
          <option value="errors">🔴 Avec erreurs</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="name">Trier : nom</option>
          <option value="requests">Trier : demandes CRM</option>
          <option value="pages">Trier : pages</option>
          <option value="progress">Trier : progression</option>
          <option value="errors">Trier : erreurs</option>
        </select>
      </div>

      {loading && !overview && (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement du registre…</div>
      )}

      <div className="space-y-2">
        {rows.map((c) => (
          <CityCard
            key={c.slug} city={c}
            run={run && run.citySlug === c.slug ? run : null}
            dbRun={dbActive && dbActive.city_slug === c.slug ? dbActive : null}
            lockedByOther={!!lockedBy && lockedBy !== c.slug}
            verifying={verifying === c.slug}
            onOpen={() => setOpenSlug(c.slug)}
            onGenerate={() => void generateCity(c)}
            onVerify={() => void verifyCity(c)}
            onRegenerateErrors={() => void regenerateErrors(c)}
          />
        ))}
        {rows.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded-lg">Aucune ville pour ces critères.</div>
        )}
      </div>

      <CityDetailDialog
        city={openCity}
        run={run && openCity && run.citySlug === openCity.slug ? run : null}
        lockedByOther={!!lockedBy && lockedBy !== openCity?.slug}
        onClose={() => setOpenSlug(null)}
        onGenerate={(city) => void generateCity(city)}
        onRegenerateErrors={(city) => void regenerateErrors(city)}
        onGenerateSlot={(city, slot) => void generate(city, [slot], slot.state === "invalid" ? "repair" : "missing")}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------- city card */

function CityCard({ city, run, dbRun, lockedByOther, verifying, onOpen, onGenerate, onVerify, onRegenerateErrors }: {
  city: CityRow; run: LocalRun | null; dbRun: ActiveRun; lockedByOther: boolean; verifying: boolean;
  onOpen: () => void; onGenerate: () => void; onVerify: () => void; onRegenerateErrors: () => void;
}) {
  const isRunning = !!run || !!dbRun || city.status === "running";
  const st = CITY_STATUS[isRunning ? "running" : city.status];
  const generated = city.existing;
  const pct = city.expected > 0 ? Math.round((generated / city.expected) * 100) : 0;
  const runDone = run?.done ?? dbRun?.done ?? city.run_done ?? 0;
  const runTotal = run?.total ?? dbRun?.total ?? city.run_total ?? 0;
  const canGenerate = city.missing > 0;
  const generateLabel = generated > 0 ? "Reprendre la génération" : "Générer cette ville";

  return (
    <div
      onClick={onOpen}
      className="rounded-lg border border-border bg-card p-3 space-y-2 text-left w-full cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm uppercase">{city.name}</strong>
        <span className="text-[11px] text-muted-foreground">/{city.slug}</span>
        <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.dot} {st.label}</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
        <span>{generated} / {city.expected} générées</span>
        <span>{city.published} / {city.expected} publiées</span>
        <span>{city.drafts} / {city.expected} en brouillon</span>
        <span>{city.missing} restante{city.missing > 1 ? "s" : ""} à générer</span>
        <span className={city.errors > 0 ? "text-destructive font-semibold" : ""}>{city.errors} erreur{city.errors > 1 ? "s" : ""}</span>
      </div>

      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {isRunning && runTotal > 0 && (
        <div className="text-[11px] text-yellow-700">
          🟡 {runDone} / {runTotal} page(s) traitée(s){(run?.label ?? dbRun?.current_label ?? city.run_label) ? ` · ${run?.label ?? dbRun?.current_label ?? city.run_label}` : ""}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        <span>{city.request_count} demande(s) CRM</span>
        {city.last_generated_at && <span>· dernière génération {new Date(city.last_generated_at).toLocaleDateString("fr-CA")}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onOpen}>
            <FileText className="w-3 h-3" /> Voir les pages
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={verifying || isRunning} onClick={onVerify}>
            {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Vérifier la ville
          </Button>
          {city.errors > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={isRunning || lockedByOther} onClick={onRegenerateErrors}>
              <ListRestart className="w-3 h-3" /> Régénérer les erreurs
            </Button>
          )}
          {canGenerate && (
            <Button size="sm" className="h-7 text-[11px] gap-1" disabled={isRunning || lockedByOther} onClick={onGenerate}>
              {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} {generateLabel}
            </Button>
          )}
        </div>
      </div>
      {lockedByOther && canGenerate && (
        <div className="text-[10px] text-muted-foreground">Une autre ville est en cours de génération.</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- city dialog */

function CityDetailDialog({ city, run, lockedByOther, onClose, onGenerate, onRegenerateErrors, onGenerateSlot }: {
  city: CityRow | null; run: LocalRun | null; lockedByOther: boolean;
  onClose: () => void;
  onGenerate: (city: CityRow) => void;
  onRegenerateErrors: (city: CityRow) => void;
  onGenerateSlot: (city: CityRow, slot: Slot) => void;
}) {
  const [report, setReport] = useState<CityReport | null>(null);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [loading, setLoading] = useState(false);

  const slug = city?.slug ?? null;

  const load = useCallback(async () => {
    if (!slug) { setReport(null); return; }
    setLoading(true);
    try {
      const [r, h] = await Promise.all([
        fetchReport(slug),
        supabase.rpc("seo_city_run_history" as never, { _city_slug: slug, _limit: 10 } as never),
      ]);
      setReport(r);
      setHistory((h.data as unknown as RunHistory[]) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rapport indisponible");
    } finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);
  // Suit la progression de CETTE ville pendant sa génération manuelle.
  const runDone = run?.done ?? null;
  useEffect(() => { if (runDone !== null) void load(); }, [runDone, load]);

  const s = report?.summary;
  const missingCount = (report?.slots ?? []).filter((x) => x.state === "missing" || x.state === "error").length;
  const invalidCount = (report?.slots ?? []).filter((x) => x.state === "invalid").length;
  const running = !!run;

  return (
    <Dialog open={!!city} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wide">Ville : {city?.name}</DialogTitle>
        </DialogHeader>

        {loading && !report && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyse de la ville…</div>}

        {city && s && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`text-[11px] ${CITY_STATUS[running ? "running" : city.status].cls}`}>
                {CITY_STATUS[running ? "running" : city.status].dot} {CITY_STATUS[running ? "running" : city.status].label}
              </Badge>
              <span className="text-xs text-muted-foreground">/{city.slug} · {city.request_count} demande(s) CRM</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
              <Stat label="Prévues" value={s.expected} />
              <Stat label="Générées" value={s.existing} />
              <Stat label="Publiées (manuel)" value={s.published} />
              <Stat label="En brouillon" value={s.drafts} />
              <Stat label="Restantes à générer" value={s.missing} />
              <Stat label="Erreurs" value={s.errors} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 text-xs gap-1" disabled={running || lockedByOther || missingCount === 0}
                onClick={() => onGenerate(city)}>
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {missingCount === 0 ? "Aucune page manquante"
                  : s.existing > 0 ? `Reprendre la génération (${missingCount})` : `Générer cette ville (${missingCount})`}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={running} onClick={() => void load()}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Vérifier la ville
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={running || lockedByOther || invalidCount === 0}
                onClick={() => onRegenerateErrors(city)}>
                <ListRestart className="w-3.5 h-3.5" /> Régénérer les erreurs ({invalidCount})
              </Button>
            </div>
            {lockedByOther && <div className="text-[11px] text-muted-foreground">Une autre ville est en cours de génération.</div>}

            {run && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%` }} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {run.done} / {run.total} · {run.created} créée(s) · {run.errors} erreur(s){run.label ? ` · ${run.label}` : ""}
                </div>
              </div>
            )}

            {run && run.log.length > 0 && (
              <div className="rounded-md bg-muted/40 p-3 max-h-40 overflow-auto text-[11px] font-mono space-y-0.5">
                {run.log.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Service / Matériau · Page · Statut · SEO · QA · Liens</div>
              {(report?.slots ?? []).map((r) => {
                const key = `${r.material_slug ?? ""}|${r.service_slug ?? ""}`;
                const st = SLOT_STATE[r.state];
                return (
                  <div key={key} className="rounded-lg border border-border p-2.5 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <strong className="truncate max-w-[240px]">{r.label}</strong>
                      <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.label}</Badge>
                      <span className="text-muted-foreground">{r.kind === "hub" ? "Hub ville" : r.kind === "material" ? "Matériau" : "Service"}</span>
                      {r.page_slug && (
                        <a href={`/${r.page_slug}`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 truncate">
                          /{r.page_slug} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <span className="text-muted-foreground ml-auto">
                        SEO {r.seo_score ?? "—"} · QA {r.qa_score ?? "—"} · {r.internal_link_count ?? 0} lien(s)
                      </span>
                    </div>
                    {r.problems && r.problems.length > 0 && (
                      <div className="text-[11px] text-amber-700 flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>🔴 {r.problems.join(" · ")}</span>
                      </div>
                    )}
                    {r.page_id && (!r.problems || r.problems.length === 0) && (
                      <div className="text-[11px] text-green-700">🟢 Ville, relation, URL, title, H1, meta, contenu, FAQ, liens internes et CTA vérifiés.</div>
                    )}
                    {r.state === "missing" && <div className="text-[11px] text-muted-foreground">Page jamais générée pour cette combinaison pertinente.</div>}
                    {(r.state === "invalid" || r.state === "error") && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={running || lockedByOther}
                        onClick={() => onGenerateSlot(city, r)}>
                        <RefreshCw className="w-3 h-3" /> Réessayer
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-1.5">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Historique de génération (logs)</div>
              {history.length === 0 && <div className="text-[11px] text-muted-foreground">Aucune génération enregistrée pour cette ville.</div>}
              {history.map((h) => (
                <div key={h.id} className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                  <span>{h.started_at ? new Date(h.started_at).toLocaleString("fr-CA") : "—"}</span>
                  <span>· {h.succeeded}/{h.total} page(s)</span>
                  <span>· {h.failed} erreur(s)</span>
                  {h.duration_seconds !== null && <span>· {h.duration_seconds}s</span>}
                  <span>· {h.created_by_email ?? "—"}</span>
                  <span>· {h.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
