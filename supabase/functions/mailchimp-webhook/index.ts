// Webhook Mailchimp : changements d'abonnement entrants (confirmation, désabonnement, adresse nettoyée).
// URL à déclarer dans Mailchimp : …/functions/v1/mailchimp-webhook?secret=<MAILCHIMP_WEBHOOK_SECRET>
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const secret = Deno.env.get("MAILCHIMP_WEBHOOK_SECRET");
  const given = new URL(req.url).searchParams.get("secret");
  // Comparaison sur empreintes de longueur fixe : pas de fuite temporelle sur le secret.
  if (!secret || !given || (await sha256(given)) !== (await sha256(secret))) {
    return new Response("Refusé", { status: 403, headers: corsHeaders });
  }
  if (req.method === "GET") return new Response("ok", { headers: corsHeaders }); // validation Mailchimp
  if (req.method !== "POST") return new Response("Méthode non permise", { status: 405, headers: corsHeaders });

  try {
    const form = await req.formData();
    const type = String(form.get("type") ?? "");
    const email = String(form.get("data[email]") ?? "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new Response("ok", { headers: corsHeaders });
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date().toISOString();
    let detail = "ignoré";
    if (type === "unsubscribe" || type === "cleaned") {
      // Idempotent : seul un consentement encore actif est retiré ; une
      // seconde livraison du même événement ne change rien.
      const { error } = await db.from("mkt_consents").update({ withdrawn_at: now, withdrawn_source: "mailchimp_" + type, mc_status: "unsubscribed", mc_last_sync_at: now })
        .eq("email", email).is("withdrawn_at", null);
      // Une erreur base n'est plus ignorée : 500 → nouvelle livraison possible.
      if (error) throw new Error(`mkt_consents: ${error.code ?? "erreur"}`);
      detail = "retrait enregistré";
    } else if (type === "subscribe") {
      // Confirmation d'inscription : seulement si un consentement exprès documenté existe déjà.
      const { data, error } = await db.from("mkt_consents").update({ mc_status: "subscribed", mc_last_sync_at: now }).eq("email", email).is("withdrawn_at", null).select("id");
      if (error) throw new Error(`mkt_consents: ${error.code ?? "erreur"}`);
      detail = data?.length ? "confirmé" : "aucun consentement documenté : non marqué abonné";
    }
    await db.from("mkt_sync_log").insert({ direction: "entrant", action: type || "inconnu", email, ok: true, detail });
    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    // Une erreur ne remonte plus en 500 brute sans trace : on journalise et
    // on répond 500 pour que Mailchimp retente l'envoi plus tard.
    // Message sans secret ni adresse courriel (seulement le code d'erreur).
    console.error("mailchimp-webhook failed:", e instanceof Error ? e.message : "erreur inconnue");
    try {
      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await db.from("mkt_sync_log").insert({ direction: "entrant", action: "erreur", email: "", ok: false, detail: "exception interne" });
    } catch { /* journal indisponible : ne pas masquer l'erreur d'origine */ }
    return new Response("Erreur interne", { status: 500, headers: corsHeaders });
  }
});
