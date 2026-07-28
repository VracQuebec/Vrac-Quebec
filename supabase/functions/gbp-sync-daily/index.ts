import { corsHeaders, getConfigWithToken, gapi, jsonRes, errRes } from "../_shared/gbp.ts";

const METRICS = [
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
];

function ymd(d: Date) {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { svc, cfg, accessToken } = await getConfigWithToken();
    if (!cfg.location_name) throw new Error("Aucune fiche sélectionnée");

    const end = new Date();
    const start = new Date(); start.setUTCDate(start.getUTCDate() - 90);
    const startDate = ymd(start); const endDate = ymd(end);

    const params = new URLSearchParams();
    for (const m of METRICS) params.append("dailyMetrics", m);
    params.append("dailyRange.start_date.year", String(startDate.year));
    params.append("dailyRange.start_date.month", String(startDate.month));
    params.append("dailyRange.start_date.day", String(startDate.day));
    params.append("dailyRange.end_date.year", String(endDate.year));
    params.append("dailyRange.end_date.month", String(endDate.month));
    params.append("dailyRange.end_date.day", String(endDate.day));

    const perfUrl = `https://businessprofileperformance.googleapis.com/v1/${cfg.location_name}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;
    const perf = await gapi(perfUrl, accessToken) as {
      multiDailyMetricTimeSeries?: Array<{
        dailyMetricTimeSeries?: Array<{
          dailyMetric: string;
          timeSeries?: { datedValues?: Array<{ date: { year: number; month: number; day: number }; value?: string }> };
        }>;
      }>;
    };

    const rows: Array<{ metric_date: string; metric_name: string; value: number }> = [];
    for (const group of perf.multiDailyMetricTimeSeries ?? []) {
      for (const s of group.dailyMetricTimeSeries ?? []) {
        for (const dv of s.timeSeries?.datedValues ?? []) {
          const iso = `${dv.date.year}-${String(dv.date.month).padStart(2, "0")}-${String(dv.date.day).padStart(2, "0")}`;
          rows.push({ metric_date: iso, metric_name: s.dailyMetric, value: Number(dv.value ?? 0) });
        }
      }
    }
    if (rows.length) {
      await svc.from("gbp_daily_metrics").upsert(rows, { onConflict: "metric_date,metric_name" });
    }

    // Q&R
    let questionCount = 0;
    try {
      const qa = await gapi(
        `https://mybusinessqanda.googleapis.com/v1/${cfg.location_name}/questions?pageSize=50&answersPerQuestion=1`,
        accessToken,
      ) as { questions?: Array<Record<string, unknown>> };
      for (const q of qa.questions ?? []) {
        const author = (q.author ?? {}) as { displayName?: string; type?: string };
        const topAnswer = ((q.topAnswers ?? []) as Array<{ text?: string; author?: { type?: string }; createTime?: string }>)[0];
        const ownerAnswer = topAnswer && topAnswer.author?.type === "MERCHANT" ? topAnswer.text : null;
        await svc.from("gbp_questions").upsert({
          google_name: q.name as string,
          question_text: (q.text as string) ?? "",
          author_display_name: author.displayName ?? null,
          author_type: author.type ?? null,
          upvote_count: (q.upvoteCount as number) ?? 0,
          total_answer_count: (q.totalAnswerCount as number) ?? 0,
          owner_answer: ownerAnswer,
          owner_answered_at: ownerAnswer && topAnswer?.createTime ? topAnswer.createTime : null,
          status: ownerAnswer ? "answered" : "unanswered",
          created_at_google: (q.createTime as string) ?? null,
          raw: q,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "google_name" });
        questionCount++;
      }
    } catch (e) {
      console.warn("Q&A sync failed:", (e as Error).message);
    }

    // Location snapshot refresh (categories, website, etc.)
    try {
      const readMask = "name,title,storefrontAddress,phoneNumbers,categories,websiteUri,metadata,labels";
      const loc = await gapi(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${cfg.location_name}?readMask=${encodeURIComponent(readMask)}`,
        accessToken,
      ) as Record<string, unknown>;
      const meta = (loc.metadata ?? {}) as { mapsUri?: string };
      await svc.from("gbp_location").update({
        maps_uri: meta.mapsUri ?? null,
        raw: loc,
        fetched_at: new Date().toISOString(),
      }).eq("location_name", cfg.location_name);
    } catch (e) {
      console.warn("Location snapshot refresh failed:", (e as Error).message);
    }

    await svc.from("gbp_config").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "ok",
      last_sync_error: null,
    }).neq("id", "00000000-0000-0000-0000-000000000000");

    return jsonRes({ ok: true, metrics: rows.length, questions: questionCount });
  } catch (e) {
    try {
      const { serviceClient } = await import("../_shared/gbp.ts");
      await serviceClient().from("gbp_config").update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: e instanceof Error ? e.message : String(e),
      }).neq("id", "00000000-0000-0000-0000-000000000000");
    } catch { /* ignore */ }
    return errRes(e, 500);
  }
});