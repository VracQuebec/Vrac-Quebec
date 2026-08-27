import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, RefreshCw, ExternalLink, AlertTriangle, TrendingUp, Search, Eye, MousePointerClick, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";

type Kpi = {
  computed_at: string;
  published: number; discovered: number; indexed: number;
  top3: number; top10: number; zero_impressions: number;
  need_meta_rewrite: number; boost_candidates: number; not_indexed_14d: number;
};

type PageRow = {
  id: string; slug: string; title: string; status: string;
  published_at: string | null; discovered_at: string | null; indexed_at: string | null;
  impressions: number; clicks: number; ctr: number; avg_position: number;
  top_queries: Array<{ query: string; clicks?: number; impressions?: number }>;
  backlinks_count: number; qa_last_score: number | null;
  intelligence_flags: string[]; diagnostic_report: Record<string, unknown>;
  intelligence_last_checked_at: string | null;
};

type Filter = "all" | "not_indexed_14d" | "need_meta_rewrite" | "boost" | "top3" | "zero_impressions";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function Kpi({ label, value, icon: Icon, tone, action }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone?: "positive" | "warning" | "neutral"; action?: { label: string; onClick: () => void } }) {
  const color = tone === "positive" ? "text-primary" : tone === "warning" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-body">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className={`text-2xl font-display font-bold mt-1 ${color}`}>{value.toLocaleString("fr-CA")}</div>
      {action && (
        <button onClick={action.onClick}
          className="mt-2 w-full px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-display font-bold hover:opacity-90">
          {action.label}
        </button>
      )}
    </div>
  );
}


const FLAG_LABELS: Record<string, string> = {
  robots_blocked: "Bloqué par robots.txt",
  noindex: "Balise noindex",
  canonical_mismatch: "Canonical incorrect",
  thin_content: "Contenu trop faible",
  insufficient_internal_links: "Maillage insuffisant",
  http_error: "Erreur HTTP",
  duplicate_content: "Contenu dupliqué",
  needs_meta_rewrite: "Meta à réécrire",
};

export default function SeoIntelligence() {
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [rows, setRows] = useState<PageRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [k, p] = await Promise.all([
      supabase.rpc("seo_intelligence_dashboard"),
      supabase.rpc("seo_intelligence_pages", { _filter: filter, _limit: 100 }),
    ]);
    if (k.error) toast.error(k.error.message);
    else setKpi(k.data as unknown as Kpi);
    if (p.error) toast.error(p.error.message);
    else setRows((p.data ?? []) as unknown as PageRow[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await invokeWithFreshSession<Record<string, never>, { ok: boolean; stats: Record<string, number> }>("seo-intelligence-scan", {});
      if (res.error) throw new Error(res.error.message);
      const s = res.data?.stats ?? {};
      toast.success(`Scan terminé — ${s.diagnosed ?? 0} diagnostics · ${s.meta_flagged ?? 0} meta · ${s.boost_flagged ?? 0} boost`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setScanning(false); }
  };

  const filters: Array<{ id: Filter; label: string; count?: number }> = [
    { id: "all", label: "Toutes" },
    { id: "not_indexed_14d", label: "Non indexées 14 j+", count: kpi?.not_indexed_14d },
    { id: "need_meta_rewrite", label: "Meta à réécrire", count: kpi?.need_meta_rewrite },
    { id: "boost", label: "Position 8–20 (boost)", count: kpi?.boost_candidates },
    { id: "top3", label: "Top 3", count: kpi?.top3 },
    { id: "zero_impressions", label: "Sans impression", count: kpi?.zero_impressions },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">SEO Intelligence</h2>
          <p className="text-sm text-muted-foreground">Performance réelle, diagnostic automatique et optimisations proposées.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm font-display font-semibold hover:bg-secondary">
            <RefreshCw className="w-4 h-4" /> Rafraîchir
          </button>
          <button onClick={runScan} disabled={scanning} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90 disabled:opacity-60">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Lancer l'analyse
          </button>
        </div>
      </div>

      {kpi && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Kpi label="Publiées" value={kpi.published} icon={TrendingUp} />
          <Kpi label="Découvertes" value={kpi.discovered} icon={Search} />
          <Kpi label="Indexées" value={kpi.indexed} icon={Eye} tone="positive" />
          <Kpi label="Top 3" value={kpi.top3} icon={TrendingUp} tone="positive" />
          <Kpi label="Top 10" value={kpi.top10} icon={TrendingUp} />
          <Kpi label="Sans impression" value={kpi.zero_impressions} icon={AlertTriangle} tone="warning" />
          <Kpi label="À optimiser" value={kpi.need_meta_rewrite + kpi.boost_candidates + kpi.not_indexed_14d} icon={AlertTriangle} tone="warning" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold border ${filter === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary"}`}>
            {f.label}{typeof f.count === "number" ? ` · ${f.count}` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Aucune page pour ce filtre.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/50">
              <tr>
                <th className="text-left p-2">Page</th>
                <th className="text-left p-2">Publiée</th>
                <th className="text-left p-2">Découverte</th>
                <th className="text-left p-2">Indexée</th>
                <th className="text-right p-2">Impr.</th>
                <th className="text-right p-2">Clics</th>
                <th className="text-right p-2">CTR</th>
                <th className="text-right p-2">Pos.</th>
                <th className="text-left p-2">Mots-clés</th>
                <th className="text-right p-2"><Link2 className="w-3 h-3 inline" /></th>
                <th className="text-right p-2">QA</th>
                <th className="text-left p-2">Diagnostic</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="p-2 max-w-[220px]">
                    <div className="truncate font-body text-foreground">{r.title}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">/{r.slug}</div>
                  </td>
                  <td className="p-2 text-muted-foreground">{fmtDate(r.published_at)}</td>
                  <td className="p-2 text-muted-foreground">{fmtDate(r.discovered_at)}</td>
                  <td className="p-2">{r.indexed_at ? <span className="text-primary">{fmtDate(r.indexed_at)}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2 text-right font-mono">{r.impressions}</td>
                  <td className="p-2 text-right font-mono"><MousePointerClick className="w-3 h-3 inline mr-0.5 text-muted-foreground" />{r.clicks}</td>
                  <td className="p-2 text-right font-mono">{(Number(r.ctr) * 100).toFixed(1)}%</td>
                  <td className="p-2 text-right font-mono">{Number(r.avg_position) > 0 ? Number(r.avg_position).toFixed(1) : "—"}</td>
                  <td className="p-2 max-w-[180px] truncate text-muted-foreground">
                    {(r.top_queries ?? []).slice(0, 3).map((q) => q.query).join(", ") || "—"}
                  </td>
                  <td className="p-2 text-right font-mono">{r.backlinks_count}</td>
                  <td className="p-2 text-right font-mono">{r.qa_last_score ?? "—"}</td>
                  <td className="p-2 max-w-[220px]">
                    <div className="flex flex-wrap gap-1">
                      {(r.intelligence_flags ?? []).map((f) => (
                        <span key={f} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-semibold">
                          {FLAG_LABELS[f] ?? f}
                        </span>
                      ))}
                      {(!r.intelligence_flags || r.intelligence_flags.length === 0) && <span className="text-muted-foreground text-[10px]">Ok</span>}
                    </div>
                  </td>
                  <td className="p-2 text-right">
                    <a href={`/${r.slug}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}