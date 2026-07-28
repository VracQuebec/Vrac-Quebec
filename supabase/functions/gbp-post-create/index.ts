import { corsHeaders, requireAdmin, getConfigWithToken, gapi, jsonRes, errRes } from "../_shared/gbp.ts";

type PostInput = {
  summary: string;
  topicType?: "STANDARD" | "EVENT" | "OFFER" | "ALERT";
  cta_type?: string;
  cta_url?: string;
  media_url?: string;
  event_title?: string;
  event_start_at?: string;
  event_end_at?: string;
  offer_coupon_code?: string;
  offer_terms?: string;
};

function toGoogleDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() },
    time: { hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: 0 },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user } = await requireAdmin(req);
    const input = await req.json() as PostInput;
    if (!input.summary || input.summary.length < 10) throw new Error("Le contenu doit faire au moins 10 caractères");
    if (input.summary.length > 1500) throw new Error("Le contenu ne peut dépasser 1500 caractères");

    const { cfg, svc, accessToken } = await getConfigWithToken();
    if (!cfg.account_name || !cfg.location_name) throw new Error("Fiche non sélectionnée");

    const topicType = input.topicType ?? "STANDARD";
    const body: Record<string, unknown> = { languageCode: "fr", summary: input.summary, topicType };
    if (input.cta_type && input.cta_url) {
      body.callToAction = { actionType: input.cta_type, url: input.cta_url };
    }
    if (input.media_url) {
      body.media = [{ mediaFormat: "PHOTO", sourceUrl: input.media_url }];
    }
    if (topicType === "EVENT" || topicType === "OFFER") {
      if (!input.event_title || !input.event_start_at || !input.event_end_at) {
        throw new Error("Titre, date de début et date de fin requis pour Événement/Offre");
      }
      body.event = {
        title: input.event_title,
        schedule: {
          startDate: toGoogleDateTime(input.event_start_at).date,
          startTime: toGoogleDateTime(input.event_start_at).time,
          endDate: toGoogleDateTime(input.event_end_at).date,
          endTime: toGoogleDateTime(input.event_end_at).time,
        },
      };
    }
    if (topicType === "OFFER") {
      body.offer = {
        couponCode: input.offer_coupon_code ?? null,
        redeemOnlineUrl: input.cta_url ?? null,
        termsConditions: input.offer_terms ?? null,
      };
    }

    // Local posts live on the deprecated v4 endpoint; requires My Business API access.
    const parent = `${cfg.account_name}/${cfg.location_name}`;
    const url = `https://mybusiness.googleapis.com/v4/${parent}/localPosts`;

    let rawResponse: unknown = null;
    let status: "published" | "failed" = "failed";
    let googleName: string | null = null;
    let searchUrl: string | null = null;
    let errorMessage: string | null = null;

    try {
      const res = await gapi(url, accessToken, { method: "POST", body: JSON.stringify(body) }) as Record<string, unknown>;
      rawResponse = res;
      status = "published";
      googleName = (res.name as string) ?? null;
      searchUrl = (res.searchUrl as string) ?? null;
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      rawResponse = { error: errorMessage };
    }

    const { data: row } = await svc.from("gbp_posts").insert({
      google_name: googleName,
      topic_type: topicType,
      summary: input.summary,
      cta_type: input.cta_type ?? null,
      cta_url: input.cta_url ?? null,
      media_url: input.media_url ?? null,
      event_title: input.event_title ?? null,
      event_start_at: input.event_start_at ?? null,
      event_end_at: input.event_end_at ?? null,
      offer_coupon_code: input.offer_coupon_code ?? null,
      offer_terms: input.offer_terms ?? null,
      status,
      error_message: errorMessage,
      google_search_url: searchUrl,
      published_at: status === "published" ? new Date().toISOString() : null,
      created_by: user.id,
      raw_response: rawResponse,
    }).select("*").single();

    if (status === "failed") return jsonRes({ ok: false, error: errorMessage, post: row }, 400);
    return jsonRes({ ok: true, post: row });
  } catch (e) { return errRes(e); }
});