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

// FIN-06B : rappels financiers « application » lus depuis la source unique
// (fin_reminder_deliveries via fin_my_bell, droits revérifiés au serveur) — aucune 2e file.
const FIN_PREFIX = "fin:";
const KIND: Record<string, string> = { a_venir: "Paiement à venir", retard: "Paiement en retard", renouvellement: "Renouvellement", preavis: "Préavis", piece_manquante: "Pièce justificative manquante", tresorerie: "Manque de trésorerie prévu" };
async function fetchFinanceBell(): Promise<MktNotification[]> {
  const { data, error } = await (supabase as any).rpc("fin_my_bell", { _limit: 30 });
  if (error) return []; // la cloche ne doit jamais casser si les Finances sont indisponibles
  return ((data ?? []) as any[]).map((r) => ({
    id: FIN_PREFIX + r.reminder_id, user_id: null, company_id: r.company_id, audience: "finances", event: "fin_" + r.kind,
    title: `${KIND[r.kind] ?? "Rappel"} — ${r.company_name}`,
    body: r.kind === "tresorerie"
      ? `${r.reason} · ${r.event_date} · scénario : ${r.scenario ?? "base"}${r.partial ? " · prévision partielle" : ""}`
      : `${r.reason} · ${r.event_date}`,
    level: r.kind === "retard" || r.kind === "tresorerie" ? "urgent" : "info",
    request_id: null, link: `/entrepreneur/finances?tab=rappels&company=${r.company_id}&rappel=${r.reminder_id}`,
    channels: ["app"], read_at: r.read_at, created_at: r.created_at,
  }));
}

export function useEntrepreneurNotifications(enabled = true) {
  const [items, setItems] = useState<MktNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const [rows, fin] = await Promise.all([fetchNotifications(50), fetchFinanceBell()]);
      if (mounted.current) {
        setItems([...rows, ...fin].sort((a, b) => b.created_at.localeCompare(a.created_at)));
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
        .on("postgres_changes", { event: "*", schema: "public", table: "fin_reminder_deliveries" }, () => void reload())
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
      if (id.startsWith(FIN_PREFIX)) await (supabase as any).rpc("fin_reminder_mark_read", { _reminder: id.slice(FIN_PREFIX.length) });
      else await markNotificationRead(id);
    } catch {
      void reload();
    }
  }, [reload]);

  return { items, unread, loading, error, reload, read };
}
