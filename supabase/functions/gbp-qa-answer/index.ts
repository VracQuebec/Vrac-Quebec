import { corsHeaders, requireAdmin, getConfigWithToken, gapi, jsonRes, errRes } from "../_shared/gbp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user } = await requireAdmin(req);
    const { question_id, answer_text } = await req.json();
    if (!question_id || !answer_text || answer_text.length < 5) throw new Error("question_id + réponse (5+ car.) requis");

    const { svc, accessToken } = await getConfigWithToken();
    const { data: q, error } = await svc.from("gbp_questions").select("*").eq("id", question_id).maybeSingle();
    if (error || !q) throw new Error("Question introuvable");

    const url = `https://mybusinessqanda.googleapis.com/v1/${q.google_name}/answers:upsert`;
    const res = await gapi(url, accessToken, {
      method: "POST",
      body: JSON.stringify({ answer: { text: answer_text } }),
    }) as Record<string, unknown>;

    await svc.from("gbp_questions").update({
      owner_answer: answer_text,
      owner_answered_at: new Date().toISOString(),
      owner_answered_by: user.id,
      status: "answered",
      raw: { ...(q.raw as Record<string, unknown> ?? {}), lastAnswer: res },
    }).eq("id", question_id);

    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
});