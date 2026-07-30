import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, RefreshCw, Send, AlertTriangle, FileCheck2, FileText, Search, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";

type StuckPage = { slug: string; status: string; qa_last_score: number | null; word_count: number | null; qa_blockers: string[] | null; stuck_minutes: number; reason: string };
type PublishedPage = { slug: string; title: string; published_at?: string | null; updated_at: string; qa_last_score: number | null; word_count: number | null; google_index_status: string | null };

type Dashboard = {
  computed_at: string;
  counts: {
    target_total: number; in_db: number; drafts: number; in_qa: number;
    published: number; discovered: number; indexed: number;
    qa_avg: number; words_avg: number; last_published: string | null;
  };
  stuck?: StuckPage[];
  stuck_pages?: StuckPage[];
  recent?: PublishedPage[];
  recent_published?: PublishedPage[];
  ready_for_final_qa?: boolean;
};

export default function PublicationDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("seo_publication_dashboard");
      if (error) throw error;
      setData(data as unknown as Dashboard);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(load, 15000);
    const ch = supabase.channel("seo-publication-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_pages" }, () => { void load(); })
      .subscribe();
    return () => { window.clearInterval(t); void supabase.removeChannel(ch); };
  }, [load]);

  async function pingGoogle() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("seo-notify-google", { body: {} });
      if (error) throw error;
      toast.success("Sitemap soumis à Google Search Console");
      console.log("[gsc submit]", data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec ping GSC");
    } finally { setBusy(false); }
  }

  async function runFinalReport() {
    setBusy(true);
    const { data, error } = await supabase.rpc("seo_final_coverage_report");
    setBusy(false);
    if (error) return toast.error(error.message);
    setReport(data as Record<string, unknown>);
    toast.success("Rapport de couverture SEO généré");
  }

  if (loading || !data) return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement du tableau de publication…</div>;

  const c = data.counts;
  const pct = c.target_total > 0 ? Math.round((c.published / c.target_total) * 100) : 0;
  const funnel = [
    { key: "drafts", label: "Brouillons", value: c.drafts, icon: FileText, tone: "muted" as const },
    { key: "in_qa", label: "En QA", value: c.in_qa, icon: Loader2, tone: "muted" as const },
    { key: "published", label: "Publiées", value: c.published, icon: FileCheck2, tone: "good" as const },
    { key: "discovered", label: "Découvertes Google", value: c.discovered, icon: Search, tone: "muted" as const },
    { key: "indexed", label: "Indexées Google", value: c.indexed, icon: CheckCircle2, tone: "good" as const },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-6 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold flex items-center gap-2"><FileCheck2 className="w-5 h-5 text-primary" /> Chaîne de publication</h2>
            <p className="text-xs text-muted-foreground">Brouillons → QA → Publié → Google · mise à jour toutes les 15 s.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} className="gap-2"><RefreshCw className="w-4 h-4" /> Rafraîchir</Button>
            <Button size="sm" onClick={pingGoogle} disabled={busy} className="gap-2"><Send className="w-4 h-4" /> Ping GSC</Button>
            <Button size="sm" variant={data.ready_for_final_qa ? "default" : "outline"} onClick={runFinalReport} disabled={busy} className="gap-2">
              <FileText className="w-4 h-4" /> Rapport SEO final
            </Button>
          </div>
        </header>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progression vers l'objectif ({c.published} / {c.target_total} pages)</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-3" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {funnel.map((f) => (
            <div key={f.key} className="rounded-md border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <f.icon className={`w-3 h-3 ${f.key === "in_qa" && f.value > 0 ? "animate-spin" : ""}`} /> {f.label}
              </div>
              <div className={`text-2xl font-bold mt-1 ${f.tone === "good" ? "text-green-700" : "text-foreground"}`}>{f.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Meta label="Objectif total" value={c.target_total} />
          <Meta label="QA moyen" value={c.qa_avg} />
          <Meta label="Mots moyen" value={c.words_avg} />
          <Meta label="Dernière publication" value={c.last_published ? new Date(c.last_published).toLocaleString("fr-CA") : "—"} />
        </div>
      </Card>

      {data.stuck_pages.length > 0 && (
        <Card className="p-4 md:p-6">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-destructive">
            <AlertTriangle className="w-4 h-4" /> Pages bloquées depuis &gt; 5 minutes ({data.stuck_pages.length})
          </h3>
          <div className="overflow-auto max-h-[400px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="text-left border-b border-border">
                  <th className="p-2">Slug</th>
                  <th className="p-2">Depuis</th>
                  <th className="p-2">QA</th>
                  <th className="p-2">Mots</th>
                  <th className="p-2">Cause</th>
                </tr>
              </thead>
              <tbody>
                {data.stuck_pages.map((p) => (
                  <tr key={p.slug} className="border-b border-border/50">
                    <td className="p-2 font-mono">{p.slug}</td>
                    <td className="p-2">{p.stuck_minutes} min</td>
                    <td className="p-2">{p.qa_last_score ?? "—"}</td>
                    <td className={`p-2 ${(p.word_count ?? 0) < 800 ? "text-destructive" : ""}`}>{p.word_count ?? 0}</td>
                    <td className="p-2 text-muted-foreground">{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-4 md:p-6">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-green-700" /> 25 dernières publications</h3>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background">
              <tr className="text-left border-b border-border">
                <th className="p-2">Titre</th>
                <th className="p-2">Slug</th>
                <th className="p-2 text-right">QA</th>
                <th className="p-2 text-right">Mots</th>
                <th className="p-2">Google</th>
                <th className="p-2">Publié</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_published.map((p) => (
                <tr key={p.slug} className="border-b border-border/50">
                  <td className="p-2 max-w-[280px] truncate">{p.title}</td>
                  <td className="p-2 font-mono text-muted-foreground">{p.slug}</td>
                  <td className="p-2 text-right">{p.qa_last_score ?? "—"}</td>
                  <td className="p-2 text-right">{p.word_count ?? "—"}</td>
                  <td className="p-2"><Badge variant="outline" className="text-[10px]">{p.google_index_status ?? "unknown"}</Badge></td>
                  <td className="p-2 text-muted-foreground">{new Date(p.updated_at).toLocaleString("fr-CA")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {report && (
        <Card className="p-4 md:p-6 space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Rapport de couverture SEO final</h3>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => {
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob); const a = document.createElement("a");
              a.href = url; a.download = `seo-coverage-report-${new Date().toISOString().slice(0,10)}.json`; a.click();
              URL.revokeObjectURL(url);
            }}><Download className="w-4 h-4" /> Télécharger</Button>
          </header>
          <pre className="text-[11px] font-mono bg-muted/40 rounded p-3 overflow-auto max-h-[400px]">{JSON.stringify(report, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}