import { Link } from "react-router-dom";
import { Check, CircleDot, ExternalLink, X } from "lucide-react";
import {
  CATEGORY_ICONS, CATEGORY_LABELS, PRIORITY_DOT, formatWhen, isOverdue,
  type CrmNotification, type NotifStatus,
} from "@/lib/notifications/api";

interface Props {
  n: CrmNotification;
  onRead: (id: string) => void;
  onChange: (id: string, status: NotifStatus) => void;
  onNavigate?: () => void;
  compact?: boolean;
}

/** Ligne de notification compacte : contexte complet + action directe vers l'élément. */
const NotificationItem = ({ n, onRead, onChange, onNavigate, compact }: Props) => {
  const unread = n.status === "unread";
  const late = isOverdue(n);
  const done = n.status === "done" || n.status === "archived";

  return (
    <div
      className={`rounded-lg border px-2.5 py-2 transition-colors ${
        done ? "border-border bg-background opacity-60"
          : unread ? "border-primary/40 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-none mt-0.5">{CATEGORY_ICONS[n.category] ?? "🔔"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap leading-tight">
            <span className="text-[10px]" aria-hidden>{PRIORITY_DOT[n.priority]}</span>
            <span className="text-[9px] uppercase tracking-wide font-display font-bold text-muted-foreground">
              {CATEGORY_LABELS[n.category] ?? n.category}
            </span>
            {late && (
              <span className="text-[9px] font-display font-bold px-1 py-px rounded bg-destructive/10 text-destructive">
                En retard
              </span>
            )}
            {n.status === "in_progress" && (
              <span className="text-[9px] font-display font-bold px-1 py-px rounded bg-primary/10 text-primary">
                En cours
              </span>
            )}
            {unread && (
              <button
                onClick={() => onRead(n.id)}
                className="ml-auto inline-flex min-h-11 items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground font-display"
              >
                <X className="w-3 h-3" /> Marquer lue
              </button>
            )}
          </div>

          <div className={`text-[13px] font-display leading-snug ${unread ? "font-bold" : "font-semibold"} text-foreground mt-0.5`}>
            {n.title}
          </div>
          {n.body && !compact && (
            <p className="text-[11px] text-muted-foreground font-body mt-0.5 leading-snug line-clamp-2 whitespace-pre-line">{n.body}</p>
          )}

          <div className="flex items-center gap-x-1.5 flex-wrap text-[10px] text-muted-foreground font-body mt-0.5 leading-snug">
            {n.lead_number && <span className="font-semibold text-foreground">{n.lead_number}</span>}
            {n.client_name && <span>{n.client_name}</span>}
            <span>{formatWhen(n.created_at)}</span>
            {n.due_at && <span>· échéance {formatWhen(n.due_at)}</span>}
          </div>

          {/* Actions : jamais coupées — elles passent à la ligne et occupent
              toute la largeur disponible sur les petits écrans. */}
          <div className="mt-2 grid grid-cols-1 gap-1.5 min-[390px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-stretch">
            {n.action_url && (
              <Link
                to={n.action_url}
                onClick={() => { onRead(n.id); onNavigate?.(); }}
                className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-display font-bold text-primary-foreground min-[390px]:col-span-2 sm:flex-none"
              >
                Ouvrir <ExternalLink className="w-3 h-3" />
              </Link>
            )}
            {!done && (
              <>
                <button
                  onClick={() => onChange(n.id, n.status === "in_progress" ? "read" : "in_progress")}
                  className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md bg-secondary px-3 py-2 text-xs font-display font-semibold text-foreground sm:flex-none"
                >
                  <CircleDot className="w-3 h-3 shrink-0" />
                  <span className="truncate">{n.status === "in_progress" ? "Mettre en attente" : "Je m'en occupe"}</span>
                </button>
                <button
                  onClick={() => onChange(n.id, "done")}
                  className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md bg-secondary px-3 py-2 text-xs font-display font-semibold text-foreground sm:flex-none"
                >
                  <Check className="w-3 h-3 shrink-0" /> Traité
                </button>
              </>
            )}
            {done && (
              <button
                onClick={() => onChange(n.id, "read")}
                className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md bg-secondary px-3 py-2 text-xs font-display font-semibold text-foreground sm:flex-none"
              >
                Rouvrir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationItem;
