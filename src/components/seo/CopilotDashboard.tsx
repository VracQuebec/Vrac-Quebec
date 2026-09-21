import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, RefreshCw, Sparkles, TrendingUp, TrendingDown, Phone, MessageCircle, Mail,
  FileText, ExternalLink, Zap, X, Check, ChevronDown, ChevronRight, CircleHelp, History,
} from "lucide-react";
import { toast } from "sonner";
import { useCopilot, SCAN_STEPS, type Opportunity, type OpportunityPriority } from "@/lib/seo/useCopilot";

const PRIORITY: Record<OpportunityPriority, { label: string; cls: string }> = {
  critical: { label: "CRITIQUE", cls: "bg-destructive text-destructive-foreground" },
  high: { label: "HAUTE", cls: "bg-primary text-primary-foreground" },
  medium: { label: "MOYENNE", cls: "bg-secondary text-secondary-foreground" },
  low: { label: "FAIBLE", cls: "bg-muted text-muted-foreground" },
};

const TYPE_LABEL: Record<string, string> = {
  high_impr_low_ctr: "Impressions élevées / clics faibles",
  ctr_top10: "CTR faible en top 10",
  position_gain: "Gain de position possible",
  not_indexed: "Publiée non indexée",
  not_indexed_bulk: "Indexation — constat global",
  converting_page: "Page qui convertit",
  local_potential: "Potentiel territoire × service",
  low_qa: "Qualité SEO faible",
  cannibalization: "Cannibalisation à vérifier",
  group_service: "Groupe — service",
  group_territory: "Groupe — territoire",
};

type FilterKey =
  | "all" | "critical" | "high" | "medium"
  | "technique" | "ctr" | "position" | "conversion"
  | "indexation" | "cannibalisation" | "territoire_service" | "groupe";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "critical", label: "Critiques" },
  { key: "high", label: "Hautes" },
  { key: "medium", label: "Moyennes" },
  { key: "technique", label: "SEO technique" },
  { key: "ctr", label: "CTR" },
  { key: "position", label: "Position" },
  { key: "conversion", label: "Conversion" },
  { key: "indexation", label: "Indexation" },
  { key: "cannibalisation", label: "Cannibalisation" },
  { key: "territoire_service", label: "Territoire × service" },
  { key: "groupe", label: "Groupes" },
];

