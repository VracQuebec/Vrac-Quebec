import { useMemo, useState } from "react";
import { useSeoControlCenter, type ControlCityRow } from "@/lib/seo/useSeoControlCenter";
import { useSeoPipelineV2 } from "@/lib/seo/useSeoPipelineV2";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Play, Pause, Square, Rocket, RefreshCw, Send, ListRestart,
  Loader2, AlertTriangle, ExternalLink, FileText,
} from "lucide-react";

type FilterKey = "all" | "done" | "partial" | "running" | "todo" | "error";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "done", label: "Terminées" },
  { key: "partial", label: "Partielles" },
  { key: "running", label: "En cours" },
  { key: "todo", label: "En attente" },
  { key: "error", label: "Avec erreurs" },
];

const STATUS_META: Record<ControlCityRow["status"], { label: string; className: string; dot: string }> = {
  done:    { label: "TERMINÉ", className: "bg-green-500/15 text-green-700 border-green-500/30", dot: "bg-green-500" },
  partial: { label: "PARTIELLEMENT TERMINÉ", className: "bg-amber-500/15 text-amber-700 border-amber-500/30", dot: "bg-amber-500" },
  running: { label: "EN COURS", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30", dot: "bg-yellow-500" },
  error:   { label: "ERREUR",   className: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive" },
  todo:    { label: "EN ATTENTE",  className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

function nf(n: number) { return n.toLocaleString("fr-CA"); }

export default function PipelineControlCenter() {
  const { state, loading, error, reload } = useSeoControlCenter();
  const { start, pause, resume, stop } = useSeoPipelineV2();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(24);
  const [busy, setBusy] = useState<string | null>(null);
  const [logsCity, setLogsCity] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [pagesCity, setPagesCity] = useState<{ slug: string; name: string } | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const totals = state?.totals ?? null;
  const run = state?.active_run ?? null;
  const globalPct = totals && totals.target_total > 0
    ? Math.round((totals.published / totals.target_total) * 100) : 0;

  const cities = useMemo(() => {
    const list = state?.cities ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((c) =>
      (filter === "all" || (filter === "error" ? c.errors > 0 : c.status === filter)) &&
      (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q))
    );
  }, [state, filter, search]);

  const errorCities = useMemo(
    () => (state?.cities ?? []).filter((c) => c.errors > 0).sort((a, b) => b.errors - a.errors),
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
              <Button size="sm" onClick={() => act("start", async () => { await start({ mode: "all_cities" }); }, "Génération lancée (pages manquantes uniquement)")} disabled={busy === "start"} className="gap-2">
                <Play className="w-4 h-4" /> Générer les pages manquantes
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
              <Kpi label="Pages totales" value={nf(totals.target_total)} />
              <Kpi label="Générées" value={nf(totals.generated)} tone="good" />
              <Kpi label="Publiées" value={nf(totals.published)} tone="good" />
              <Kpi label="Restantes" value={nf(totals.remaining)} />
              <button type="button" onClick={openErrors} className="text-left">
                <Kpi label="Erreurs" value={nf(totals.errors)} tone={totals.errors > 0 ? "bad" : "muted"} hint="Voir la liste" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progression globale (pages publiées / pages prévues)</span>
                <span className="font-semibold text-foreground">{globalPct}%</span>
              </div>
              <Progress value={globalPct} className="h-3" />
            </div>

            <div className="rounded-lg border border-border bg-background/50 p-3 text-sm">
              {run ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Badge className="bg-primary/15 text-primary border-primary/30 gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> EN COURS
                  </Badge>
                  <span className="font-semibold">{nf(run.done_pages)} / {nf(run.total_pages)}</span>
                  <span className="text-muted-foreground">
                    {run.total_pages > 0 ? Math.round((run.done_pages / run.total_pages) * 100) : 0} %
                  </span>
                  {run.current_city_slug && <span className="text-muted-foreground">Ville : <strong className="text-foreground">{run.current_city_slug}</strong></span>}
                  <span className="text-muted-foreground">File : {nf(state?.queued_tasks ?? 0)} tâche(s)</span>
                </div>
              ) : (
                <span className="text-muted-foreground">AUCUNE GÉNÉRATION EN COURS</span>
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
            const meta = STATUS_META[c.status];
            return (
              <div key={c.slug} className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />{c.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.slug}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${meta.className}`}>{meta.label}</Badge>
                </div>

                <Progress value={c.pct} className="h-2" />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs">
                  <span>{c.generated} / {c.planned} générées</span>
                  <span>{c.published} / {c.planned} publiées</span>
                  <span>{c.remaining} restante{c.remaining > 1 ? "s" : ""}</span>
                  <span className={c.errors > 0 ? "text-destructive font-medium" : ""}>{c.errors} erreur{c.errors > 1 ? "s" : ""}</span>
                  <span className="font-semibold">{c.pct} %</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" onClick={() => openPages(c.slug)}>
                    <FileText className="w-3 h-3" /> Voir les pages
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1"
                    disabled={c.errors === 0 || busy === `retry-${c.slug}`}
                    onClick={() => act(`retry-${c.slug}`, async () => { await supabase.rpc("seo_city_retry_errors" as never, { _city_slug: c.slug } as never); }, `Erreurs relancées — ${c.name}`)}>
                    <ListRestart className="w-3 h-3" /> Régénérer les erreurs
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1"
                    disabled={c.published >= c.generated || busy === `pub-${c.slug}`}
                    onClick={() => act(`pub-${c.slug}`, async () => { await supabase.rpc("seo_city_publish_missing" as never, { _city_slug: c.slug } as never); }, `Pages non publiées publiées — ${c.name}`)}>
                    <Send className="w-3 h-3" /> Publier les non publiées
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => openLogs(c.slug)}>Voir les logs</Button>
                </div>
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

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <Dialog open={errorsOpen} onOpenChange={setErrorsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Erreurs — {totals?.errors ?? 0}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
            {errorRows.length === 0 && <div className="text-muted-foreground">Aucune erreur.</div>}
            {errorRows.map((e) => (
              <div key={e.id} className="rounded-lg border border-border p-2 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">{e.status}</Badge>
                  <strong>{e.city_slug}</strong>
                  <span className="text-muted-foreground truncate">{e.page_slug ?? [e.material_slug, e.service_slug].filter(Boolean).join(" · ") ?? "hub"}</span>
                  <span className="text-muted-foreground">étape : {e.step ?? "—"}</span>
                  <span className="text-muted-foreground ml-auto">{new Date(e.updated_at).toLocaleString("fr-CA")}</span>
                </div>
                {e.last_error && <div className="text-destructive break-words">{e.last_error}</div>}
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => act(`retry-${e.city_slug}`, async () => { await supabase.rpc("seo_city_retry_errors" as never, { _city_slug: e.city_slug } as never); await openErrors(); }, "Erreurs relancées")}>
                  Réessayer
                </Button>
              </div>
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

      <Dialog open={!!pagesCity} onOpenChange={(o) => !o && setPagesCity(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Pages — {pagesCity}</DialogTitle></DialogHeader>
          <div className="space-y-1 text-xs">
            {pages.length === 0 && <div className="text-muted-foreground">Aucune page.</div>}
            {pages.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 py-1 border-b border-border last:border-0">
                <Badge variant="outline" className={`text-[10px] ${p.status === "published" ? "bg-green-500/15 text-green-700 border-green-500/30" : ""}`}>{p.status}</Badge>
                <span className="truncate max-w-[240px]">{p.title ?? p.slug}</span>
                <span className="text-muted-foreground">QA {p.qa_last_score ?? "—"} · {p.word_count ?? 0} mots</span>
                <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="ml-auto text-primary inline-flex items-center gap-1">
                  Ouvrir <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
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
