import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";

/* États visuels standards de l'espace entrepreneur :
   chargement, vide, erreur — jamais d'écran blanc ni d'état muet. */

export const LoadingSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-3 animate-pulse" aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-border bg-card p-5">
        <div className="h-4 w-2/3 rounded bg-secondary" />
        <div className="mt-3 h-3 w-1/3 rounded bg-secondary" />
        <div className="mt-2 h-3 w-1/2 rounded bg-secondary" />
      </div>
    ))}
  </div>
);

export const EmptyState = ({
  title,
  message,
  actionLabel,
  actionTo,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}) => (
  <div className="rounded-3xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      <Inbox className="h-7 w-7" />
    </div>
    <h3 className="font-display text-lg font-bold">{title}</h3>
    <p className="mx-auto mt-1.5 max-w-sm font-body text-sm text-muted-foreground">{message}</p>
    {actionLabel && actionTo && (
      <Link
        to={actionTo}
        className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground active:scale-95 transition-transform"
      >
        {actionLabel}
      </Link>
    )}
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground active:scale-95 transition-transform"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const ErrorState = ({
  title = "Un problème est survenu",
  message = "Les données n'ont pas pu être chargées.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) => (
  <div className="rounded-3xl border border-border bg-card px-6 py-12 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
      <AlertTriangle className="h-7 w-7" />
    </div>
    <h3 className="font-display text-lg font-bold">{title}</h3>
    <p className="mx-auto mt-1.5 max-w-sm font-body text-sm text-muted-foreground">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground active:scale-95 transition-transform"
      >
        <RefreshCw className="h-4 w-4" /> Réessayer
      </button>
    )}
  </div>
);

export const StatusBadge = ({ label, tone }: { label: string; tone: "pending" | "active" | "done" | "refused" | "neutral" }) => {
  const tones: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    done: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    refused: "bg-destructive/10 text-destructive",
    neutral: "bg-secondary text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-display font-semibold ${tones[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};

export const SectionHeader = ({ title, action }: { title: ReactNode; action?: ReactNode }) => (
  <div className="mb-3 flex items-end justify-between gap-2">
    <h2 className="font-display text-lg font-bold sm:text-xl">{title}</h2>
    {action}
  </div>
);
