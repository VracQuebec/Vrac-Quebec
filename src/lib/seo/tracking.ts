import { supabase } from "@/integrations/supabase/client";

export type SeoPageEventType =
  | "view"
  | "phone_click"
  | "whatsapp_click"
  | "email_click"
  | "submission"
  | "cta_click";

const SESSION_KEY = "vq_session_id";
const VIEW_LOGGED_PREFIX = "vq_viewed_";

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "anon";
  }
}

/** Fire-and-forget: never throws, never blocks the UI. */
export function logSeoEvent(pageSlug: string, eventType: SeoPageEventType): void {
  if (!pageSlug) return;
  const clean = pageSlug.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!clean) return;
  try {
    void supabase.from("seo_page_events").insert({
      page_slug: clean,
      event_type: eventType,
      session_id: getSessionId(),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
  } catch {
    // ignore
  }
}

/** Log a page view once per session per slug (deduped). */
export function logSeoViewOnce(pageSlug: string): void {
  if (!pageSlug) return;
  const clean = pageSlug.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!clean) return;
  const key = VIEW_LOGGED_PREFIX + clean;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // fall through and log anyway
  }
  logSeoEvent(clean, "view");
}