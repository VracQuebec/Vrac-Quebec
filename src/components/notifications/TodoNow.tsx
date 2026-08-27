import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { useCrmNotifications } from "@/hooks/useCrmNotifications";
import { isOverdue, isToday } from "@/lib/notifications/api";
import NotificationItem from "./NotificationItem";

/**
 * Widget « À faire maintenant » : les priorités du jour calculées
 * à partir des notifications ouvertes. Il ne crée aucune donnée,
 * il met simplement en avant ce qui bloque la journée.
 */
const TodoNow = ({ limit = 5 }: { limit?: number }) => {
  const { items, stats, loading, read, change } = useCrmNotifications(true);

  const priority = items
    .filter((n) => ["unread", "read", "in_progress"].includes(n.status))
    .filter((n) => n.priority === "urgente" || isOverdue(n) || isToday(n))
    .slice(0, limit);

  if (loading || (priority.length === 0 && stats.total === 0)) return null;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h2 className="flex items-center gap-2 font-display font-bold text-base sm:text-lg">
          <AlertTriangle className="w-4 h-4 text-primary" /> À faire maintenant
        </h2>
        <Link to="/admin/notifications" className="inline-flex items-center gap-1 text-xs font-display font-bold text-primary">
          Tout voir <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Stat label="Urgentes" value={stats.urgent} tone="danger" />
        <Stat label="En retard" value={stats.overdue} tone="danger" />
        <Stat label="Aujourd'hui" value={stats.today} tone="normal" />
        <Stat label="À traiter" value={stats.total} tone="normal" />
      </div>

      {priority.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body">
          Aucune priorité immédiate. {stats.total} élément(s) en attente dans le centre de notifications.
        </p>
      ) : (
        <div className="space-y-2">
          {priority.map((n) => (
            <NotificationItem key={n.id} n={n} onRead={read} onChange={change} compact />
          ))}
        </div>
      )}
    </section>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone: "danger" | "normal" }) => (
  <div
    className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold inline-flex items-center gap-1.5 ${
      tone === "danger" && value > 0
        ? "bg-destructive/10 text-destructive"
        : "bg-secondary text-foreground"
    }`}
  >
    <Clock className="w-3.5 h-3.5 opacity-70" /> {label} · {value}
  </div>
);

export default TodoNow;
