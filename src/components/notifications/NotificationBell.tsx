import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCrmNotifications } from "@/hooks/useCrmNotifications";
import { useCrmAlertsEnabled } from "@/hooks/useNotificationsEnabled";
import { FILTER_LABELS, groupNotifications, matchesFilter, type NotifFilter } from "@/lib/notifications/api";
import NotificationItem from "./NotificationItem";
import { Button } from "@/components/ui/button";

const QUICK_FILTERS: NotifFilter[] = ["all", "urgent", "todo", "unread"];

/** Cloche du CRM : compteur temps réel + panneau d'actions rapides. */
const NotificationBell = ({ className = "" }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotifFilter>("todo");
  const location = useLocation();
  const alertsEnabled = useCrmAlertsEnabled();
  const { items, stats, loading, read, change, readAll } = useCrmNotifications(true);

  const visible = groupNotifications(items.filter((n) => matchesFilter(n, filter))).slice(0, 60);
  const badge = alertsEnabled ? stats.unread : 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
         <Button
           type="button"
           variant="ghost"
           size="icon"
          className={`relative flex h-11 w-11 items-center justify-center rounded-md hover:bg-secondary/80 ${className}`}
          aria-label={`Notifications${badge ? ` (${badge} non lues)` : ""}`}
         >
          <Bell className={`w-5 h-5 ${stats.urgent > 0 ? "text-destructive" : "text-foreground"}`} />
          {badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-display font-bold flex items-center justify-center">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
         </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full gap-0 p-0 sm:w-[420px] flex flex-col">
        <SheetTitle className="sr-only">Centre de notifications</SheetTitle>

        <div className="border-b border-border px-4 pb-3 pt-4 pr-14">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-lg">Notifications</h2>
            <div className="flex items-center gap-1">
               <Button
                 type="button"
                 variant="ghost"
                 size="sm"
                onClick={readAll}
                disabled={badge === 0}
                className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-display font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
               >
                <CheckCheck className="w-4 h-4" /> Tout lire
               </Button>
              <Link
                to="/admin/notifications"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-secondary"
                aria-label="Réglages des notifications"
              >
                <Settings2 className="w-4 h-4 text-muted-foreground" />
              </Link>
            </div>
          </div>

           <div className="mt-3 grid grid-cols-3 gap-2 text-center">
             <span className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-2 text-xs"><b className="block text-base text-destructive">{stats.urgent}</b>Urgentes</span>
             <span className="rounded-md border border-border bg-card px-2 py-2 text-xs"><b className="block text-base">{stats.total}</b>À traiter</span>
             <span className="rounded-md border border-border bg-card px-2 py-2 text-xs"><b className="block text-base">{stats.unread}</b>Non lues</span>
          </div>

          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
            {QUICK_FILTERS.map((f) => (
               <Button
                 type="button"
                 variant={filter === f ? "default" : "secondary"}
                 size="sm"
                key={f}
                onClick={() => setFilter(f)}
                 className="shrink-0 min-h-11 text-xs"
              >
                {FILTER_LABELS[f]}
               </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading && <p className="text-sm text-muted-foreground font-body">Chargement…</p>}
          {!loading && visible.length === 0 && (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-display font-bold">Rien à traiter</p>
              <p className="text-xs text-muted-foreground font-body">Tout est à jour dans ce filtre.</p>
            </div>
          )}
           {visible.map((group) => (
            <NotificationItem
               key={group.key}
               n={group.latest}
               activityCount={group.items.length}
                activities={group.items}
              onRead={read}
              onChange={change}
              onNavigate={() => setOpen(false)}
              compact
            />
          ))}
        </div>

        {location.pathname !== "/admin/notifications" && <div className="border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <Link
            to="/admin/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-sm font-display font-bold text-primary"
          >
            Voir le centre de notifications
          </Link>
        </div>}
      </SheetContent>
    </Sheet>
  );
};

export default NotificationBell;
