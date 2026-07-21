import { useEffect, useState } from "react";
import { Loader2, Sparkles, TrendingUp, FileText, RefreshCw, Link2, ShieldCheck, PenSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";

type Report = {
  id: string;
  generated_at: string;
  summary: string | null;
  payload: {
    totals?: Record<string, number>;
    actions?: {
      pages_to_create: number;
      pages_to_refresh: number;
      links_to_add: number;
      qa_to_fix: number;
      blog_to_publish: number;
      stale_blog: number;
      pages_generating?: number;
    };
    projections?: {
      impressions_gain_pct: number;
      clicks_gain_pct: number;
      impressions_gain_abs: number;
      clicks_gain_abs: number;
    };
    in_progress?: {
      job_id: string;
      mode: string;
      wave: string | null;
      total: number;
      done: number;
      succeeded: number;
      failed: number;
      pages_per_minute: number | null;
      eta_seconds: number | null;
      current_step: string | null;
      percent: number;
    } | null;
  };
};

export default function StrategicReport() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("strategic_reports")
      .select("id, generated_at, summary, payload")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setReport((data as Report | null) ?? null);
    setLoading(false);
  }
  useEffect(() => {
    void load();
    // Refresh when a job progresses so the report stays consistent with the pipeline.
    const ch = supabase
      .channel("strategic-report-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_generation_jobs" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "strategic_reports" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await invokeWithFreshSession("seo-strategic-report", {});
      if (error) throw new Error(error.message);
      const d = data as { error?: string };
      if (d?.error) throw new Error(d.error);
      toast.success("Rapport stratégique généré");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRunning(false);
    }
  }

  const a = report?.payload?.actions;
  const proj = report?.payload?.projections;
  const inProgress = report?.payload?.in_progress ?? null;

  return (
    <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-5">
      <header className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-xl font-display font-extrabold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Rapport stratégique de la semaine
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {report ? `Généré ${fmtRel(report.generated_at)}` : "Aucun rapport pour le moment"}
          </p>
        </div>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold shadow hover:opacity-90 disabled:opacity-60"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {running ? "Analyse complète…" : "Analyser maintenant"}
        </button>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
      ) : !report ? (
        <p className="text-sm text-muted-foreground">
          Lance une première analyse pour obtenir un plan d'action hebdomadaire.
        </p>
      ) : (
        <>
          {inProgress && (
            <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center gap-3 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <div className="flex-1">
                <div className="font-display font-bold">
                  Génération en cours — {inProgress.mode} {inProgress.wave ?? "toutes vagues"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {inProgress.done}/{inProgress.total} pages ({inProgress.percent}%)
                  {inProgress.pages_per_minute ? ` · ${inProgress.pages_per_minute.toFixed(1)} p/min` : ""}
                  {inProgress.eta_seconds ? ` · ~${Math.max(1, Math.round(inProgress.eta_seconds / 60))} min restantes` : ""}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <ActionBox icon={FileText} label="Nouvelles pages" value={a?.pages_to_create ?? 0} />
            <ActionBox icon={RefreshCw} label="Pages à rafraîchir" value={a?.pages_to_refresh ?? 0} />
            <ActionBox icon={Link2} label="Liens internes" value={a?.links_to_add ?? 0} />
            <ActionBox icon={ShieldCheck} label="Pages QA < 80" value={a?.qa_to_fix ?? 0} />
            <ActionBox icon={PenSquare} label="Articles à publier" value={a?.blog_to_publish ?? 0} />
          </div>
          {proj && (
            <div className="flex items-center gap-4 flex-wrap p-3 rounded-lg bg-primary/10 border border-primary/20">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="text-sm font-body text-foreground">
                <strong className="font-display font-bold">Gain projeté :</strong>{" "}
                +{proj.impressions_gain_pct}% impressions ({proj.impressions_gain_abs.toLocaleString("fr-CA")} en plus)
                {" · "}
                +{proj.clicks_gain_pct}% clics ({proj.clicks_gain_abs.toLocaleString("fr-CA")} en plus)
              </span>
            </div>
          )}
          {report.summary && (
            <p className="text-xs text-muted-foreground mt-3 font-body">{report.summary}</p>
          )}
        </>
      )}
    </section>
  );
}

function ActionBox({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase font-display tracking-wider">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-2xl font-display font-extrabold text-foreground mt-1">{value}</div>
    </div>
  );
}

function fmtRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}