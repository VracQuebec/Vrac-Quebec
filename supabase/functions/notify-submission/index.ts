import "jsr:@supabase/functions-js/edge-runtime.d.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, materials, otherMaterial, address, quantity, tonnage } = await req.json();

    const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!ADMIN_EMAIL || !RESEND_API_KEY) {
      console.log("Email notification skipped: ADMIN_EMAIL or RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ message: "Email config missing, skipped" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailHtml = `
      <h2>Nouvelle demande — VracQuébec</h2>
      <table style="border-collapse:collapse;width:100%;max-width:600px;">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Nom</td><td style="padding:8px;border:1px solid #ddd;">${name}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Courriel</td><td style="padding:8px;border:1px solid #ddd;">${email}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Téléphone</td><td style="padding:8px;border:1px solid #ddd;">${phone || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Matériaux</td><td style="padding:8px;border:1px solid #ddd;">${materials}${otherMaterial ? ` (Autre: ${otherMaterial})` : ""}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Adresse</td><td style="padding:8px;border:1px solid #ddd;">${address}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Voyages</td><td style="padding:8px;border:1px solid #ddd;">${quantity}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Tonnage</td><td style="padding:8px;border:1px solid #ddd;">${tonnage}</td></tr>
      </table>
      <p style="margin-top:16px;"><a href="${Deno.env.get("SITE_URL") || "https://vracquebec.com"}/admin">Voir toutes les demandes →</a></p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "VracQuébec <notifications@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `Nouvelle demande de ${name} — ${materials}`,
        html: emailHtml,
      }),
    });

    const result = await res.json();
    console.log("Email sent:", result);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
