// Auto-repair supervisor: runs every minute via cron.
// Detects and fixes stalled jobs, duplicates, and orphaned running states.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedCron } from "../_shared/cron-auth.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Only allow admins or cron
    const isCron = await isTrustedCron(req, supabase);
    if (!isCron) {
      const authHeader = req.headers.get("Authorization") || "";
      const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const uid = u?.user?.id;
      if (!uid) return json({ error: "Non autorisé" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const actions: Record<string, unknown> = {};

    // 1. Purge stale running jobs (>3 min without progress)
    const { data: purged } = await supabase.rpc("seo_pipeline_purge_stale");
    actions.stale_purged = purged ?? 0;

    // 1b. Detect stalled batches and raise alerts.
    const { data: stalls } = await supabase.rpc("seo_pipeline_detect_stalls", { _alert_minutes: 10 });
    actions.stalls = stalls ?? null;

    // 1c. Auto-resume any run left in 'queued' or with tasks still pending
    //     by kicking the orchestrator once (idempotent, protected by lock).
    try {
      const url = Deno.env.get("SUPABASE_URL")!
        .replace(".supabase.co", ".functions.supabase.co")
        .replace(/\/$/, "");
      await fetch(`${url}/seo-pipeline-orchestrator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          "Lovable-Context": "cron",
        },
        body: JSON.stringify({ steps: 40 }),
      }).catch(() => {});
      actions.orchestrator_kicked = true;
    } catch { actions.orchestrator_kicked = false; }

    // 2. Merge duplicate running jobs (same mode, wave)
    const { data: running } = await supabase
      .from("seo_generation_jobs")
      .select("id,mode,wave,started_at,done,total")
      .eq("status", "running");
    const groups = new Map<string, typeof running>();
    for (const j of running ?? []) {
      const key = `${j.mode}::${j.wave ?? ""}`;
      const arr = groups.get(key) ?? [];
      arr.push(j);
      groups.set(key, arr);
    }
    let merged = 0;
    for (const [, jobs] of groups) {
      if (jobs.length <= 1) continue;
      // Keep the one with most progress; supersede the rest.
      const sorted = [...jobs].sort((a, b) => (b.done ?? 0) - (a.done ?? 0));
      for (const dup of sorted.slice(1)) {
        await supabase.from("seo_generation_jobs").update({
          status: "superseded",
          finished_at: new Date().toISOString(),
          current_step: "terminé",
          report: { final_status: "superseded", merged_into: sorted[0].id },
        }).eq("id", dup.id);
        merged++;
      }
    }
    actions.duplicates_merged = merged;

    return json({ ok: true, actions });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});