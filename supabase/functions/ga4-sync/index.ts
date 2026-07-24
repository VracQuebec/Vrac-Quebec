// Edge function — Sync Google Analytics 4 metrics for vracquebec.ca via
// service-account JWT (RS256) → GA4 Data API v1beta. Admin-only, or cron with
// the "Lovable-Context: cron" header. Populates ga4_daily_summary,
// ga4_page_metrics and ga4_traffic_sources.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function isoDaysAgo(days: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64url(s: string): string { return b64urlFromBytes(new TextEncoder().encode(s)); }

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, "")
                  .replace(/-----END [^-]+-----/g, "")
                  .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getAccessToken(): Promise<{ token: string; sa: { client_email: string; project_id: string } }> {
  const raw = Deno.env.get("GA4_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GA4_SERVICE_ACCOUNT_JSON manquant");
  let sa: { client_email: string; private_key: string; token_uri?: string; project_id: string };
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  sa = tryParse(raw);
  if (!sa) {
    // Common paste error: real newlines inside the private_key string.
    // Escape any newlines that fall between BEGIN/END markers.
    const repaired = raw.replace(
      /("private_key"\s*:\s*")([\s\S]*?)(")/,
      (_m, a, body, c) => a + body.replace(/\r?\n/g, "\\n") + c,
    );
    sa = tryParse(repaired);
  }
  if (!sa) {
    // Second fallback: strip wrapping single-quotes.
    const stripped = raw.trim().replace(/^'|'$/g, "");
    sa = tryParse(stripped);
  }
  if (!sa) throw new Error("GA4_SERVICE_ACCOUNT_JSON invalide (JSON malformé). Recolle le contenu du fichier .json du service account.");
  if (!sa.client_email || !sa.private_key) throw new Error("Service account incomplet (client_email/private_key manquants)");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${b64urlFromBytes(sig)}`;

  const resp = await fetch(claim.aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new Error(`OAuth token ${resp.status}: ${bodyText.slice(0, 400)}`);
  const j = JSON.parse(bodyText) as { access_token?: string; error?: string; error_description?: string };
  if (!j.access_token) throw new Error(`OAuth token: réponse sans access_token (${j.error ?? "?"}: ${j.error_description ?? ""})`);
  return { token: j.access_token, sa: { client_email: sa.client_email, project_id: sa.project_id } };
}

type GA4Row = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };

async function ga4Query(propertyId: string, token: string, body: unknown) {
  const resp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`GA4 ${resp.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as { rows?: GA4Row[] };
}

const N = (s: string | undefined) => (s ? Number(s) : 0);
const I = (s: string | undefined) => Math.round(N(s));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const isCron = req.headers.get("Lovable-Context") === "cron";
    if (!isCron) {
      const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      if (!jwt) return json({ error: "Non autorisé" }, 401);
      const { data: userData } = await supabase.auth.getUser(jwt);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Session invalide" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const propertyId = Deno.env.get("GA4_PROPERTY_ID");
    if (!propertyId) return json({ error: "GA4_PROPERTY_ID manquant" }, 500);

    const { token, sa } = await getAccessToken();

    // 1) Test — récupère 1 métrique last 7d pour valider les permissions
    let probeUsers = 0;
    try {
      const probe = await ga4Query(propertyId, token, {
        dateRanges: [{ startDate: isoDaysAgo(7), endDate: "yesterday" }],
        metrics: [{ name: "totalUsers" }],
      });
      probeUsers = I(probe.rows?.[0]?.metricValues?.[0]?.value);
    } catch (e) {
      return json({
        ok: false,
        stage: "permissions",
        error: e instanceof Error ? e.message : String(e),
        hint: `Ajoute ${sa.client_email} comme Viewer sur la propriété GA4 ${propertyId} (Admin → Property Access Management).`,
      }, 403);
    }

    const periods: Array<{ key: "7d" | "28d" | "90d"; days: number }> = [
      { key: "7d", days: 7 }, { key: "28d", days: 28 }, { key: "90d", days: 90 },
    ];

    let pageUpserts = 0, sourceUpserts = 0, dailyUpserts = 0;

    // 2) Résumé quotidien (28 derniers jours)
    const daily = await ga4Query(propertyId, token, {
      dateRanges: [{ startDate: isoDaysAgo(28), endDate: "yesterday" }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "totalUsers" }, { name: "sessions" }, { name: "newUsers" },
        { name: "screenPageViews" }, { name: "engagementRate" },
        { name: "userEngagementDuration" }, { name: "conversions" }, { name: "eventCount" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 100,
    });
    for (const r of daily.rows ?? []) {
      const yyyymmdd = r.dimensionValues?.[0]?.value;
      if (!yyyymmdd || yyyymmdd.length !== 8) continue;
      const iso = `${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}`;
      const m = r.metricValues ?? [];
      const users = I(m[0]?.value);
      const sessions = I(m[1]?.value);
      const engagementDuration = N(m[5]?.value);
      await supabase.from("ga4_daily_summary").upsert({
        date: iso,
        users,
        sessions,
        new_users: I(m[2]?.value),
        page_views: I(m[3]?.value),
        engagement_rate: Number((N(m[4]?.value)).toFixed(4)),
        avg_engagement_time_sec: users > 0 ? Number((engagementDuration / users).toFixed(2)) : 0,
        conversions: I(m[6]?.value),
        events_count: I(m[7]?.value),
        fetched_at: new Date().toISOString(),
      }, { onConflict: "date" });
      dailyUpserts++;
    }

    // 3) Métriques par page (top 5000) et sources — pour chaque période
    for (const period of periods) {
      const pages = await ga4Query(propertyId, token, {
        dateRanges: [{ startDate: isoDaysAgo(period.days), endDate: "yesterday" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "totalUsers" }, { name: "sessions" }, { name: "newUsers" },
          { name: "screenPageViews" }, { name: "engagementRate" },
          { name: "userEngagementDuration" }, { name: "conversions" }, { name: "eventCount" },
        ],
        orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
        limit: 5000,
      });
      for (const r of pages.rows ?? []) {
        const path = r.dimensionValues?.[0]?.value;
        if (!path) continue;
        const m = r.metricValues ?? [];
        const users = I(m[0]?.value);
        const engagementDuration = N(m[5]?.value);
        await supabase.from("ga4_page_metrics").upsert({
          page_path: path,
          period: period.key,
          users,
          sessions: I(m[1]?.value),
          new_users: I(m[2]?.value),
          page_views: I(m[3]?.value),
          engagement_rate: Number((N(m[4]?.value)).toFixed(4)),
          avg_engagement_time_sec: users > 0 ? Number((engagementDuration / users).toFixed(2)) : 0,
          conversions: I(m[6]?.value),
          events_count: I(m[7]?.value),
          fetched_at: new Date().toISOString(),
        }, { onConflict: "page_path,period" });
        pageUpserts++;
      }

      const sources = await ga4Query(propertyId, token, {
        dateRanges: [{ startDate: isoDaysAgo(period.days), endDate: "yesterday" }],
        dimensions: [
          { name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionDefaultChannelGroup" },
        ],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 500,
      });
      for (const r of sources.rows ?? []) {
        const src = r.dimensionValues?.[0]?.value ?? "(direct)";
        const med = r.dimensionValues?.[1]?.value ?? "(none)";
        const ch  = r.dimensionValues?.[2]?.value ?? null;
        const m = r.metricValues ?? [];
        await supabase.from("ga4_traffic_sources").upsert({
          period: period.key,
          source: src,
          medium: med,
          channel: ch,
          sessions: I(m[0]?.value),
          users: I(m[1]?.value),
          conversions: I(m[2]?.value),
          fetched_at: new Date().toISOString(),
        }, { onConflict: "period,source,medium" });
        sourceUpserts++;
      }
    }

    return json({
      ok: true,
      property_id: propertyId,
      service_account: sa.client_email,
      probe_users_7d: probeUsers,
      daily_upserts: dailyUpserts,
      page_upserts: pageUpserts,
      source_upserts: sourceUpserts,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});