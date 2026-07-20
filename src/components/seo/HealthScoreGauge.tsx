export default function HealthScoreGauge({ score, label }: { score: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = clamped >= 80 ? "text-primary" : clamped >= 60 ? "text-amber-500" : "text-red-500";
  const bar = clamped >= 80 ? "bg-primary" : clamped >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase font-display tracking-wide">{label ?? "Score SEO global"}</div>
          <div className={`text-5xl font-display font-bold ${color}`}>{clamped}<span className="text-xl text-muted-foreground">/100</span></div>
        </div>
      </div>
      <div className="w-full h-2 bg-secondary rounded overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}