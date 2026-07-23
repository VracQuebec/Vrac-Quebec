// Shared AI Gateway wrapper with permanent cache, in-memory dedup and
// economy-mode enforcement. All AI callers in edge functions should go
// through `callAIChatCached()` instead of raw fetch to ai.gateway.lovable.dev.
//
// Behavior:
//  - Computes a stable SHA-256 key over { model, messages, response_format }.
//  - Looks up `public.ai_cache`; on hit, bumps counters and returns the
//    cached completion (0 AI calls, 0 credits, `cached: true`).
//  - Deduplicates concurrent identical requests inside the same isolate
//    via an in-memory promise map so N concurrent tasks trigger 1 AI call.
//  - Enforces economy mode: automatic (non user-triggered) requests are
//    rejected unless `allowAi === true` OR economy mode is off.
//  - Logs every call to `public.ai_call_log` for realtime dashboard.
//
// This module intentionally never throws on cache/log errors — the AI
// call must still succeed even if bookkeeping fails.

// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface CachedAIOptions {
  model: string;
  messages: ChatMessage[];
  response_format?: unknown;
  functionName: string;
  /** true = call was explicitly requested by a human (create/rewrite). */
  allowAi?: boolean;
  /** Bypass cache lookup and force a fresh call (still cached on write). */
  forceRefresh?: boolean;
  /** Optional supabase client (service role). Auto-created from env if omitted. */
  supabase?: SupabaseClient;
}

export interface CachedAIResult {
  content: string;
  raw: any;
  cached: boolean;
  cacheKey: string;
  durationMs: number;
  estimatedCredits: number;
}

// ~= rough Lovable credit cost for one Gemini flash chat call.
// Used only for savings estimation on the dashboard.
const CREDIT_COST: Record<string, number> = {
  "google/gemini-2.5-flash": 0.05,
  "google/gemini-2.5-flash-lite": 0.02,
  "google/gemini-3.6-flash": 0.05,
  "google/gemini-2.5-pro": 0.35,
  "google/gemini-3-pro-image": 0.5,
};
function estimateCredits(model: string): number {
  return CREDIT_COST[model] ?? 0.05;
}

function getServiceClient(existing?: SupabaseClient): SupabaseClient {
  if (existing) return existing;
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeCacheKey(model: string, messages: ChatMessage[], response_format?: unknown): Promise<string> {
  const canonical = JSON.stringify({
    m: model,
    r: response_format ?? null,
    x: messages.map((m) => ({ r: m.role, c: m.content })),
  });
  return await sha256Hex(canonical);
}

// Process-local dedup map: cacheKey -> in-flight promise
const inflight = new Map<string, Promise<CachedAIResult>>();

async function readEconomyMode(sb: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await sb.from("ai_settings").select("economy_mode").eq("id", 1).maybeSingle();
    return data?.economy_mode !== false; // default ON
  } catch { return true; }
}

async function logCall(sb: SupabaseClient, row: {
  function_name: string; model: string; cache_key: string; cached: boolean;
  prompt_tokens?: number; completion_tokens?: number; estimated_credits: number; duration_ms: number;
}) {
  try { await sb.from("ai_call_log").insert(row); } catch { /* swallow */ }
}

/**
 * Main entry: returns a chat completion, using cache when possible.
 * Throws an Error with .status = 402 on economy-mode block, so callers
 * can surface a clean 402 to the client.
 */
export async function callAIChatCached(opts: CachedAIOptions): Promise<CachedAIResult> {
  const sb = getServiceClient(opts.supabase);
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw Object.assign(new Error("LOVABLE_API_KEY manquante"), { status: 500 });

  const cacheKey = await computeCacheKey(opts.model, opts.messages, opts.response_format);
  const estCredits = estimateCredits(opts.model);

  // 1) Cache lookup (unless forceRefresh)
  if (!opts.forceRefresh) {
    try {
      const { data } = await sb.from("ai_cache").select("response, prompt_tokens, completion_tokens").eq("cache_key", cacheKey).maybeSingle();
      if (data?.response) {
        const content = (data.response as any)?.choices?.[0]?.message?.content ?? "";
        // fire-and-forget hit bookkeeping
        sb.from("ai_cache").update({
          hit_count: (undefined as any),
          last_used_at: new Date().toISOString(),
        }).eq("cache_key", cacheKey).then(() => {});
        // atomic increment via RPC-like update
        sb.rpc as any; // no-op placeholder — we do a follow-up UPDATE below
        await sb.from("ai_cache").update({
          last_used_at: new Date().toISOString(),
        }).eq("cache_key", cacheKey);
        await sb.from("ai_cache").update({
          hit_count: (await sb.from("ai_cache").select("hit_count").eq("cache_key", cacheKey).maybeSingle()).data?.hit_count + 1 || 1,
          estimated_credits_saved: (await sb.from("ai_cache").select("estimated_credits_saved").eq("cache_key", cacheKey).maybeSingle()).data?.estimated_credits_saved + estCredits || estCredits,
        }).eq("cache_key", cacheKey);
        await logCall(sb, {
          function_name: opts.functionName, model: opts.model, cache_key: cacheKey,
          cached: true, estimated_credits: estCredits, duration_ms: 0,
        });
        return { content, raw: data.response, cached: true, cacheKey, durationMs: 0, estimatedCredits: estCredits };
      }
    } catch { /* fall through to live call */ }
  }

  // 2) Economy mode gate — block automatic AI calls
  const economy = await readEconomyMode(sb);
  if (economy && !opts.allowAi) {
    throw Object.assign(new Error("Mode Économie maximale actif — appel IA automatique bloqué. Marquez l'action comme explicite (allow_ai) pour autoriser."), { status: 402 });
  }

  // 3) In-flight dedup
  const existing = inflight.get(cacheKey);
  if (existing) return await existing;

  const p = (async (): Promise<CachedAIResult> => {
    const started = Date.now();
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        ...(opts.response_format ? { response_format: opts.response_format } : {}),
      }),
    });
    const durationMs = Date.now() - started;
    if (!resp.ok) {
      const text = await resp.text();
      const err = Object.assign(new Error(text || `Gateway ${resp.status}`), { status: resp.status });
      throw err;
    }
    const raw = await resp.json();
    const content = raw?.choices?.[0]?.message?.content ?? "";
    const promptTokens = raw?.usage?.prompt_tokens ?? 0;
    const completionTokens = raw?.usage?.completion_tokens ?? 0;

    // Store cache (upsert, ignore errors)
    try {
      await sb.from("ai_cache").upsert({
        cache_key: cacheKey,
        model: opts.model,
        function_name: opts.functionName,
        response: raw,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        hit_count: 0,
        estimated_credits_saved: 0,
        last_used_at: new Date().toISOString(),
      }, { onConflict: "cache_key" });
    } catch { /* ignore */ }

    await logCall(sb, {
      function_name: opts.functionName, model: opts.model, cache_key: cacheKey,
      cached: false, prompt_tokens: promptTokens, completion_tokens: completionTokens,
      estimated_credits: estCredits, duration_ms: durationMs,
    });

    return { content, raw, cached: false, cacheKey, durationMs, estimatedCredits: estCredits };
  })().finally(() => { inflight.delete(cacheKey); });

  inflight.set(cacheKey, p);
  return await p;
}

/** Convenience: read the current economy mode without a full AI call. */
export async function getEconomyMode(sb?: SupabaseClient): Promise<boolean> {
  return await readEconomyMode(getServiceClient(sb));
}