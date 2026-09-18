import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { repairSeoPages } from "@/lib/seo/useSeoCityMatrix";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, Play, CheckCircle2, AlertTriangle, ExternalLink, ListRestart, Search,
} from "lucide-react";

/* ------------------------------------------------------------------ types */

export type CityRow = {
  slug: string; name: string; region: string | null; request_count: number;
  expected: number; existing: number; published: number; drafts: number;
  missing: number; pending: number; errors: number;
  last_generated_at: string | null;
  status: "done" | "partial" | "errors" | "running" | "pending_start";
};

type Overview = {
  cities: CityRow[];
  computed_at: string;
  totals: { cities: number; done: number; partial: number; errors: number; running: number; waiting: number };
};

type Slot = {
  kind: "hub" | "material" | "service";
  material_slug: string | null; service_slug: string | null; label: string;
  page_id: string | null; page_slug: string | null; status: string | null; noindex: boolean;
  seo_score: number | null; qa_score: number | null; word_count: number | null;
  internal_link_count: number | null; last_generated_at: string | null;
  task_status: string | null; task_error: string | null; task_attempts: number | null;
  problems: string[] | null;
  state: "missing" | "pending" | "error" | "invalid" | "draft" | "published";
};

type CityReport = {
  city_slug: string; city_name: string; computed_at: string; slots: Slot[];
  summary: { expected: number; existing: number; published: number; drafts: number; missing: number; pending: number; errors: number };
};

type RunHistory = {
  id: string; status: string; total: number; succeeded: number; failed: number;
  started_at: string | null; finished_at: string | null; duration_seconds: number | null;
  created_by_email: string | null;
};

type Ref = { slug: string; name: string; short_name?: string | null; description?: string | null };

/* ------------------------------------------------------------- status UI */

