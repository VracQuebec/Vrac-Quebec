import { Target } from "lucide-react";

export type Goal = {
  id: string; label: string; metric_type: string;
  target_value: number; current_value: number;
  keyword: string | null; deadline: string | null;
  active: boolean; last_refreshed_at: string | null;
};

function format(metric: string, v: number): string {
  if (metric === "avg_ctr") return `${(v * 100).toFixed(2)}%`;
  if (metric === "avg_seo_score") return v.toFixed(1);
  if (metric === "keyword_rank") return v >= 100 ? "hors top 100" : `#${v.toFixed(1)}`;
  return Math.round(v).toLocaleString("fr-CA");
}

export default function GoalCard({ goal, onEdit, onDelete }: { goal: Goal; onEdit?: () => void; onDelete?: () => void }) {
  const inverse = goal.metric_type === "keyword_rank";
  const raw = inverse
    ? Math.max(0, 100 - (goal.current_value ?? 100)) / Math.max(1, 100 - goal.target_value)
    : goal.current_value / Math.max(1, goal.target_value);
  const pct = Math.max(0, Math.min(100, raw * 100));
  const color = pct >= 100 ? "bg-primary" : pct >= 60 ? "bg-amber-500" : "bg-muted-foreground/50";
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Target className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-display font-semibold text-sm text-foreground truncate">{goal.label}</div>
            <div className="flex items-center gap-1">
              {onEdit && <button type="button" onClick={onEdit} className="text-[10px] text-muted-foreground hover:text-foreground">Éditer</button>}
              {onDelete && <button type="button" onClick={onDelete} className="text-[10px] text-muted-foreground hover:text-red-500">Supprimer</button>}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            {format(goal.metric_type, goal.current_value)} / {format(goal.metric_type, goal.target_value)}
            {" · "}{Math.round(pct)}%
          </div>
          <div className="w-full h-1.5 bg-secondary rounded overflow-hidden">
            <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          {goal.last_refreshed_at && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Màj : {new Date(goal.last_refreshed_at).toLocaleDateString("fr-CA")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}