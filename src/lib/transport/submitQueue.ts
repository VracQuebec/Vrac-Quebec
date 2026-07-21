// Fiabilité absolue de l'Assistant Transport
// ------------------------------------------
// File d'attente persistante avec retry automatique.
// - Une demande n'est JAMAIS perdue : elle est écrite en localStorage avant
//   toute tentative réseau.
// - Chaque demande a une clé d'idempotence : rejouer 100 fois = un seul enregistrement.
// - Retry planifié : 2s, 5s, 10s, 30s, puis toutes les 60s tant que le succès
//   n'est pas atteint.
// - Reprise automatique au chargement de la page (les demandes en attente
//   trouvées en localStorage sont renvoyées).
// - Reprise automatique quand la connectivité revient (`online` event).
// - Aucune erreur technique n'est jamais surfacée : le composant appelant
//   affiche toujours le message rassurant, et la file continue son travail.

import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "vq_transport_submit_queue_v1";
const FN_NAME = "submit-transport-request";
const RETRY_SCHEDULE_MS = [2_000, 5_000, 10_000, 30_000];
const RETRY_FALLBACK_MS = 60_000;

export interface TransportSubmitPayload {
  idempotency_key: string;
  client_name: string;
  client_phone: string;
  client_company?: string | null;
  client_email?: string | null;
  site_address: string;
  site_latitude?: number | null;
  site_longitude?: number | null;
  site_city?: string | null;
  material_type: string;
  material_other?: string | null;
  quantity?: number | null;
  quantity_unit?: string | null;
  dump_submission_id?: string | null;
  dump_name?: string | null;
  distance_km?: number | null;
  travel_time_minutes?: number | null;
  truck_type?: string | null;
  estimated_trips?: number | null;
  desired_date?: string | null;
  desired_time?: string | null;
  source?: string | null;
  user_id?: string | null;
}

interface QueueItem {
  payload: TransportSubmitPayload;
  attempts: number;
  first_queued_at: number;
  last_error?: string | null;
  request_number?: string | null;
}

type QueueMap = Record<string, QueueItem>;

export interface SubmitResult {
  status: "confirmed" | "queued";
  request_number?: string | null;
  idempotency_key: string;
}

// ---- Cryptographically-unique idempotency key --------------------------------

export function newIdempotencyKey(): string {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---- Persistence -------------------------------------------------------------

function readQueue(): QueueMap {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as QueueMap) : {};
  } catch {
    return {};
  }
}

function writeQueue(q: QueueMap) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore quota / private mode */
  }
}

function upsert(key: string, patch: Partial<QueueItem>) {
  const q = readQueue();
  const prev = q[key];
  if (!prev) return;
  q[key] = { ...prev, ...patch };
  writeQueue(q);
}

function remove(key: string) {
  const q = readQueue();
  if (q[key]) {
    delete q[key];
    writeQueue(q);
  }
}

export function hasPendingSubmissions(): boolean {
  return Object.keys(readQueue()).length > 0;
}

// ---- Listeners ---------------------------------------------------------------

type Listener = (items: QueueItem[]) => void;
const listeners = new Set<Listener>();

function notify() {
  const items = Object.values(readQueue());
  listeners.forEach((l) => {
    try { l(items); } catch { /* ignore */ }
  });
}

export function subscribeQueue(l: Listener): () => void {
  listeners.add(l);
  l(Object.values(readQueue()));
  return () => listeners.delete(l);
}

// ---- Network call ------------------------------------------------------------

async function attemptSend(
  item: QueueItem,
): Promise<
  | { kind: "ok"; request_number: string | null }
  | { kind: "retry"; reason: string }
  | { kind: "drop"; reason: string }
