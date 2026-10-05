import { Link } from "react-router-dom";
import { useState } from "react";
import { Check, ChevronDown, CircleDot, ExternalLink, X } from "lucide-react";
import {
  DISPLAY_CATEGORY_ICONS, DISPLAY_CATEGORY_LABELS, displayCategory, formatWhen, isOverdue,
  type CrmNotification, type NotifStatus,
} from "@/lib/notifications/api";
import { Button } from "@/components/ui/button";

interface Props {
  n: CrmNotification;
  onRead: (id: string) => void;
  onChange: (id: string, status: NotifStatus) => void;
  onNavigate?: () => void;
  compact?: boolean;
  activityCount?: number;
  activities?: CrmNotification[];
}

/** Ligne de notification compacte : contexte complet + action directe vers l'élément. */
const NotificationItem = ({ n, onRead, onChange, onNavigate, compact, activityCount = 1, activities = [] }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const unread = n.status === "unread";
  const late = isOverdue(n);
  const done = n.status === "done" || n.status === "archived";
  const category = displayCategory(n);
  const urgent = !done && n.priority === "urgente";
  const actionable = !done && (n.status === "in_progress" || n.priority === "importante" || late);

  return (
    <div
      className={`rounded-lg border px-3 py-3 transition-colors ${
        done ? "border-border bg-background opacity-60"
          : urgent ? "border-destructive/50 bg-destructive/5"
          : actionable ? "border-border bg-secondary/40"
          : unread ? "border-primary/30 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-sm">{DISPLAY_CATEGORY_ICONS[category]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap leading-tight">
            {urgent && <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">URGENT</span>}
            {actionable && !urgent && <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background">À traiter</span>}
            <span className="text-[10px] uppercase font-display font-bold text-muted-foreground">
              {DISPLAY_CATEGORY_LABELS[category]}
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
            {activityCount > 1 && <span className="text-[10px] text-muted-foreground">{activityCount} activités</span>}
            {unread && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRead(n.id)}
                className="ml-auto min-h-9 px-2 text-xs text-muted-foreground"
              >
                <X className="w-3 h-3" /> Marquer lue
              </Button>
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
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onChange(n.id, n.status === "in_progress" ? "read" : "in_progress")}
                  className="min-h-11 min-w-0 text-xs sm:flex-none"
                >
                  <CircleDot className="w-3 h-3 shrink-0" />
                  <span className="truncate">{n.status === "in_progress" ? "Mettre en attente" : "Je m'en occupe"}</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onChange(n.id, "done")}
                  className="min-h-11 min-w-0 text-xs sm:flex-none"
                >
                  <Check className="w-3 h-3 shrink-0" /> Traité
                </Button>
              </>
            )}
            {done && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onChange(n.id, "read")}
                className="min-h-11 text-xs sm:flex-none"
              >
                Rouvrir
              </Button>
            )}
          </div>
          {activities.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 min-h-11 w-full justify-between px-2 text-xs"
            >
              Voir les {activities.length} activités
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {activities.slice(1).map((activity) => (
            <NotificationItem
              key={activity.id}
              n={activity}
              onRead={onRead}
              onChange={onChange}
              onNavigate={onNavigate}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationItem;
