import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Play, Pause, RotateCcw, XCircle, RefreshCw, Zap, Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { toast } from "sonner";

type Run = {
  id: string;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  mode: string;
  total_batches: number;
  done_batches: number;
  total_items: number;
  done_items: number;
  failed_items: number;
  batch_size_posts: number;
  batch_size_pages: number;
  started_at: string;
  finished_at: string | null;
  last_progress_at: string;
  error: string | null;
};
type Batch = {
  id: string;
  kind: "posts" | "pages";
  status: string;
  attempts: number;
  processed_count: number;
  duration_ms: number | null;
  error: string | null;
  sort_order: number;
  item_ids: string[];
};
type State = { active_run: Run | null; batches: Batch[]; history: Run[] };

export default function AdminBlogMesh() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rl } = useUserRoles(user, isReady);
  const navigate = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isReady && !user) navigate("/login");
    if (isReady && user && !rl && !isAdmin) navigate("/");
  }, [isReady, user, isAdmin, rl, navigate]);

  const load = async () => {
    const { data, error } = await supabase.rpc("blog_mesh_state");
    if (error) toast.error(error.message);
    setState((data as unknown as State) ?? null);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [isAdmin]);

  const start = async (mode: "full" | "incremental") => {
    setBusy(true);
    try {
      const { data: runId, error } = await supabase.rpc("blog_mesh_start", {
        _mode: mode,
        _item_ids: null,
        _batch_posts: 25,
        _batch_pages: 50,
      });
      if (error) throw error;
      // Kick worker
      await supabase.functions.invoke("blog-mesh-worker", { body: { run_id: runId } });
      toast.success(`Run démarré (${mode})`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const control = async (fn: "blog_mesh_pause" | "blog_mesh_resume" | "blog_mesh_cancel" | "blog_mesh_retry_errors") => {
    if (!state?.active_run) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc(fn, { _run_id: state.active_run.id });
      if (error) throw error;
      if (fn === "blog_mesh_resume" || fn === "blog_mesh_retry_errors") {
        await supabase.functions.invoke("blog-mesh-worker", { body: { run_id: state.active_run.id } });
      }
      toast.success("OK");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const metrics = useMemo(() => {
    const r = state?.active_run;
    if (!r) return null;
    const elapsedMs = Date.now() - new Date(r.started_at).getTime();
    const speed = elapsedMs > 0 ? (r.done_items / (elapsedMs / 60_000)) : 0;
    const remaining = Math.max(0, r.total_items - r.done_items);
    const etaMs = speed > 0 ? (remaining / speed) * 60_000 : 0;
    const pct = r.total_items ? Math.round((r.done_items / r.total_items) * 100) : 0;
    return { pct, speed: Math.round(speed * 10) / 10, remaining, etaMin: Math.round(etaMs / 60_000), elapsedMin: Math.round(elapsedMs / 60_000) };
  }, [state?.active_run]);

  if (!isReady || rl) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const r = state?.active_run;
  const canStart = !r || (r.status !== "running" && r.status !== "queued" && r.status !== "paused");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/admin/blogue" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Blogue
            </Link>
            <h1 className="font-display font-extrabold text-lg text-foreground">Moteur de maillage industriel</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground font-display font-bold text-sm hover:opacity-90">
              <RefreshCw className="w-4 h-4" /> Actualiser
            </button>
            <button
              onClick={() => start("incremental")}
              disabled={busy || !canStart}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground font-display font-bold text-sm hover:opacity-90 disabled:opacity-40"
              title="Traite uniquement les articles/pages modifiés"
            >
              <Zap className="w-4 h-4" /> Incrémental
            </button>
            <button
              onClick={() => start("full")}
              disabled={busy || !canStart}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm shadow hover:opacity-90 disabled:opacity-40"
            >
              <Play className="w-4 h-4" /> Analyse complète
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Chargement…</div>
        ) : (
          <>
            {r ? (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Run actif — {r.mode}</div>
                    <div className="text-2xl font-display font-extrabold text-foreground">
                      {r.done_items} / {r.total_items} items <span className="text-muted-foreground text-base">({metrics?.pct ?? 0}%)</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {r.status === "running" && (
                      <button onClick={() => control("blog_mesh_pause")} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted font-display font-bold text-sm hover:opacity-90 disabled:opacity-40">
                        <Pause className="w-4 h-4" /> Pause
                      </button>
                    )}
                    {r.status === "paused" && (
                      <button onClick={() => control("blog_mesh_resume")} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm hover:opacity-90 disabled:opacity-40">
                        <Play className="w-4 h-4" /> Reprendre
                      </button>
                    )}
                    <button onClick={() => control("blog_mesh_retry_errors")} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted font-display font-bold text-sm hover:opacity-90 disabled:opacity-40">
                      <RotateCcw className="w-4 h-4" /> Relancer erreurs
                    </button>
                    <button onClick={() => control("blog_mesh_cancel")} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground font-display font-bold text-sm hover:opacity-90 disabled:opacity-40">
                      <XCircle className="w-4 h-4" /> Annuler
                    </button>
                  </div>
                </div>

                <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${metrics?.pct ?? 0}%` }} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <Stat label="Batches" value={`${r.done_batches} / ${r.total_batches}`} />
                  <Stat label="Vitesse" value={`${metrics?.speed ?? 0}/min`} />
                  <Stat label="Restants" value={metrics?.remaining ?? 0} />
                  <Stat label="ETA" value={`${metrics?.etaMin ?? 0} min`} />
                  <Stat label="Écoulé" value={`${metrics?.elapsedMin ?? 0} min`} />
                </div>
                {r.error && <div className="text-sm text-destructive">Erreur : {r.error}</div>}

                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-2 bg-muted text-xs uppercase tracking-wide text-muted-foreground font-bold">Batches ({state?.batches.length ?? 0})</div>
                  <div className="max-h-80 overflow-auto divide-y divide-border text-xs">
                    {(state?.batches ?? []).map((b) => (
                      <div key={b.id} className="flex items-center justify-between px-4 py-2">
                        <span className="font-mono">#{b.sort_order} {b.kind}</span>
                        <span>{b.item_ids.length} items</span>
                        <span className={badge(b.status)}>{b.status}</span>
                        <span className="text-muted-foreground">{b.processed_count || 0} traités</span>
                        <span className="text-muted-foreground">{b.duration_ms ? `${b.duration_ms}ms` : "—"}</span>
                        {b.error && <span className="text-destructive truncate max-w-[220px]" title={b.error}>{b.error}</span>}
                      </div>
                    ))}
                    {(state?.batches.length ?? 0) === 0 && <div className="px-4 py-6 text-center text-muted-foreground">Aucun batch</div>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-2">
                <Network className="w-8 h-8 text-primary mx-auto" />
                <div className="font-display font-bold text-foreground">Aucun run actif</div>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Lancez une <strong>analyse incrémentale</strong> pour ne traiter que les articles/pages modifiés (aucun crédit IA consommé — 100% déterministe),
                  ou une <strong>analyse complète</strong> pour tout recalculer.
                </p>
              </div>
            )}

            {state?.history && state.history.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-2 bg-muted text-xs uppercase tracking-wide text-muted-foreground font-bold">Historique</div>
                <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">Démarré</th>
                      <th className="text-left px-4 py-2">Mode</th>
                      <th className="text-left px-4 py-2">Statut</th>
                      <th className="text-left px-4 py-2">Items</th>
                      <th className="text-left px-4 py-2">Batches</th>
                      <th className="text-left px-4 py-2">Erreurs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {state.history.map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-2 text-xs">{new Date(h.started_at).toLocaleString("fr-CA")}</td>
                        <td className="px-4 py-2">{h.mode}</td>
                        <td className="px-4 py-2"><span className={badge(h.status)}>{h.status}</span></td>
                        <td className="px-4 py-2">{h.done_items} / {h.total_items}</td>
                        <td className="px-4 py-2">{h.done_batches} / {h.total_batches}</td>
                        <td className="px-4 py-2 text-destructive">{h.failed_items || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display font-extrabold text-foreground">{value}</div>
    </div>
  );
}

function badge(status: string) {
  const base = "px-2 py-0.5 rounded text-xs font-bold";
  switch (status) {
    case "running": return `${base} bg-blue-500/20 text-blue-600`;
    case "queued": return `${base} bg-muted text-muted-foreground`;
    case "claimed": return `${base} bg-yellow-500/20 text-yellow-700`;
    case "completed": return `${base} bg-primary/20 text-primary`;
    case "failed": return `${base} bg-destructive/20 text-destructive`;
    case "cancelled": return `${base} bg-muted text-muted-foreground`;
    case "paused": return `${base} bg-orange-500/20 text-orange-600`;
    default: return `${base} bg-muted text-muted-foreground`;
  }
}