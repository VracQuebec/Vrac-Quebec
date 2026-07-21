import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeSeo } from "@/lib/seo/api";
import { toast } from "sonner";
import { Loader2, Play, CheckCircle2, AlertCircle, Rocket, Sparkles } from "lucide-react";

type Job = {
  id: string;
  status: string;
  mode: string;
  wave: string | null;
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  report: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
};

const WAVES: Array<{ code: string | null; label: string }> = [
  { code: "S1", label: "S1 — Grandes villes" },
  { code: "S2", label: "S2 — Villes moyennes" },
  { code: "S3", label: "S3 — Longue traîne" },
  { code: null, label: "Toutes les vagues" },
];

export default function WaveRunner() {
  const [autoPipeline, setAutoPipeline] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);

  async function loadRecent() {
    const { data } = await supabase
      .from("seo_generation_jobs")
      .select("id,status,mode,wave,total,done,succeeded,failed,report,started_at,finished_at")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(5);
    setHistory((data ?? []) as Job[]);
    const active = (data ?? []).find((j) => j.status === "running");
    if (active) setJob(active as Job);
  }

  useEffect(() => {
    void loadRecent();
    const ch = supabase
      .channel("seo-jobs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_generation_jobs" }, (payload) => {
        const row = payload.new as Job;
        if (job && row.id === job.id) setJob(row);
        void loadRecent();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function launch(mode: "generate" | "publish" | "pipeline", wave: string | null) {
    const key = `${mode}-${wave ?? "all"}`;
    setRunning(key);
    try {
      const res = await invokeSeo<{ ok: boolean; job_id?: string; empty?: boolean; message?: string; total?: number }>(
        "seo-pipeline-run",
        { mode, wave, auto_fix: true, qa_threshold: 80, limit: 500 },
      );
      if (res.empty) {
        toast.info(res.message || "Rien à traiter.");
      } else {
        toast.success(`Job lancé : ${res.total} éléments à traiter.`);
        void loadRecent();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du lancement.");
    } finally {
      setRunning(null);
    }
  }

  const activeJob = job && job.status === "running" ? job : null;
  const progress = activeJob ? Math.round((activeJob.done / Math.max(1, activeJob.total)) * 100) : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-display font-extrabold text-foreground flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" /> Pipeline SEO — Publication par vague
          </h2>
          <p className="text-xs text-muted-foreground font-body mt-1">
            Générer → Vérifier → Corriger → Publier automatiquement. Concurrence 3, QA ≥ 80.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-display font-semibold cursor-pointer">
          <input type="checkbox" checked={autoPipeline} onChange={(e) => setAutoPipeline(e.target.checked)} className="accent-primary" />
          Pipeline automatique (Générer → Vérifier → Publier)
        </label>
      </header>

      {activeJob ? (
        <div className="rounded-lg bg-secondary p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-display font-semibold">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Job en cours — {activeJob.mode} {activeJob.wave ?? "toutes vagues"}
            </span>
            <span>{activeJob.done}/{activeJob.total} ({progress}%)</span>
          </div>
          <div className="h-2 rounded-full bg-background overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="text-green-600">✓ {activeJob.succeeded} réussis</span>
            <span className="text-red-600">✗ {activeJob.failed} échoués</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {WAVES.map((w) => (
            <div key={w.label} className="rounded-lg border border-border p-3 space-y-2">
              <div className="font-display font-bold text-sm text-foreground">{w.label}</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => launch("generate", w.code)}
                  disabled={running !== null}
                  className="text-[11px] font-display font-semibold px-2 py-1.5 rounded-md border border-border hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {running === `generate-${w.code ?? "all"}` ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Générer"}
                </button>
                <button
                  onClick={() => launch("publish", w.code)}
                  disabled={running !== null}
                  className="text-[11px] font-display font-semibold px-2 py-1.5 rounded-md border border-border hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {running === `publish-${w.code ?? "all"}` ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Publier"}
                </button>
                <button
                  onClick={() => launch(autoPipeline ? "pipeline" : "generate", w.code)}
                  disabled={running !== null}
                  className="text-[11px] font-display font-extrabold px-2 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {running === `pipeline-${w.code ?? "all"}` ? <Loader2 className="w-3 h-3 animate-spin" /> : (<><Sparkles className="w-3 h-3" /> Pipeline</>)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-3 border-t border-border">
          <h3 className="text-xs font-display font-bold text-muted-foreground uppercase mb-2">Derniers rapports</h3>
          <div className="space-y-1.5">
            {history.slice(0, 5).map((h) => (
              <div key={h.id} className="flex items-center justify-between text-xs bg-background rounded-md px-3 py-2">
                <div className="flex items-center gap-2">
                  {h.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    : h.status === "failed" ? <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                    : <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                  <span className="font-display font-semibold">{h.mode} — {h.wave ?? "toutes"}</span>
                </div>
                <div className="text-muted-foreground">
                  {h.succeeded}/{h.total} · QA moy. {(h.report as { qa_avg?: number })?.qa_avg ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}