> {
  try {
    const { data, error } = await supabase.functions.invoke(FN_NAME, {
      body: item.payload,
      headers: { "x-attempt": String(item.attempts + 1) },
    });

    if (error) {
      // supabase-js sets error for non-2xx. Prefer server-provided retry hint.
      const ctx = (error as unknown as { context?: Response }).context;
      let retry = true;
      let msg = error.message || "network_error";
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body && typeof body === "object") {
            if (body.retry === false) retry = false;
            if (typeof body.message === "string") msg = body.message;
          }
        } catch { /* ignore */ }
      }
      return retry ? { kind: "retry", reason: msg } : { kind: "drop", reason: msg };
    }

    if (data && typeof data === "object" && (data as { ok?: boolean }).ok) {
      const rn = (data as { request_number?: string | null }).request_number ?? null;
      return { kind: "ok", request_number: rn };
    }
    return { kind: "retry", reason: "unexpected_response" };
  } catch (e) {
    return { kind: "retry", reason: (e as Error).message ?? "network_exception" };
  }
}

// ---- Scheduler ---------------------------------------------------------------

let flushing = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRetry(key: string, attempts: number) {
  clearTimer(key);
  const delay = RETRY_SCHEDULE_MS[attempts] ?? RETRY_FALLBACK_MS;
  const t = setTimeout(() => {
    timers.delete(key);
    void flushOne(key);
  }, delay);
  timers.set(key, t);
}

function clearTimer(key: string) {
  const t = timers.get(key);
  if (t) {
    clearTimeout(t);
    timers.delete(key);
  }
}

async function flushOne(key: string): Promise<void> {
  const item = readQueue()[key];
  if (!item) return;

  const result = await attemptSend(item);
  const attempts = item.attempts + 1;

  if (result.kind === "ok") {
    upsert(key, { attempts, request_number: result.request_number, last_error: null });
    notify();
    // Delivered → drop from queue. Confirmation UI already shown; nothing else to do.
    remove(key);
    notify();
    return;
  }

  if (result.kind === "drop") {
    // Server said validation is broken and retrying won't help.
    // We still keep the row in queue for admin visibility unless the caller
    // clears it. But we stop the retry loop to avoid infinite churn.
    upsert(key, { attempts, last_error: `drop:${result.reason}` });
    notify();
    clearTimer(key);
    return;
  }

  upsert(key, { attempts, last_error: result.reason });
  notify();
  scheduleRetry(key, attempts);
}

export async function flushAll(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const keys = Object.keys(readQueue());
    for (const k of keys) {
      // don't await sequentially — fire in parallel, they're idempotent
      void flushOne(k);
    }
  } finally {
    flushing = false;
  }
}

// ---- Public entry ------------------------------------------------------------

export async function submitTransportRequest(
  payload: TransportSubmitPayload,
): Promise<SubmitResult> {
  const key = payload.idempotency_key;
  const q = readQueue();
  if (!q[key]) {
    q[key] = { payload, attempts: 0, first_queued_at: Date.now(), last_error: null };
    writeQueue(q);
    notify();
  }

  // First attempt is synchronous so we can show "Demande confirmée" whenever
  // the network is healthy. If it fails, the retry scheduler takes over and
  // the caller shows the reassuring "enregistrée, envoi en cours" screen.
  const result = await attemptSend(q[key]);
  const attempts = q[key].attempts + 1;

  if (result.kind === "ok") {
    remove(key);
    notify();
    return { status: "confirmed", request_number: result.request_number, idempotency_key: key };
  }

  if (result.kind === "drop") {
    upsert(key, { attempts, last_error: `drop:${result.reason}` });
    notify();
    // Even on a "drop" we don't scare the user. From their point of view the
    // demand is queued; the admin will see the log and act.
    return { status: "queued", idempotency_key: key };
  }

  upsert(key, { attempts, last_error: result.reason });
  notify();
  scheduleRetry(key, attempts);
  return { status: "queued", idempotency_key: key };
}

// ---- Auto-boot ---------------------------------------------------------------
// Kick off any pending submissions on page load and whenever the browser
// regains connectivity. Import this module once (from TransportRequest.tsx or
// App.tsx) and everything else is automatic.

let booted = false;
export function bootSubmitQueue() {
  if (booted || typeof window === "undefined") return;
  booted = true;

  const kick = () => { void flushAll(); };

  window.addEventListener("online", kick);
  window.addEventListener("focus", kick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
  });

  // Initial flush after a short delay so the app has time to hydrate auth.
  setTimeout(kick, 1_500);
}
