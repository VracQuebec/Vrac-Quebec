// Thin starter: creates a batched run via blog_mesh_start() and kicks blog-mesh-worker.
// Kept for backward compat with older callers; new UI can call the RPC directly.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return respond({ error: "Missing token" }, 401);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asUser = createClient(supaUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = (await req.json().catch(() => ({}))) as { mode?: string; post_ids?: string[] };
    const rawMode = body.mode ?? "full";
    const mode = rawMode === "all" ? "full"
      : rawMode === "single" ? "single_post"
      : rawMode === "orphans" ? "incremental"
      : rawMode;

    const { data: runId, error } = await asUser.rpc("blog_mesh_start", {
      _mode: mode,
      _item_ids: body.post_ids ?? null,
    });
    if (error) return respond({ error: error.message }, 400);

    fetch(`${supaUrl}/functions/v1/blog-mesh-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ run_id: runId }),
    }).catch(() => {});

    return respond({ ok: true, run_id: runId, stats: { linked: 0, orphans: 0, links_created: 0 } });
  } catch (e) {
    return respond({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});