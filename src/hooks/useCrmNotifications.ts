// ============================================================
// FLUX TEMPS RÉEL DES NOTIFICATIONS CRM
// ------------------------------------------------------------
// Une seule source de vérité : la table `crm_notifications`,
// alimentée par les déclencheurs de la base. Aucune logique métier ici.
//
// Performance : un SEUL abonnement et un SEUL chargement partagés entre
// toutes les instances (cloche, page notifications, admin). Les rafales
// d'événements temps réel sont regroupées (une relecture au plus toutes
// les ~0,8 s) et la relecture périodique est suspendue quand l'onglet est caché.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchNotifications, markAllRead, markRead, setStatus, sortNotifications,
  summarize, type CrmNotification, type NotifStatus,
} from "@/lib/notifications/api";
import { setAppBadge } from "@/lib/notifications/push";

type Snapshot = { items: CrmNotification[]; loading: boolean; error: string | null };
let snap: Snapshot = { items: [], loading: true, error: null };
const listeners = new Set<(s: Snapshot) => void>();
let users = 0;
let channel: ReturnType<typeof supabase.channel> | null = null;
let timer: number | null = null;
let debounce: number | null = null;
let inflight: Promise<void> | null = null;
let again = false;

function emit(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l(snap));
}

async function reloadNow(): Promise<void> {
  if (inflight) { again = true; return inflight; }
  inflight = (async () => {
    try { emit({ items: await fetchNotifications(), error: null, loading: false }); }
    catch (e) { emit({ error: (e as Error).message, loading: false }); }
  })().finally(() => {
    inflight = null;
    if (again) { again = false; void reloadNow(); }
  });
  return inflight;
}

function scheduleReload() {
  if (debounce) window.clearTimeout(debounce);
  debounce = window.setTimeout(() => { debounce = null; void reloadNow(); }, 800);
}

function onVisible() { if (document.visibilityState === "visible") scheduleReload(); }

function start() {
  void reloadNow();
  try {
    channel = supabase
      .channel(`crm-notifications-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_notifications" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_followups" }, scheduleReload)
      .subscribe();
  } catch (e) {
    console.warn("Temps réel des notifications indisponible", e);
  }
  // Filet de sécurité si le socket tombe; inutile quand l'onglet est caché.
  timer = window.setInterval(() => { if (document.visibilityState === "visible") void reloadNow(); }, 60_000);
  document.addEventListener("visibilitychange", onVisible);
}

function stop() {
  if (timer) window.clearInterval(timer);
  if (debounce) window.clearTimeout(debounce);
  timer = debounce = null;
  if (channel) supabase.removeChannel(channel);
  channel = null;
  document.removeEventListener("visibilitychange", onVisible);
}

export function useCrmNotifications(enabled = true) {
  const [state, setState] = useState<Snapshot>(snap);

  useEffect(() => {
    if (!enabled) { setState((s) => ({ ...s, loading: false })); return; }
    listeners.add(setState);
    setState(snap);
    if (users++ === 0) start();
    return () => {
      listeners.delete(setState);
      if (--users === 0) stop();
    };
  }, [enabled]);

  const reload = useCallback(async () => { if (enabled) await reloadNow(); }, [enabled]);
  const items = state.items;
  const setItems = (fn: (p: CrmNotification[]) => CrmNotification[]) => emit({ items: fn(snap.items) });

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
      const ids = snap.items.filter((n) => n.status === "unread").map((n) => n.id);
      setItems((p) => p.map((n) => (n.status === "unread" ? { ...n, status: "read" as NotifStatus } : n)));
      await markAllRead(ids).catch(() => reload());
    },
    async change(id: string, status: NotifStatus) {
      setItems((p) => p.map((n) => (n.id === id ? { ...n, status } : n)));
      await setStatus(id, status).catch(() => reload());
    },
  }), [reload]);

  return { items: sorted, raw: items, stats, loading: enabled ? state.loading : false, error: state.error, reload, ...actions };
}
