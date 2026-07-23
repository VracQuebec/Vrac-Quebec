// Edge function — Generates a blog cover image from a prompt via Lovable AI Gateway,
// uploads it to the blog-media bucket, returns a signed URL. Admin only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiCall } from "../_shared/ai-cache.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Non autorisé" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Session invalide" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);

    const body = await req.json().catch(() => ({}));
    const prompt: string = (body?.prompt || "").toString().trim();
    if (!prompt) return json({ error: "Prompt requis" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY manquante" }, 500);

    const started = Date.now();
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          { role: "user", content: `Photoréaliste, 16:9, éclairage naturel, chantier québécois, aucun texte dans l'image. ${prompt}` },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) return json({ error: "Trop de requêtes IA — réessayez dans un instant." }, 429);
      if (resp.status === 402) return json({ error: "Crédits IA épuisés." }, 402);
      return json({ error: `Erreur IA image: ${text}` }, 500);
    }
    const data = await resp.json();
    logAiCall({
      functionName: "blog-ai-cover",
      model: "google/gemini-2.5-flash-image",
      cached: false,
      durationMs: Date.now() - started,
    }, supabase).catch(() => {});
    const imgB64: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url
      || data?.choices?.[0]?.message?.images?.[0]?.url;
    if (!imgB64) return json({ error: "Aucune image générée" }, 500);

    // Extract base64 payload (may be a data URL)
    const commaIdx = imgB64.indexOf(",");
    const b64 = commaIdx >= 0 ? imgB64.slice(commaIdx + 1) : imgB64;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const path = `covers/ai-${crypto.randomUUID()}.png`;
    const up = await supabase.storage.from("blog-media").upload(path, bin, {
      contentType: "image/png",
      upsert: false,
    });
    if (up.error) return json({ error: up.error.message }, 500);

    const signed = await supabase.storage.from("blog-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signed.error || !signed.data?.signedUrl) return json({ error: signed.error?.message || "URL indisponible" }, 500);

    return json({ url: signed.data.signedUrl, path });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}