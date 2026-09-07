// ============================================================
// FLUX TEMPS RÉEL DES NOTIFICATIONS CRM
// ------------------------------------------------------------
// Une seule source de vérité : la table `crm_notifications`,
// alimentée par les déclencheurs de la base (leads, soumissions,
// livraisons, paiements, calendrier) et par la surveillance
// planifiée (retards, relances). Aucune logique métier ici.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchNotifications, markAllRead, markRead, setStatus, sortNotifications,
  summarize, type CrmNotification, type NotifStatus,
} from "@/lib/notifications/api";
import { setAppBadge } from "@/lib/notifications/push";

export function useCrmNotifications(enabled = true) {
  const [items, setItems] = useState<CrmNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const rows = await fetchNotifications();
      if (mounted.current) { setItems(rows); setError(null); }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) { setLoading(false); return () => { mounted.current = false; }; }
    reload();
    // Un nom de canal UNIQUE par instance : plusieurs composants peuvent utiliser
    // ce hook en même temps (cloche, page notifications, admin). Réutiliser le même
    // nom faisait planter l'application ("callbacks after subscribe()").
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`crm-notifications-live-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "crm_notifications" }, () => reload())
        .subscribe();
    } catch (e) {
      // Le temps réel est un confort : son échec ne doit jamais casser l'écran.
      console.warn("Temps réel des notifications indisponible", e);
    }
    // Filet de sécurité : rafraîchissement périodique si le socket tombe.
    const timer = window.setInterval(reload, 60_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, reload]);


  const sorted = useMemo(() => sortNotifications(items), [items]);
  const stats = useMemo(() => summarize(items), [items]);

  // Pastille sur l'icône de l'application installée (iOS 16.4+).
  useEffect(() => { if (enabled) setAppBadge(stats.unread); }, [enabled, stats.unread]);

  const actions = useMemo(() => ({
    async read(id: string) {
      setItems((p) => p.map((n) => (n.id === id && n.status === "unread"
        ? { ...n, status: "read" as NotifStatus, read_at: new Date().toISOString() } : n)));
      await markRead(id).catch(() => reload());
    },
    async readAll() {
      const ids = items.filter((n) => n.status === "unread").map((n) => n.id);
      setItems((p) => p.map((n) => (n.status === "unread" ? { ...n, status: "read" as NotifStatus } : n)));
      await markAllRead(ids).catch(() => reload());
    },
    async change(id: string, status: NotifStatus) {
      setItems((p) => p.map((n) => (n.id === id ? { ...n, status } : n)));
      await setStatus(id, status).catch(() => reload());
    },
  }), [items, reload]);

  return { items: sorted, raw: items, stats, loading, error, reload, ...actions };
}
