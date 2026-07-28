import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, MapPin, Gauge, FileText, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";

type Coverage = {
  computed_at: string;
  totals: { municipalites: number; arrondissements: number; quartiers: number; secteurs: number; served: number; total: number };
  pages: { total: number; published: number; draft: number; indexable: number; thin: number; qa_avg: number; words_avg: number };
  by_city: Array<{
    slug: string; name: string; territory_type: string; parent_slug: string | null;
    mrc: string | null; region_admin: string | null;
    seo_priority: number; population: number | null; last_generated_at: string | null;
    pages_total: number; pages_published: number; pages_draft: number; pages_thin: number;
    qa_avg: number; words_avg: number;
  }>;
  active_run: { id: string; status: string; total_pages: number; done_pages: number; current_city_slug: string | null } | null;
  economy?: { credits_spent?: number; credits_saved?: number; cache_hit_rate?: number };
};

export default function TerritorialCoverage() {
  const [data, setData] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportBusy, setReportBusy] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("seo_territorial_coverage");
    if (error) toast.error(error.message);
    else setData(data as unknown as Coverage);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function fetchReport() {
    setReportBusy(true);
    const { data, error } = await supabase.rpc("seo_final_report", { _run_id: null });
    setReportBusy(false);
    if (error) return toast.error(error.message);
    setReport(data as Record<string, unknown>);
  }

  if (loading || !data) return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement de la couverture territoriale…</div>;

  const t = data.totals; const p = data.pages;
  const pct = p.total > 0 ? Math.round((p.published / p.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-6 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" /> Couverture territoriale</h2>
            <p className="text-xs text-muted-foreground">Territoires desservis par Vrac Québec — pilotage automatique par la base.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} className="gap-2"><RefreshCw className="w-4 h-4" /> Rafraîchir</Button>
            <Button size="sm" onClick={fetchReport} disabled={reportBusy} className="gap-2">
              {reportBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Rapport final
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Stat label="Municipalités" value={t.municipalites} />
          <Stat label="Arrondissements" value={t.arrondissements} />
          <Stat label="Quartiers" value={t.quartiers} />
          <Stat label="Secteurs" value={t.secteurs} />
          <Stat label="Territoires desservis" value={t.served} tone="good" />
          <Stat label="Total territoires" value={t.total} />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Publication ({p.published} / {p.total})</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Stat label="Pages total" value={p.total} />
          <Stat label="Publiées" value={p.published} tone="good" />
          <Stat label="Brouillons" value={p.draft} tone="muted" />
          <Stat label="Indexables (≥800 mots)" value={p.indexable} tone="good" />
          <Stat label="Contenu maigre" value={p.thin} tone={p.thin > 0 ? "bad" : "muted"} />
          <Stat label="QA moyenne" value={`${p.qa_avg}`} />
        </div>

        {data.active_run && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <strong>Run actif</strong>
              <Badge variant="outline">{data.active_run.status}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {data.active_run.done_pages} / {data.active_run.total_pages}
                {data.active_run.current_city_slug && ` · ${data.active_run.current_city_slug}`}
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 md:p-6">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> Progression par territoire ({data.by_city.length})</h3>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="text-left border-b border-border">
                <th className="p-2">Territoire</th>
                <th className="p-2">Type</th>
                <th className="p-2">MRC</th>
                <th className="p-2 text-right">Priorité</th>
                <th className="p-2 text-right">Pages</th>
                <th className="p-2 text-right">Publiées</th>
                <th className="p-2 text-right">Maigres</th>
                <th className="p-2 text-right">QA</th>
                <th className="p-2 text-right">Mots ⌀</th>
              </tr>
            </thead>
            <tbody>
              {data.by_city.map((c) => (
                <tr key={c.slug} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="p-2 font-medium">{c.name}<div className="text-[10px] text-muted-foreground">{c.slug}</div></td>
                  <td className="p-2"><Badge variant="outline" className="text-[10px]">{c.territory_type}</Badge></td>
                  <td className="p-2 text-muted-foreground">{c.mrc ?? "—"}</td>
                  <td className="p-2 text-right">{c.seo_priority}</td>
                  <td className="p-2 text-right">{c.pages_total}</td>
                  <td className="p-2 text-right text-green-700">{c.pages_published}</td>
                  <td className={`p-2 text-right ${c.pages_thin > 0 ? "text-destructive" : "text-muted-foreground"}`}>{c.pages_thin}</td>
                  <td className="p-2 text-right">{c.qa_avg}</td>
                  <td className="p-2 text-right">{c.words_avg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {report && (
        <Card className="p-4 md:p-6 space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Rapport final</h3>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => {
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob); const a = document.createElement("a");
              a.href = url; a.download = `seo-final-report-${new Date().toISOString().slice(0,10)}.json`; a.click();
              URL.revokeObjectURL(url);
            }}><Download className="w-4 h-4" /> Télécharger</Button>
          </header>
          <pre className="text-[11px] font-mono bg-muted/40 rounded p-3 overflow-auto max-h-[400px]">{JSON.stringify(report, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" | "muted" }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-destructive" : tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background/50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${cls}`}>{value}</div>
    </div>
  );
}