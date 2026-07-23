import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Sparkles, TrendingUp, TrendingDown, Phone, MessageCircle, Mail, FileText, ExternalLink, Zap, Plus, X, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCopilot, type Opportunity } from "@/lib/seo/useCopilot";

function Stars({ n }: { n: number }) {
  const filled = Math.max(1, Math.min(5, Math.round(n / 20)));
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= filled ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-body">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="text-2xl font-display font-bold text-foreground mt-1">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function OpportunityRow({ o, onRefresh, onDismiss }: { o: Opportunity; onRefresh: () => void; onDismiss: (id: string) => void }) {
  const apply = async () => {
    try {
      if (o.suggested_action === "create" && o.target_city_slug) {
        const { error } = await supabase.rpc("seo_pipeline_start", {
          _mode: "single_city",
          _city_slugs: [o.target_city_slug],
          _qa_threshold: 90,
          _force_regenerate: false,
        });
        if (error) throw error;
        toast.success(`Pipeline lancé pour ${o.target_city_slug}`);
      } else if (o.suggested_action === "optimize") {
        const { error } = await supabase.rpc("seo_optimization_start", {
          _concurrency: 5, _threshold: 90, _skip_above: 95, _actions: [],
          _force_all: false, _city_slugs: null, _limit: 100,
        });
        if (error) throw error;
        toast.success("Optimisation lancée");
      } else {
        toast.info("Action non automatisée — traiter manuellement.");
        return;
      }
      await supabase.from("seo_opportunities")
        .update({ status: "applied", applied_at: new Date().toISOString() })
        .eq("id", o.id);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <li className="p-4 hover:bg-secondary/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Stars n={o.impact_score} />
            <span className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">
              {o.type.replace(/_/g, " ")}
            </span>
          </div>
          <div className="font-display font-semibold text-foreground">{o.title}</div>
          <div className="text-sm text-muted-foreground mt-1">{o.rationale}</div>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            {o.potential_searches != null && <span>~{o.potential_searches.toLocaleString()} rech./mois</span>}
            {o.potential_clicks != null && <span>+{o.potential_clicks} clics est.</span>}
            {o.potential_leads != null && <span>+{o.potential_leads} demandes est.</span>}
            <span>Impact {o.impact_score} · Effort {o.effort_score}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={apply}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:opacity-90">
            {o.suggested_action === "create" ? <><Plus className="w-3.5 h-3.5" /> Créer</> :
             o.suggested_action === "optimize" ? <><Zap className="w-3.5 h-3.5" /> Optimiser</> :
             o.suggested_action}
          </button>
          <button onClick={() => onDismiss(o.id)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" /> Ignorer
          </button>
        </div>
      </div>
    </li>
  );
}

export default function CopilotDashboard() {
  const { data, loading, scanning, rescan, reload, dismissOpportunity } = useCopilot();

  if (loading && !data) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return <p className="text-sm text-muted-foreground">Aucune donnée.</p>;

  const k = data.kpi;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Copilote SEO</h2>
          <p className="text-sm text-muted-foreground">Priorités calculées automatiquement à partir de Search Console, des conversions et de la couverture.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm font-display font-semibold hover:bg-secondary">
            <RefreshCw className="w-4 h-4" /> Rafraîchir
          </button>
          <button onClick={rescan} disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90 disabled:opacity-60">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Lancer l'analyse IA
          </button>
        </div>
      </div>

      {/* KPI */}
      <div>
        <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Trafic & couverture (28 j)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Pages publiées" value={`${k.pages_published}/${k.pages_total}`} icon={FileText} hint={`${k.pages_indexed} indexées`} />
          <KpiCard label="Clics Google" value={k.gsc_clicks_28d.toLocaleString()} icon={TrendingUp} hint={`${k.gsc_impressions_28d.toLocaleString()} impressions`} />
          <KpiCard label="Position moyenne" value={k.gsc_position_avg.toFixed(1)} icon={TrendingUp} />
          <KpiCard label="QA moyen" value={`${k.qa_avg}/100`} icon={Zap} />
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Conversions (30 j)</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Total conversions" value={k.conversions_30d} icon={Zap} />
          <KpiCard label="Demandes" value={k.submissions_30d} icon={FileText} />
          <KpiCard label="Téléphone" value={k.phone_30d} icon={Phone} />
          <KpiCard label="WhatsApp" value={k.whatsapp_30d} icon={MessageCircle} />
          <KpiCard label="Courriel" value={k.email_30d} icon={Mail} />
        </div>
      </div>

      {/* Opportunities */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground">Top opportunités</h3>
          <span className="text-xs text-muted-foreground">{data.top_opportunities.length} priorités</span>
        </div>
        {data.top_opportunities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Sparkles className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Aucune opportunité ouverte — lance une analyse IA pour en générer.</p>
          </div>
        ) : (
          <ul className="rounded-lg border border-border bg-card divide-y divide-border">
            {data.top_opportunities.map((o) => (
              <OpportunityRow key={o.id} o={o} onRefresh={reload} onDismiss={dismissOpportunity} />
            ))}
          </ul>
        )}
      </div>

      {/* Gains & losses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DeltaList title="Top gains (28 j)" icon={TrendingUp} tone="positive" rows={data.top_gains_30d} />
        <DeltaList title="Top pertes (28 j)" icon={TrendingDown} tone="negative" rows={data.top_losses_30d} />
      </div>
    </div>
  );
}

function DeltaList({ title, icon: Icon, tone, rows }: { title: string; icon: React.ComponentType<{ className?: string }>; tone: "positive" | "negative"; rows: Array<{ slug: string; title: string; clicks: number; clicks_delta: number; position: number; position_gain: number }> }) {
  const color = tone === "positive" ? "text-primary" : "text-destructive";
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${color}`} /> {title}
      </h3>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aucune variation.</div>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.slice(0, 5).map((r) => (
            <li key={r.slug} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-body text-foreground text-sm truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs">
                <span className={`font-display font-bold ${color}`}>
                  {r.clicks_delta > 0 ? "+" : ""}{r.clicks_delta} clics
                </span>
                <Link to={`/${r.slug}`} target="_blank" className="text-primary hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}