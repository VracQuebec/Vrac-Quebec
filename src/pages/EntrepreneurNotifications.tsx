// ============================================================
// CENTRE D'ACTIVITÉ de l'espace entrepreneur.
// Chaque avis répond à : quoi ? quel contexte ? quand ? quoi faire ?
// Données existantes uniquement (mkt_notifications) : aucun champ inventé.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/entrepreneur-app/AppStates";
import { AppCard } from "@/components/entrepreneur-app/ui";
import { markNotificationRead, type MktNotification } from "@/lib/marketplace/api";
import { useEntrepreneurNotifications } from "@/hooks/useEntrepreneurNotifications";
import { useToast } from "@/hooks/use-toast";
import { CheckCheck, ChevronRight, Bell, Truck, ClipboardList, MapPin, AlertTriangle } from "lucide-react";

/** Depuis quand ? Formulation courte, comme une application mobile. */
const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `Il y a ${d} j` : new Date(iso).toLocaleDateString("fr-CA");
};

/** Icône + libellé d'action déduits du lien réel de l'avis. */
const kindOf = (n: MktNotification) => {
  const link = n.link ?? "";
  if (link.includes("transport")) return { icon: Truck, action: "Voir le suivi" };
  if (link.includes("carte") || link.includes("dompe") || link.includes("site"))
    return { icon: MapPin, action: "Voir le site" };
  if (link) return { icon: ClipboardList, action: "Voir la demande" };
  return { icon: Bell, action: "" };
};

const dossierLink = (link: string | null) => {
  if (!link) return null;
  try {
    const url = new URL(link, window.location.origin);
    const id = url.searchParams.get("demande");
    return id && url.pathname === "/entrepreneur/demandes" ? `/entrepreneur/demandes/${id}` : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return link;
  }
};

export default function EntrepreneurNotifications() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<"unread" | "all">("unread");
  // Flux partagé avec la cloche : mise à jour automatique (temps réel existant).
  const { items: rows, loading, error, reload, read } = useEntrepreneurNotifications(true);
  const failed = Boolean(error);
  const load = reload;

  const unread = rows.filter((r) => !r.read_at);
  const visible = useMemo(() => (tab === "unread" ? unread : rows), [tab, rows, unread]);

  const open = async (n: MktNotification) => {
    if (!n.read_at) await read(n.id);
    const link = dossierLink(n.link);
    if (link) navigate(link);
  };

  const readAll = async () => {
    const ids = unread.map((n) => n.id);
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((id) => markNotificationRead(id)));
    await reload();
    toast({ title: "Tout est marqué comme lu" });
  };

  return (
    <EntrepreneurAppShell
      title="Notifications"
      subtitle={unread.length > 0 ? `${unread.length} non lue${unread.length > 1 ? "s" : ""}` : "Tout est lu"}
      backTo="/entrepreneur"
      headerActions={
        <button
          onClick={readAll}
          disabled={unread.length === 0}
          aria-label="Tout marquer comme lu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-secondary disabled:opacity-40"
        >
          <CheckCheck className="h-5 w-5" />
        </button>
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 space-y-4">
        {/* Segments Non lues / Toutes */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1">
          {([["unread", `Non lues${unread.length ? ` (${unread.length})` : ""}`], ["all", "Toutes"]] as const).map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`min-h-11 rounded-xl font-display text-sm font-bold transition-colors ${
                  tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>

        {loading ? (
          <LoadingSkeleton lines={3} />
        ) : failed ? (
          <ErrorState message="Vos avis n'ont pas pu être chargés." onRetry={load} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={tab === "unread" ? "Tout est à jour" : "Aucun avis"}
            message={
              tab === "unread"
                ? "Vous n'avez aucun avis en attente. Nous vous préviendrons dès qu'il se passe quelque chose."
                : "Vos avis apparaîtront ici dès qu'une demande évolue."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visible.map((n) => {
              const { icon: Icon, action } = kindOf(n);
              const isUrgent = n.level === "urgent" || n.level === "critique";
              return (
                <AppCard
                  key={n.id}
                  onClick={() => void open(n)}
                  accent={!n.read_at ? (isUrgent ? "destructive" : "primary") : undefined}
                  className={n.read_at ? "opacity-80" : ""}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isUrgent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                      }`}
                    >
                      {isUrgent ? <AlertTriangle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        <p className={`min-w-0 font-display text-sm ${n.read_at ? "font-semibold" : "font-bold"}`}>
                          {n.title}
                        </p>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 font-body text-xs text-muted-foreground">{n.body}</p>
                      )}
                      <p className="mt-1 font-body text-[11px] text-muted-foreground">{ago(n.created_at)}</p>
                      {n.link && (
                        <p className="mt-2 inline-flex items-center gap-1 font-display text-xs font-bold text-primary">
                          {action} <ChevronRight className="h-3.5 w-3.5" />
                        </p>
                      )}
                    </div>
                  </div>
                </AppCard>
              );
            })}
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}
