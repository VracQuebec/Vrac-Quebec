import { Button } from "@/components/ui/button";
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";

/* États visuels standards de l'espace entrepreneur :
   chargement, vide, erreur — jamais d'écran blanc ni d'état muet. */

export const LoadingSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-3 animate-pulse" aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="rounded-lg border border-border bg-card p-5">
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
  <div className="rounded-lg border border-dashed border-border bg-card/60 px-5 py-7 text-center">
    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Inbox className="h-5 w-5" />
    </div>
    <h3 className="font-display text-base font-bold">{title}</h3>
    <p className="mx-auto mt-1 max-w-xs font-body text-sm text-muted-foreground">{message}</p>
    {actionLabel && actionTo && (
      <Link
        to={actionTo}
        className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground active:scale-95 transition-transform"
      >
        {actionLabel}
      </Link>
    )}
    {actionLabel && onAction && (
      <Button
        onClick={onAction}
        className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground active:scale-95 transition-transform"
      >
        {actionLabel}
      </Button>
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
  <div className="rounded-lg border border-border bg-card px-4 py-6 text-center">
    <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
      <AlertTriangle className="h-5 w-5" />
    </div>
    <h3 className="font-display text-base font-semibold">{title}</h3>
    <p className="mx-auto mt-1.5 max-w-sm font-body text-sm text-muted-foreground">{message}</p>
    {onRetry && (
      <Button
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground active:scale-95 transition-transform"
      >
        <RefreshCw className="h-4 w-4" /> Réessayer
      </Button>
    )}
  </div>
);

export const StatusBadge = ({ label, tone }: { label: string; tone: "pending" | "active" | "done" | "refused" | "neutral" }) => {
  const tones: Record<string, string> = {
    pending: "text-attention",
    active: "text-success",
    done: "text-muted-foreground",
    refused: "text-destructive",
    neutral: "text-muted-foreground",
  };
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 py-0.5 text-[11px] font-body font-medium leading-snug ${tones[tone]}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </span>
  );
};

export const SectionHeader = ({ title, action }: { title: ReactNode; action?: ReactNode }) => (
  <div className="mb-3 flex items-end justify-between gap-2">
    <h2 className="font-display text-base font-semibold sm:text-xl">{title}</h2>
    {action}
  </div>
);
