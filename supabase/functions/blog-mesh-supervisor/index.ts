// Blog mesh watchdog. Cron-triggered (or manual).
// - Resurrects stalled runs (no progress > 60s) by re-kicking blog-mesh-worker.
// - Requeues batches stuck in "claimed" > 90s.
// - Marks runs completed when all batches are terminal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

    if (jwt !== serviceKey) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ error: "Non autorisé" }, 401);
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const stall = new Date(Date.now() - 90_000).toISOString();
    await admin.from("blog_mesh_batches")
      .update({ status: "queued", started_at: null })
      .lt("started_at", stall)
      .eq("status", "claimed");

    const { data: active } = await admin
      .from("blog_mesh_runs")
      .select("id, status, last_progress_at")
      .in("status", ["queued", "running"]);

    const kicks: string[] = [];
    for (const r of (active ?? []) as Array<{ id: string; status: string; last_progress_at: string }>) {
      const { count: openLeft } = await admin
        .from("blog_mesh_batches")
        .select("id", { count: "exact", head: true })
        .eq("run_id", r.id)
        .not("status", "in", "(completed,failed,cancelled)");
      if ((openLeft ?? 0) === 0) {
        await admin.from("blog_mesh_runs").update({
          status: "completed",
          finished_at: new Date().toISOString(),
        }).eq("id", r.id);
        continue;
      }
      if (r.status === "queued" || new Date(r.last_progress_at).getTime() < Date.now() - 60_000) {
        fetch(`${supaUrl}/functions/v1/blog-mesh-worker`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ run_id: r.id }),
        }).catch(() => {});
        kicks.push(r.id);
      }
    }

    return json({ ok: true, kicked: kicks });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});