function matchFilter(o: Opportunity, f: FilterKey): boolean {
  if (f === "all") return true;
  if (f === "critical" || f === "high" || f === "medium") return o.priority === f;
  return o.category === f;
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

function fmt(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("fr-CA") : value.toFixed(2);
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function OpportunityRow({ o, rank, onStatus }: { o: Opportunity; rank?: number; onStatus: (id: string, s: "dismissed" | "in_progress" | "completed") => void }) {
  const [open, setOpen] = useState(false);
  const p = PRIORITY[o.priority] ?? PRIORITY.medium;
  const conversions = Number((o.data as Record<string, unknown> | null)?.conversions ?? 0);
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {rank != null && <span className="text-[10px] font-display font-bold text-muted-foreground">#{rank}</span>}
            <span className={`px-2 py-0.5 rounded text-[10px] font-display font-bold tracking-wider ${p.cls}`}>{p.label}</span>
            {conversions > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-display font-bold bg-primary/15 text-primary">
                {conversions} CONVERSION{conversions > 1 ? "S" : ""}
              </span>
            )}
            {o.data_quality && o.data_quality !== "suffisante" && (
              <span className="text-[10px] uppercase text-muted-foreground">donnée {o.data_quality}</span>
            )}
            <span className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">
              {TYPE_LABEL[o.type] ?? o.type.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-muted-foreground">Score {o.score}/100 · Effort {o.effort_score}</span>
            {o.status === "in_progress" && <span className="text-[10px] text-primary font-semibold">EN COURS</span>}
          </div>
          <div className="font-display font-semibold text-foreground flex items-center gap-1">
            {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            {o.title}
          </div>
          {o.url && <div className="text-xs font-mono text-muted-foreground truncate mt-0.5">{o.url}</div>}
          <div className="text-sm text-muted-foreground mt-1">{o.reason ?? o.rationale}</div>
        </button>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={() => onStatus(o.id, "in_progress")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:opacity-90">
            <Zap className="w-3.5 h-3.5" /> Travailler
          </button>
          <button onClick={() => onStatus(o.id, "completed")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Check className="w-3 h-3" /> Terminée
          </button>
          <button onClick={() => onStatus(o.id, "dismissed")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" /> Ignorer
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 md:grid-cols-2 rounded-md border border-border bg-secondary/30 p-3 text-xs">
          <div>
            <div className="font-display font-bold text-foreground mb-1">Données sources</div>
            <ul className="space-y-0.5">
              {Object.entries(o.data ?? {}).map(([k, v]) => (
                <li key={k} className="text-muted-foreground"><span className="text-foreground">{k}</span> : {fmt(v)}</li>
              ))}
              {Object.keys(o.data ?? {}).length === 0 && <li className="text-muted-foreground">Aucune donnée détaillée.</li>}
            </ul>
          </div>
          <div className="space-y-2">
            <div>
              <div className="font-display font-bold text-foreground mb-1">Action recommandée</div>
              <p className="text-muted-foreground">{o.recommended_action ?? "—"}</p>
            </div>
            {o.expected_impact && (
              <div>
                <div className="font-display font-bold text-foreground mb-1">Impact attendu</div>
                <p className="text-muted-foreground">{o.expected_impact}</p>
              </div>
            )}
            {(o.score_factors?.length ?? 0) > 0 && (
              <div>
                <div className="font-display font-bold text-foreground mb-1">Pourquoi cette priorité ? (score {o.score}/100)</div>
                <ul className="space-y-0.5">
                  {o.score_factors.map((f, i) => (
                    <li key={`${f.label}-${i}`} className="text-muted-foreground flex justify-between gap-2">
                      <span>{f.label}</span>
                      <span className={f.points >= 0 ? "text-primary font-semibold" : "text-destructive font-semibold"}>
                        {f.points > 0 ? "+" : ""}{f.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-muted-foreground">
              <div><span className="text-foreground">Source :</span> {o.source ?? "—"}</div>
              <div><span className="text-foreground">Détectée le :</span> {new Date(o.detected_at).toLocaleString("fr-CA")}</div>
              <div><span className="text-foreground">Vue pour la dernière fois :</span> {new Date(o.last_seen_at).toLocaleString("fr-CA")}</div>
            </div>
            {o.entity_slug && !o.url && <div className="font-mono text-muted-foreground">{o.entity_slug}</div>}
            {o.url && (
              <a href={o.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Ouvrir la page
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function CopilotDashboard() {
  const { data, copilot, loading, scanning, step, rescan, reload, setOpportunityStatus } = useCopilot();
  const [showDiag, setShowDiag] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showAll, setShowAll] = useState(false);

  if (loading && !data) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return <p className="text-sm text-muted-foreground">Aucune donnée.</p>;

  const k = data.kpi;
  const run = copilot?.last_run ?? null;
  const opps = copilot?.opportunities ?? [];
  const counts = copilot?.counts ?? {};

  const filtered = opps.filter((o) => matchFilter(o, filter));
  const visible = showAll ? filtered : filtered.slice(0, 10);

  const onStatus = async (id: string, s: "dismissed" | "in_progress" | "completed") => {
    await setOpportunityStatus(id, s);
    toast.success(s === "dismissed" ? "Opportunité ignorée" : s === "completed" ? "Opportunité marquée terminée" : "Opportunité en cours");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Copilote SEO</h2>
          <p className="text-sm text-muted-foreground">Priorités calculées à partir de Search Console, des conversions, de l'indexation et de la couverture réelle. Analyse en lecture seule : aucune page n'est modifiée ni publiée.</p>
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

      {/* Progression de l'analyse */}
      {step >= 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
          {SCAN_STEPS.map((s, i) => (
            <div key={s} className={`flex items-center gap-2 text-sm ${i < step ? "text-muted-foreground" : i === step ? "text-foreground font-semibold" : "text-muted-foreground/50"}`}>
              {i < step ? <Check className="w-4 h-4 text-primary" /> : i === step ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="w-4" />}
              {s}
            </div>
          ))}
        </div>
      )}

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

      {/* Opportunités */}
      <div>
        <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Opportunités SEO</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
          <KpiCard label="Opportunités" value={counts.open ?? opps.length} icon={Sparkles} />
          <KpiCard label="Critiques" value={counts.critical ?? 0} icon={Zap} />
          <KpiCard label="Hautes" value={counts.high ?? 0} icon={Zap} />
          <KpiCard label="Moyennes" value={counts.medium ?? 0} icon={Zap} />
          <KpiCard label="Avec conversion" value={counts.with_conversions ?? 0} icon={Phone} />
          <KpiCard label="Fort potentiel" value={counts.high_potential ?? 0} icon={TrendingUp} hint="Score ≥ 60" />
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => { setFilter(f.key); setShowAll(false); }}
              className={`px-2.5 py-1 rounded-md text-xs font-display font-semibold border ${filter === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
              {f.label} ({opps.filter((o) => matchFilter(o, f.key)).length})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-sm text-foreground font-display font-semibold">
              {run ? "Analyse terminée — aucune opportunité répondant actuellement aux critères de priorité." : "Aucune analyse n'a encore été lancée."}
            </p>
            {run && (
              <p className="text-xs text-muted-foreground">
                {run.pages_analyzed} pages analysées · {run.gsc_rows_analyzed} URL Search Console · {run.impressions_analyzed.toLocaleString("fr-CA")} impressions ·
                {" "}{run.conversions_analyzed} conversions · {run.indexed_analyzed} pages indexées · {run.rules?.length ?? 0} règles évaluées
              </p>
            )}
          </div>
        ) : (
          <ul className="rounded-lg border border-border bg-card divide-y divide-border">
            {opps.map((o) => <OpportunityRow key={o.id} o={o} onStatus={onStatus} />)}
          </ul>
        )}
      </div>

      {/* Diagnostic */}
      {run && (
        <div className="rounded-lg border border-border bg-card">
          <button onClick={() => setShowDiag((v) => !v)} className="w-full flex items-center justify-between p-3 text-left">
            <span className="flex items-center gap-2 text-sm font-display font-bold text-foreground">
              <CircleHelp className="w-4 h-4" /> Pourquoi ces opportunités ? (diagnostic des règles)
            </span>
            {showDiag ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showDiag && (
            <div className="border-t border-border p-3 space-y-2 text-xs">
              <div className="text-muted-foreground">
                Analyse du {new Date(run.started_at).toLocaleString("fr-CA")} · durée {((run.duration_ms ?? 0) / 1000).toFixed(1)} s ·
                {" "}{run.pages_analyzed} pages · {run.gsc_rows_analyzed} URL Search Console · {run.conversions_analyzed} conversions ·
                {" "}{run.new_count} nouvelle(s), {run.updated_count} mise(s) à jour, {run.stale_count} obsolète(s)
              </div>
              <table className="w-full">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left py-1">Règle</th><th className="text-right">Candidates</th><th className="text-right">Retenues</th><th className="text-left pl-3">Critère</th></tr>
                </thead>
                <tbody>
                  {(run.rules ?? []).map((r) => (
                    <tr key={r.code} className="border-t border-border/60">
                      <td className="py-1 text-foreground">{r.label}</td>
                      <td className="text-right">{r.candidates}</td>
                      <td className="text-right font-display font-bold text-foreground">{r.retained}</td>
                      <td className="pl-3 text-muted-foreground">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Historique */}
      {copilot?.history?.length ? (
        <div className="rounded-lg border border-border bg-card">
          <button onClick={() => setShowHistory((v) => !v)} className="w-full flex items-center justify-between p-3 text-left">
            <span className="flex items-center gap-2 text-sm font-display font-bold text-foreground">
              <History className="w-4 h-4" /> Historique des analyses
            </span>
            {showHistory ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showHistory && (
            <div className="border-t border-border p-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Date</th><th className="text-right">Durée</th><th className="text-right">Pages</th>
                    <th className="text-right">Search Console</th><th className="text-right">Conversions</th>
                    <th className="text-right">Détectées</th><th className="text-right">Nouvelles</th><th className="text-right">MAJ</th><th className="text-right">Obsolètes</th>
                  </tr>
                </thead>
                <tbody>
                  {copilot.history.map((h) => (
                    <tr key={h.id} className="border-t border-border/60">
                      <td className="py-1 text-foreground">{new Date(h.started_at).toLocaleString("fr-CA")}</td>
                      <td className="text-right">{((h.duration_ms ?? 0) / 1000).toFixed(1)} s</td>
                      <td className="text-right">{h.pages_analyzed}</td>
                      <td className="text-right">{h.gsc_rows_analyzed}</td>
                      <td className="text-right">{h.conversions_analyzed}</td>
                      <td className="text-right">{h.opportunities_detected}</td>
                      <td className="text-right">{h.new_count}</td>
                      <td className="text-right">{h.updated_count}</td>
                      <td className="text-right">{h.stale_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Gains & pertes */}
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
