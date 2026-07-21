import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

export default function QaReportBadge({
  score,
  blockers,
  checkedAt,
}: {
  score?: number | null;
  blockers?: string[] | null;
  checkedAt?: string | null;
}) {
  if (score == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
        QA —
      </span>
    );
  }
  const hasBlocker = (blockers?.length ?? 0) > 0;
  const tone =
    hasBlocker
      ? "border-red-500/40 bg-red-500/10 text-red-600"
      : score >= 90
      ? "border-primary/40 bg-primary/10 text-primary"
      : score >= 75
      ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
      : "border-red-500/40 bg-red-500/10 text-red-600";
  const Icon = hasBlocker ? ShieldAlert : score >= 90 ? CheckCircle2 : AlertTriangle;
  const title = [
    `Score QA ${score}/100`,
    checkedAt ? `vérifié ${new Date(checkedAt).toLocaleString("fr-CA")}` : null,
    hasBlocker ? `Bloqueurs :\n- ${blockers!.join("\n- ")}` : null,
  ].filter(Boolean).join(" • ");
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <Icon className="w-3 h-3" /> QA {score}
    </span>
  );
}