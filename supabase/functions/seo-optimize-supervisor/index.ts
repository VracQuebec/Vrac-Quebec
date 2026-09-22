// Watchdog for the optimization engine. Called by cron every minute.
// - Requeues tasks stuck in in-flight states via seo_optimization_watchdog().
// - If a running run exists but no worker is progressing, kicks the worker.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedCron } from "../_shared/cron-auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
  try {
    // Admin-or-cron guard
    const isCron = await isTrustedCron(req, supabase);
    if (!isCron) {
      const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      const { data: u } = await supabase.auth.getUser(jwt);
      if (!u?.user?.id) {
        return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Réservé aux administrateurs" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
      }
    }
    const { data: requeued } = await supabase.rpc("seo_optimization_watchdog");

    // 1) Kick the currently running run if stale.
    const { data: active } = await supabase
      .from("seo_optimization_runs")
      .select("id, last_progress_at")
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let kicked = false;
    if (active) {
      // If no progress in last 45s or watchdog requeued anything, poke the worker.
      const stale = !active.last_progress_at
        || (Date.now() - new Date(active.last_progress_at).getTime()) > 45_000;
      if (stale || (requeued ?? 0) > 0) {
        await fetch(`${supaUrl}/functions/v1/seo-optimize-worker`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ run_id: active.id }),
        });
        kicked = true;
      }
    }

    // 2) Auto-resume any 'queued' run that never got its first worker kick.
    const { data: queued } = await supabase
      .from("seo_optimization_runs")
      .select("id")
      .eq("status", "queued")
      .lt("created_at", new Date(Date.now() - 30_000).toISOString())
      .limit(3);
    for (const q of queued ?? []) {
      await supabase.from("seo_optimization_runs").update({ status: "running", last_progress_at: new Date().toISOString() }).eq("id", q.id);
      await fetch(`${supaUrl}/functions/v1/seo-optimize-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ run_id: q.id }),
      });
    }

    return new Response(JSON.stringify({ ok: true, requeued: requeued ?? 0, kicked, resumed_queued: (queued ?? []).length }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});