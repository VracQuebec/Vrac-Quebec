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
    const channel = supabase
      .channel("crm-notifications-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_notifications" }, () => reload())
      .subscribe();
    // Filet de sécurité : rafraîchissement périodique si le socket tombe.
    const timer = window.setInterval(reload, 60_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
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
