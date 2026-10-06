// Assistant public de la page d'accueil Vrac Québec.
// Le visiteur ne lit sa conversation qu'avec son jeton secret (site_chat_poll).
// Si un membre de l'équipe a pris le contrôle (mode « humain »), l'IA ne répond plus.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { clientIp, enforceIpQuota, GuardError } from "../_shared/public-guard.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const MODEL = "openai/gpt-6-astra";

const PAGES: [string, string][] = [
  ["/soumission", "Obtenir une estimation / soumission de matériaux en vrac livrés"],
  ["/acheter-materiaux", "Acheter des matériaux (terre, sable, gravier, pierre)"],
  ["/materiaux", "Catalogue des matériaux"],
  ["/remblai", "Se débarrasser de remblai / trouver une dompe (sol propre seulement)"],
  ["/depot-materiaux", "Déposer ou offrir des matériaux"],
  ["/demande-transport", "Demande de transport en vrac (camions 10 et 12 roues)"],
  ["/transport-en-vrac", "Informations sur le transport en vrac"],
  ["/types-de-camions", "Types de camions et capacités"],
  ["/calculateur", "Calculateurs de volume, tonnage et nombre de voyages"],
  ["/trouver-un-entrepreneur", "Trouver un entrepreneur (excavation, pépine, etc.)"],
  ["/obtenir-des-soumissions", "Recevoir plusieurs soumissions d'entrepreneurs"],
  ["/place-de-marche", "Place de marché des demandes"],
  ["/reseau", "Réseau des entreprises partenaires"],
  ["/espace-entrepreneur", "Espace entrepreneur : inscription, CRM, facturation, agenda, punch, outils"],
  ["/login", "Connexion"],
  ["/portail/client", "Portail client : suivre ses demandes"],
  ["/mes-soumissions", "Mes soumissions reçues"],
  ["/blog", "Centre de connaissances et guides"],
  ["/blog/faq", "Questions fréquentes"],
  ["/livraison", "Livraison par ville"],
];
const ALLOWED = new Set(PAGES.map((p) => p[0]));

const SYSTEM = `Tu es l'assistant du site Vrac Québec (vracquebec.ca), une plateforme québécoise qui met en relation clients et entrepreneurs pour les matériaux en vrac (terre, sable, gravier, pierre, remblai), le transport en vrac et les services de chantier (pépine, analyses de sols).
Règles :
- Réponds en français québécois clair, court (3 à 6 phrases max), chaleureux et concret. Si on t'écrit en anglais, réponds en anglais.
- Identifie si la personne est un client (particulier, entreprise qui a besoin de matériaux/transport/dompe) ou un entrepreneur (camionneur, excavateur, fournisseur) et guide-la vers la bonne page.
- Donne des liens internes UNIQUEMENT au format Markdown [libellé](/chemin) et UNIQUEMENT parmi cette liste :
${PAGES.map(([p, d]) => `${p} — ${d}`).join("\n")}
- Ne donne jamais de prix, de délai garanti, de nom de transporteur ni de fournisseur : le calcul se fait dans le parcours de soumission.
- Aucun sol contaminé n'est accepté. Une « dompe » est une demande de remblai.
- Ne demande jamais une information que le système peut calculer (camion, nombre de voyages, distance).
- Téléphone public unique Vrac Québec : 819-592-3495.
- Si la personne veut parler à quelqu'un, est frustrée, ou si tu ne sais pas, propose le bouton « Parler à une personne ».
- N'invente rien. Ne promets aucune action que tu ne peux pas faire.`;

function db() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

function sanitize(text: string) {
  // Retire les liens hors liste autorisée (garde le libellé).
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, l, href) => (ALLOWED.has(String(href).split(/[?#]/)[0]) ? `[${l}](${href})` : l)).slice(0, 3000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non permise" }, 405);
  const sb = db();
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 1500) : "";
    const wantHuman = body.wantHuman === true;
    const audience = ["client", "entrepreneur"].includes(body.audience) ? body.audience : null;
    const page = typeof body.page === "string" ? body.page.slice(0, 200) : null;
    if (!text && !wantHuman) return json({ error: "Message vide" }, 400);

    let session: any = null;
    if (typeof body.token === "string" && /^[0-9a-f-]{36}$/i.test(body.token)) {
      const { data } = await sb.from("site_chat_sessions").select("*").eq("token", body.token).maybeSingle();
      session = data;
    }
    if (!session || session.mode === "ferme") {
      await enforceIpQuota(sb, "site-assistant-session", clientIp(req), 15, 60);
      const { data, error } = await sb.from("site_chat_sessions").insert({ page, audience: audience ?? "inconnu" }).select("*").single();
      if (error) throw error;
      session = data;
    }
    if (session.msg_count >= 80) return json({ token: session.token, error: "Conversation trop longue : appelez-nous au 819-592-3495." }, 429);

    if (text) await sb.from("site_chat_messages").insert({ session_id: session.id, role: "visiteur", content: text });
    const patch: Record<string, unknown> = { last_at: new Date().toISOString(), msg_count: session.msg_count + 1 };
    if (audience) patch.audience = audience;
    if (wantHuman && session.mode === "ia") {
      patch.wants_human = true;
      await sb.from("site_chat_messages").insert({ session_id: session.id, role: "systeme", content: "Un membre de l'équipe Vrac Québec est avisé et va se joindre à la conversation dès que possible. Pour une urgence : 819-592-3495." });
    }
    await sb.from("site_chat_sessions").update(patch).eq("id", session.id);

    if (session.mode === "humain" || !text || wantHuman) return json({ token: session.token });

    await enforceIpQuota(sb, "site-assistant-ai", clientIp(req), 40, 60);
    const { data: hist } = await sb.from("site_chat_messages").select("role,content").eq("session_id", session.id).order("id", { ascending: false }).limit(16);
    const messages = [{ role: "system", content: SYSTEM + (page ? `\nPage actuelle du visiteur : ${page}` : "") },
      ...(hist ?? []).reverse().filter((m: any) => m.role !== "systeme").map((m: any) => ({ role: m.role === "visiteur" ? "user" : "assistant", content: m.content }))];

    let reply = "Désolé, je n'arrive pas à répondre pour le moment. Vous pouvez cliquer « Parler à une personne » ou appeler le 819-592-3495.";
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (key) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, store: false, reasoning: { effort: "low" }, instructions: messages[0].content, input: messages.slice(1) }),
      });
      if (r.ok) { const j = await r.json(); const c = typeof j?.output_text === "string" ? j.output_text : (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((x: any) => x?.type === "output_text").map((x: any) => x.text).join("\n"); if (typeof c === "string" && c.trim()) reply = sanitize(c.trim()); }
      else console.error("site-assistant gateway", r.status, (await r.text().catch(() => "")).slice(0, 300));
    }
    // L'agent a pu prendre le contrôle pendant la génération : on n'écrit pas par-dessus lui.
    const { data: now } = await sb.from("site_chat_sessions").select("mode").eq("id", session.id).single();
    if (now?.mode === "ia") await sb.from("site_chat_messages").insert({ session_id: session.id, role: "ia", content: reply });
    return json({ token: session.token });
  } catch (e) {
    if (e instanceof GuardError) return json({ error: e.message }, e.status);
    console.error("site-assistant", e instanceof Error ? e.message : e);
    return json({ error: "Erreur temporaire. Réessayez ou appelez le 819-592-3495." }, 500);
  }
});
