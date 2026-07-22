import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Play, Network, Link2, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";

type Stats = {
  total_posts: number; linked_posts: number; orphan_posts: number;
  total_links: number; avg_mesh_score: number;
  seo_pages_total: number; seo_pages_covered: number; seo_pages_uncovered: number;
  opportunities: number;
  last_run: null | {
    id: string; status: string; started_at: string; finished_at: string | null;
    stats: Record<string, number>; opportunities: Array<Record<string, unknown>>;
    orphan_post_ids: string[];
  };
};

export default function AdminBlogMesh() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rl } = useUserRoles(user, isReady);
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"overview" | "orphans" | "opportunities" | "history">("overview");
  const [runs, setRuns] = useState<Stats["last_run"][]>([]);
  const [orphans, setOrphans] = useState<Array<{ id: string; title: string; slug: string }>>([]);

  useEffect(() => {
    if (isReady && !user) navigate("/login");
    if (isReady && user && !rl && !isAdmin) navigate("/");
  }, [isReady, user, isAdmin, rl, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("blog_mesh_stats");
    if (error) toast.error(error.message);
    setStats((data as unknown as Stats) ?? null);
    const { data: rs } = await supabase
      .from("blog_mesh_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    setRuns((rs ?? []) as unknown as Stats["last_run"][]);
    setLoading(false);
  };

  const loadOrphans = async () => {
    // Posts published with no link
    const { data: linked } = await supabase.from("blog_seo_links").select("blog_post_id");
    const linkedIds = new Set((linked ?? []).map((r) => r.blog_post_id));
    const { data: posts } = await supabase
      .from("blog_posts")
      .select("id,title,slug")
      .eq("status", "published")
      .limit(500);
    setOrphans(((posts ?? []) as Array<{ id: string; title: string; slug: string }>).filter((p) => !linkedIds.has(p.id)));
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  useEffect(() => { if (tab === "orphans" && isAdmin) loadOrphans(); }, [tab, isAdmin]);

  const runAnalysis = async (mode: "all" | "orphans" = "all") => {
    setRunning(true);
    const t = toast.loading("Analyse en cours… (peut prendre quelques minutes)");
    try {
      const { data, error } = await invokeWithFreshSession<{ mode: string }, { ok: boolean; stats: Record<string, number> }>(
        "blog-mesh-analyze",
        { mode },
      );
      if (error) throw new Error((error as Error).message);
      toast.success(
        `Analyse terminée : ${data?.stats?.linked ?? 0} reliés, ${data?.stats?.orphans ?? 0} orphelins, ${data?.stats?.links_created ?? 0} liens créés.`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      toast.dismiss(t);
      setRunning(false);
    }
  };

  if (!isReady || rl) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/admin/blogue" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Blogue
            </Link>
            <h1 className="font-display font-extrabold text-lg text-foreground">Maillage intelligent Blogue ↔ SEO</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground font-display font-bold text-sm hover:opacity-90"
            >
              <RefreshCw className="w-4 h-4" /> Actualiser
            </button>
            <button
              onClick={() => runAnalysis("all")}
              disabled={running}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm shadow hover:opacity-90 disabled:opacity-50"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Analyser et rattacher automatiquement tous les articles
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {loading || !stats ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Chargement…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="Articles reliés" value={stats.linked_posts} sub={`/ ${stats.total_posts}`} icon={<Link2 className="w-4 h-4" />} tone="green" />
              <Kpi label="Orphelins" value={stats.orphan_posts} icon={<AlertTriangle className="w-4 h-4" />} tone="orange" />
              <Kpi label="Liens créés" value={stats.total_links} icon={<Network className="w-4 h-4" />} />
              <Kpi label="Opportunités SEO" value={stats.opportunities} icon={<Sparkles className="w-4 h-4" />} tone="blue" />
              <Kpi label="Score moyen" value={`${stats.avg_mesh_score}/100`} icon={<Network className="w-4 h-4" />} />
            </div>

            <div className="flex flex-wrap gap-1 border-b border-border">
              {[
                ["overview", "Vue d'ensemble"],
                ["orphans", `Orphelins (${stats.orphan_posts})`],
                ["opportunities", `Opportunités (${stats.opportunities})`],
                ["history", "Historique"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setTab(k as typeof tab)}
                  className={`px-4 py-2 text-sm font-display font-semibold border-b-2 -mb-px ${
                    tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >{l}</button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <p className="text-sm text-muted-foreground font-body">
                  Le maillage est recalculé automatiquement à chaque modification d'un article ou d'une page SEO.
                  Utilisez le bouton en haut à droite pour un rattachement complet immédiat.
                </p>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border border-border p-4">
                    <div className="font-display font-bold text-foreground mb-2">Couverture blogue</div>
                    <ProgressBar value={stats.total_posts ? Math.round((stats.linked_posts / stats.total_posts) * 100) : 0} />
                    <div className="text-xs text-muted-foreground mt-1">{stats.linked_posts} / {stats.total_posts} articles reliés</div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="font-display font-bold text-foreground mb-2">Couverture pages SEO</div>
                    <ProgressBar value={stats.seo_pages_total ? Math.round((stats.seo_pages_covered / stats.seo_pages_total) * 100) : 0} />
                    <div className="text-xs text-muted-foreground mt-1">{stats.seo_pages_covered} / {stats.seo_pages_total} pages avec au moins un article</div>
                  </div>
                </div>
                {stats.last_run && (
                  <div className="rounded-lg border border-border p-4 text-sm">
                    <div className="font-display font-bold text-foreground mb-2">Dernier run</div>
                    <div className="text-muted-foreground">
                      {new Date(stats.last_run.started_at).toLocaleString("fr-CA")} — {stats.last_run.status}
                    </div>
                    <pre className="mt-2 text-xs bg-muted rounded p-2 overflow-auto">{JSON.stringify(stats.last_run.stats, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {tab === "orphans" && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="text-sm text-muted-foreground">Articles sans page SEO reliée.</div>
                  <button
                    onClick={() => runAnalysis("orphans")}
                    disabled={running}
                    className="text-sm px-3 py-1.5 rounded-lg bg-foreground text-background font-display font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    Ré-analyser les orphelins
                  </button>
                </div>
                {orphans.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground">Aucun orphelin 🎉</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {orphans.map((o) => (
                      <li key={o.id} className="flex items-center justify-between p-3">
                        <Link to={`/admin/blogue/editer/${o.id}`} className="font-semibold text-foreground hover:text-primary line-clamp-1">
                          {o.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">/{o.slug}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "opportunities" && (
              <div className="rounded-2xl border border-border bg-card p-4">
                {!stats.last_run?.opportunities?.length ? (
                  <div className="p-10 text-center text-muted-foreground">Lancez une analyse pour découvrir des opportunités.</div>
                ) : (
                  <ul className="space-y-2">
                    {stats.last_run.opportunities.slice(0, 100).map((o, i) => (
                      <li key={i} className="p-3 rounded-lg border border-border">
                        <div className="text-xs uppercase tracking-wide text-primary font-bold">{String(o.type)}</div>
                        <div className="text-sm text-foreground">{String(o.suggestion ?? "")}</div>
                        {o.title ? <div className="text-xs text-muted-foreground mt-1">{String(o.title)}</div> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "history" && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">Démarré</th>
                      <th className="text-left px-4 py-2">Statut</th>
                      <th className="text-left px-4 py-2">Analysés</th>
                      <th className="text-left px-4 py-2">Reliés</th>
                      <th className="text-left px-4 py-2">Liens créés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {runs.map((r) => r && (
                      <tr key={r.id}>
                        <td className="px-4 py-2 text-xs">{new Date(r.started_at).toLocaleString("fr-CA")}</td>
                        <td className="px-4 py-2">{r.status}</td>
                        <td className="px-4 py-2">{(r.stats as Record<string, number>)?.analyzed ?? 0}</td>
                        <td className="px-4 py-2">{(r.stats as Record<string, number>)?.linked ?? 0}</td>
                        <td className="px-4 py-2">{(r.stats as Record<string, number>)?.links_created ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, tone }: { label: string; value: number | string; sub?: string; icon?: React.ReactNode; tone?: "green" | "orange" | "blue" }) {
  const toneCls =
    tone === "green" ? "text-primary" :
    tone === "orange" ? "text-orange-500" :
    tone === "blue" ? "text-blue-500" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">{icon}{label}</div>
      <div className={`mt-2 text-2xl font-display font-extrabold ${toneCls}`}>{value}{sub && <span className="text-sm text-muted-foreground ml-1">{sub}</span>}</div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}