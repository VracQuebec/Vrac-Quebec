// ============================================================
// NOTIFICATIONS PUSH iPhone / iPad / Bureau (Web Push)
// ------------------------------------------------------------
// iOS n'autorise le Push que lorsque l'application est installée
// sur l'écran d'accueil : ces helpers détectent le contexte et
// guident l'utilisateur au lieu d'échouer silencieusement.
// Le service worker `/push-sw.js` ne gère QUE le push (pas de
// cache hors ligne, pas d'interception de navigation).
// ============================================================
import { supabase } from "@/integrations/supabase/client";

const SW_URL = "/push-sw.js";

export type PushState =
  | "unsupported"        // navigateur sans Push API
  | "needs_install"      // iOS : doit d'abord être ajouté à l'écran d'accueil
  | "denied"             // autorisation refusée dans les réglages
  | "not_subscribed"     // possible, pas encore activé
  | "subscribed";        // actif

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && (navigator as never as { maxTouchPoints: number }).maxTouchPoints > 1);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function pushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? "needs_install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : "not_subscribed";
  } catch {
    return "not_subscribed";
  }
}

async function publicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("crm-push-dispatch", {
    body: { action: "config" },
  });
  if (error) throw new Error("Configuration push indisponible");
  const key = (data as { publicKey?: string })?.publicKey;
  if (!key) throw new Error("Clé de notification absente");
  return key;
}

/** Active les notifications sur cet appareil et enregistre l'abonnement. */
export async function enablePush(categories: Record<string, boolean>) {
  if (!pushSupported()) {
    throw new Error(
      isIos()
        ? "Ajoutez d'abord Vrac Québec à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis rouvrez l'app."
        : "Ce navigateur ne prend pas en charge les notifications push.",
    );
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications refusées. Réglages iOS → Notifications → Vrac Québec → Autoriser.");
  }

  const reg = await getRegistration();
  await navigator.serviceWorker.ready;
  const key = await publicKey();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Session expirée");

  const ua = navigator.userAgent.slice(0, 300);
  const { error } = await supabase.from("crm_push_subscriptions").upsert({
    user_id: auth.user.id,
    endpoint: raw.endpoint!,
    p256dh: raw.keys!.p256dh!,
    auth: raw.keys!.auth!,
    user_agent: ua,
    label: deviceName({ label: null, user_agent: ua }),
    categories,
    is_enabled: true,
  } as never, { onConflict: "endpoint" });
  if (error) throw error;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("crm_push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function updatePushCategories(categories: Record<string, boolean>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("crm_push_subscriptions")
    .update({ categories }).eq("user_id", auth.user.id);
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke("crm-push-dispatch", {
    body: { action: "test" },
  });
  if (error) throw error;
  return data as { sent: number; devices: number };
}

/** Test personnel (comptes de test seulement) : texte fixe, vers ses propres appareils. */
export async function sendSelfTestPush() {
  const { data, error } = await supabase.functions.invoke("crm-push-dispatch", {
    body: { action: "self_test" },
  });
  if (error) throw error;
  return data as { sent: number; devices: number; errors: string[] };
}

/** Badge sur l'icône de la Web App (iOS 16.4+ / Chrome). */
export async function setAppBadge(count: number) {
  try {
    const nav = navigator as unknown as {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0 && nav.setAppBadge) await nav.setAppBadge(count);
    else if (nav.clearAppBadge) await nav.clearAppBadge();
  } catch { /* non supporté : sans effet */ }
}

/* ------------------------------------------------------------
   APPAREILS ENREGISTRÉS (lecture seule + activation/désactivation)
   Aucune suppression automatique : un appareil inactif reste listé.
------------------------------------------------------------ */

export interface PushDevice {
  id: string;
  endpoint: string;
  label: string | null;
  user_agent: string | null;
  is_enabled: boolean;
  last_success_at: string | null;
  last_test_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Endpoint de l'abonnement de CET appareil (null si non inscrit). */
export async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function listDevices(): Promise<PushDevice[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("crm_push_subscriptions")
    .select("id, endpoint, label, user_agent, is_enabled, last_success_at, last_test_at, last_error, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PushDevice[];
}

export async function setDeviceEnabled(id: string, enabled: boolean) {
  const { error } = await supabase
    .from("crm_push_subscriptions")
    .update({ is_enabled: enabled })
    .eq("id", id);
  if (error) throw error;
}

/** Nom lisible de l'appareil déduit de son user-agent. */
export function deviceName(d: Pick<PushDevice, "label" | "user_agent">) {
  if (d.label) return d.label;
  const ua = d.user_agent ?? "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Appareil Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "PC Windows";
  return "Appareil";
}
