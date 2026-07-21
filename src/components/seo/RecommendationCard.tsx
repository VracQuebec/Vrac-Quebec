import { Loader2, CheckCircle2, X, ExternalLink } from "lucide-react";
import { useState } from "react";

export type Reco = {
  id: string;
  reco_type: string;
  entity_type: string;
  entity_slug: string | null;
  page_id: string | null;
  blog_post_id: string | null;
  priority: number;
  impact_estimate: number;
  effort_estimate: number;
  title: string;
  rationale: string | null;
  action_type: string;
  payload: Record<string, unknown>;
  status: string;
};

const TYPE_LABELS: Record<string, string> = {
  thin_content: "Contenu insuffisant",
  quick_win_gsc: "Quick win Google",
  low_ctr: "CTR faible",
  missing_internal_links: "Liens internes",
  not_indexed: "Non indexée",
  missing_city_page: "Page manquante",
  missing_service_content: "Service à couvrir",
  stale_blog: "Article à rafraîchir",
  smart_new_page: "Nouvelle page suggérée",
  smart_new_service_page: "Nouveau service suggéré",
};

function priorityColor(p: number) {
  return p >= 5 ? "bg-red-500/10 text-red-600 border-red-300"
    : p === 4 ? "bg-orange-500/10 text-orange-600 border-orange-300"
    : p === 3 ? "bg-amber-500/10 text-amber-600 border-amber-300"
    : "bg-secondary text-muted-foreground border-border";
}

export default function RecommendationCard({
  reco, onApply, onDismiss, onOpen,
}: {
  reco: Reco;
  onApply: (reco: Reco) => Promise<void>;
  onDismiss: (reco: Reco) => Promise<void>;
  onOpen?: (reco: Reco) => void;
}) {
  const [busy, setBusy] = useState<"apply" | "dismiss" | null>(null);
  const impactRatio = reco.impact_estimate / Math.max(1, reco.effort_estimate);
  return (
    <div className="border border-border rounded-lg p-4 bg-card hover:border-primary/40 transition">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded border ${priorityColor(reco.priority)}`}>P{reco.priority}</span>
        <span className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">
          {TYPE_LABELS[reco.reco_type] ?? reco.reco_type}
        </span>
        <span className="text-[10px] text-muted-foreground">
          Impact {reco.impact_estimate} · Effort {reco.effort_estimate} · Ratio {impactRatio.toFixed(1)}
        </span>
      </div>
      <h4 className="font-display font-semibold text-sm text-foreground mb-1">{reco.title}</h4>
      {reco.rationale && <p className="text-xs text-muted-foreground mb-3">{reco.rationale}</p>}
      {(() => {
        const p = reco.payload as {
          potential?: number; traffic_estimate_monthly?: number; difficulty?: number;
          estimated_time_minutes?: number; cannibalization_risk?: number; reason?: string;
        };
        if (!p) return null;
        const hasSmart = p.potential != null || p.traffic_estimate_monthly != null || p.difficulty != null;
        if (!hasSmart) return null;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-3">
            {p.potential != null && <SmartStat label="Potentiel" value={`${p.potential}/100`} tone="primary" />}
            {p.traffic_estimate_monthly != null && <SmartStat label="Trafic est." value={`~${p.traffic_estimate_monthly}/mois`} />}
            {p.difficulty != null && <SmartStat label="Difficulté" value={`${p.difficulty}/100`} tone={p.difficulty > 70 ? "warn" : undefined} />}
            {p.estimated_time_minutes != null && <SmartStat label="Temps" value={`${p.estimated_time_minutes} min`} />}
          </div>
        );
      })()}
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy !== null}
          onClick={async () => { setBusy("apply"); try { await onApply(reco); } finally { setBusy(null); } }}
          className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-display font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
          {busy === "apply" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Appliquer
        </button>
        <button type="button" disabled={busy !== null}
          onClick={async () => { setBusy("dismiss"); try { await onDismiss(reco); } finally { setBusy(null); } }}
          className="text-xs border border-border px-3 py-1.5 rounded text-muted-foreground hover:text-foreground flex items-center gap-1">
          <X className="w-3 h-3" /> Ignorer
        </button>
        {onOpen && reco.entity_slug && (
          <button type="button" onClick={() => onOpen(reco)}
            className="text-xs border border-border px-3 py-1.5 rounded text-muted-foreground hover:text-foreground flex items-center gap-1 ml-auto">
            <ExternalLink className="w-3 h-3" /> Ouvrir
          </button>
        )}
      </div>
    </div>
  );
}

function SmartStat({ label, value, tone }: { label: string; value: string; tone?: "primary" | "warn" }) {
  const color = tone === "primary" ? "text-primary" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded border border-border px-2 py-1 bg-background">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xs font-display font-bold ${color}`}>{value}</div>
    </div>
  );
}