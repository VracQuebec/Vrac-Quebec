// ============================================================
// AVIS DE L'ESPACE ENTREPRENEUR
// ------------------------------------------------------------
// Source unique : `mkt_notifications`, filtrée par les règles
// d'accès existantes (un entrepreneur ne voit que ses avis).
// Temps réel réutilisé (Realtime Supabase), aucun système parallèle.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchNotifications,
  markNotificationRead,
  type MktNotification,
} from "@/lib/marketplace/api";

export function useEntrepreneurNotifications(enabled = true) {
  const [items, setItems] = useState<MktNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const rows = await fetchNotifications(50);
      if (mounted.current) {
        setItems(rows);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        mounted.current = false;
      };
    }
    void reload();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`entr-notifications-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "mkt_notifications" },
          () => void reload(),
        )
        .subscribe();
    } catch (e) {
      // Le temps réel est un confort : son échec ne doit jamais casser l'écran.
      console.warn("Temps réel des avis indisponible", e);
    }
    const timer = window.setInterval(() => void reload(), 60_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, reload]);

  const unread = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const read = useCallback(async (id: string) => {
    setItems((p) =>
      p.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    try {
      await markNotificationRead(id);
    } catch {
      void reload();
    }
  }, [reload]);

  return { items, unread, loading, error, reload, read };
}