const CITY_STATUS: Record<CityRow["status"], { dot: string; label: string; cls: string }> = {
  pending_start: { dot: "⚪", label: "EN ATTENTE", cls: "bg-muted text-muted-foreground border-border" },
  running: { dot: "🟡", label: "EN COURS", cls: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
  partial: { dot: "🟠", label: "PARTIELLE", cls: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
  errors: { dot: "🔴", label: "AVEC ERREURS", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  done: { dot: "🟢", label: "TERMINÉE", cls: "bg-green-500/15 text-green-700 border-green-500/30" },
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
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Ref[]>([]);
  const [services, setServices] = useState<Ref[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [openCity, setOpenCity] = useState<CityRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, m, s] = await Promise.all([
        supabase.rpc("seo_city_generation_overview" as never),
        supabase.from("seo_materials").select("slug,name,short_name,description").eq("active", true).order("sort_order"),
        supabase.from("seo_services").select("slug,name,description").eq("active", true).order("sort_order"),
      ]);
      if (ov.error) throw ov.error;
      setOverview(ov.data as unknown as Overview);
      setMaterials((m.data ?? []) as Ref[]);
      setServices((s.data ?? []) as Ref[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display font-bold text-foreground">Génération ville par ville</h3>
          <Badge variant="outline" className="text-[11px]">Une seule ville à la fois · aucune file globale</Badge>
          <Button size="sm" variant="outline" className="ml-auto h-8 gap-1 text-xs" onClick={() => void load()}>
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
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
          La progression est comptée en villes réellement traitées, pas en pages globales. Les pages existantes ne sont jamais recréées ni supprimées.
        </p>
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
        {rows.map((c) => {
          const st = CITY_STATUS[c.status];
          const pct = c.expected > 0 ? Math.round((c.existing / c.expected) * 100) : 0;
          return (
            <div key={c.slug} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{c.name}</strong>
                <span className="text-[11px] text-muted-foreground">/{c.slug}</span>
                <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.dot} {st.label}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {c.existing}/{c.expected} · {c.published} publiée(s) · {c.drafts} brouillon(s) · {c.errors} erreur(s)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>{c.request_count} demande(s) CRM</span>
                <span>· {c.expected} combinaison(s) prévue(s)</span>
                <span>· {c.missing} manquante(s)</span>
                {c.last_generated_at && <span>· dernière génération {new Date(c.last_generated_at).toLocaleDateString("fr-CA")}</span>}
                <Button size="sm" variant="outline" className="h-7 text-[11px] ml-auto" onClick={() => setOpenCity(c)}>
                  {c.missing > 0 ? (c.existing > 0 ? "Reprendre cette ville" : "Générer cette ville") : "Vérifier la ville"}
                </Button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded-lg">Aucune ville pour ces critères.</div>
        )}
      </div>

      <CityDetailDialog
        city={openCity} materials={materials} services={services}
        onClose={() => setOpenCity(null)} onChanged={() => void load()}
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

/* ---------------------------------------------------------- city dialog */

function CityDetailDialog({ city, materials, services, onClose, onChanged }: {
  city: CityRow | null; materials: Ref[]; services: Ref[];
  onClose: () => void; onChanged: () => void;
}) {
  const [report, setReport] = useState<CityReport | null>(null);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<null | {
    expected: number; before: number; created: number; published: number; drafts: number; skipped: number; errors: number; complete: boolean;
  }>(null);

  const slug = city?.slug ?? null;

  const load = useCallback(async () => {
    if (!slug) { setReport(null); return; }
    setLoading(true);
    try {
      const [r, h] = await Promise.all([
        supabase.rpc("seo_city_generation_report" as never, { _city_slug: slug } as never),
        supabase.rpc("seo_city_run_history" as never, { _city_slug: slug, _limit: 10 } as never),
      ]);
      if (r.error) throw r.error;
      setReport(r.data as unknown as CityReport);
      setHistory((h.data as unknown as RunHistory[]) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rapport indisponible");
    } finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { setResult(null); setLog([]); setProgress({ done: 0, total: 0, errors: 0 }); void load(); }, [load]);

  const s = report?.summary;
  const missingSlots = (report?.slots ?? []).filter((x) => x.state === "missing" || x.state === "error");
  const invalidSlots = (report?.slots ?? []).filter((x) => x.state === "invalid");

  async function generate() {
    if (!city || !report || missingSlots.length === 0) return;
    if (!window.confirm(`Générer ${missingSlots.length} page(s) manquante(s) pour ${city.name} ? Les pages existantes ne seront pas touchées.`)) return;
    setRunning(true);
    setResult(null);
    setLog([]);
    setProgress({ done: 0, total: missingSlots.length, errors: 0 });
    const before = report.summary.existing;
    let created = 0, errors = 0, skipped = 0;
    let jobId: string | null = null;
    try {
      const { data } = await supabase.rpc("seo_city_run_start" as never, { _city_slug: city.slug, _total: missingSlots.length } as never);
      jobId = (data as unknown as string) ?? null;
    } catch { /* l'historique reste facultatif */ }

    const details: Array<Record<string, unknown>> = [];
    for (const slot of missingSlots) {
      const material = slot.material_slug ? materials.find((m) => m.slug === slot.material_slug) : undefined;
      const service = slot.service_slug ? services.find((x) => x.slug === slot.service_slug) : undefined;
      try {
        const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { created?: boolean; skipped?: boolean; error?: string }>(
          "seo-generate-page",
          {
            city: { slug: city.slug, name: city.name, region: city.region },
            material: material ? { slug: material.slug, name: material.name, short_name: material.short_name, description: material.description } : undefined,
            service: service ? { slug: service.slug, name: service.name, description: service.description } : undefined,
            publish: false,
            allow_ai: true,
          },
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.skipped) { skipped += 1; setLog((l) => [`⏭️ ${slot.label} — déjà existante`, ...l].slice(0, 60)); }
        else { created += 1; setLog((l) => [`✅ ${slot.label}`, ...l].slice(0, 60)); }
        details.push({ label: slot.label, ok: true });
      } catch (e) {
        errors += 1;
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setLog((l) => [`❌ ${slot.label} — ${msg}`, ...l].slice(0, 60));
        details.push({ label: slot.label, ok: false, error: msg });
      }
      setProgress((p) => ({ done: p.done + 1, total: missingSlots.length, errors }));
    }

    if (jobId) {
      try { await supabase.rpc("seo_city_run_finish" as never, { _job_id: jobId, _created: created, _errors: errors, _details: details } as never); }
      catch { /* historique facultatif */ }
    }

    const { data: fresh } = await supabase.rpc("seo_city_generation_report" as never, { _city_slug: city.slug } as never);
    const nr = fresh as unknown as CityReport | null;
    if (nr) setReport(nr);
    setResult({
      expected: nr?.summary.expected ?? report.summary.expected,
      before, created,
      published: nr?.summary.published ?? 0,
      drafts: nr?.summary.drafts ?? 0,
      skipped,
      errors: (nr?.summary.errors ?? 0) + errors,
      complete: (nr?.summary.missing ?? 1) === 0 && (nr?.summary.errors ?? 1) === 0 && errors === 0,
    });
    setRunning(false);
    onChanged();
    void load();
    toast.success(`${city.name} : ${created} page(s) créée(s), ${errors} erreur(s). Aucune publication automatique.`);
  }

  async function regenerateErrors() {
    if (!city) return;
    try {
      const r = await repairSeoPages({ citySlug: city.slug, allErrors: true });
      toast.success(`Régénération lancée sur ${r.queued ?? 0} page(s) en erreur`);
      void load(); onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Régénération impossible");
    }
  }

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
              <Badge variant="outline" className={`text-[11px] ${CITY_STATUS[city.status].cls}`}>
                {CITY_STATUS[city.status].dot} {CITY_STATUS[city.status].label}
              </Badge>
              <span className="text-xs text-muted-foreground">{city.request_count} demande(s) CRM</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
              <Stat label="Prévues" value={s.expected} />
              <Stat label="Existantes" value={s.existing} />
              <Stat label="Publiées" value={s.published} />
              <Stat label="Brouillons" value={s.drafts} />
              <Stat label="Restantes" value={s.missing} />
              <Stat label="Erreurs" value={s.errors} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 text-xs gap-1" disabled={running || missingSlots.length === 0} onClick={() => void generate()}>
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {s.existing > 0 && missingSlots.length > 0
                  ? `Reprendre cette ville (${missingSlots.length})`
                  : missingSlots.length === 0 ? "Aucune page manquante" : `Générer cette ville (${missingSlots.length})`}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => void load()}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Vérifier la ville
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={invalidSlots.length === 0} onClick={() => void regenerateErrors()}>
                <ListRestart className="w-3.5 h-3.5" /> Régénérer les erreurs ({invalidSlots.length})
              </Button>
            </div>

            {running && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <div className="text-[11px] text-muted-foreground">{progress.done} / {progress.total} · {progress.errors} erreur(s)</div>
              </div>
            )}

            {result && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
                <div className="font-semibold">Vérification terminée</div>
                <div>Pages prévues : {result.expected}</div>
                <div>Pages existantes avant génération : {result.before}</div>
                <div>Nouvelles pages créées : {result.created}</div>
                <div>Pages publiées : {result.published}</div>
                <div>Pages en brouillon : {result.drafts}</div>
                <div>Pages ignorées (déjà existantes) : {result.skipped}</div>
                <div>Erreurs : {result.errors}</div>
                <div className={result.complete ? "text-green-700 font-semibold" : "text-orange-700 font-semibold"}>
                  Ville complète : {result.complete ? "OUI" : "NON"}
                </div>
              </div>
            )}

            {log.length > 0 && (
              <div className="rounded-md bg-muted/40 p-3 max-h-40 overflow-auto text-[11px] font-mono space-y-0.5">
                {log.map((l, i) => <div key={i}>{l}</div>)}
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
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                        onClick={async () => {
                          try {
                            await repairSeoPages({ citySlug: city.slug, materialSlug: r.material_slug, serviceSlug: r.service_slug });
                            toast.success(`Régénération demandée — ${r.label}`);
                            void load(); onChanged();
                          } catch (e) { toast.error(e instanceof Error ? e.message : "Action impossible"); }
                        }}>
                        <RefreshCw className="w-3 h-3" /> Réessayer
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-1.5">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Historique de génération</div>
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
