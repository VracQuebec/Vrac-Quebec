import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_EMAIL = "TransportJSC@hotmail.com";
const CRM_BASE_URL = "https://vracquebec.ca/admin";

const row = (label: string, value: string | number | null | undefined) => `
  <tr>
    <td style="padding:8px 12px;border:1px solid #f3d9b8;font-weight:600;background:#fff7ed;color:#7c2d12;width:42%;">${label}</td>
    <td style="padding:8px 12px;border:1px solid #f3d9b8;color:#1f2937;">${value !== null && value !== undefined && value !== "" ? value : "—"}</td>
  </tr>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      id,
      submission_number,
      dompe_number,
      name,
      email,
      phone,
      address,
      postal_code,
      materials,
      otherMaterial,
      quantity,
      accessibility,
      machinery_available,
      machinery_description,
      budget_unit,
      budget_max,
      description,
    } = body;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not configured — skipping email");
      return new Response(JSON.stringify({ message: "RESEND_API_KEY missing, skipped" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const crmLink = id ? `${CRM_BASE_URL}?lead=${id}` : CRM_BASE_URL;
    const accessibilityStr = Array.isArray(accessibility) ? accessibility.join(", ") : (accessibility || "—");
    const machineryStr = machinery_available
      ? `Oui${machinery_description ? ` — ${machinery_description}` : ""}`
      : "Non";
    const budgetStr = budget_max ? `${budget_max}${budget_unit ? ` ${budget_unit}` : ""}` : "—";
    const materialsStr = `${materials || "—"}${otherMaterial ? ` (Autre: ${otherMaterial})` : ""}`;

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;background:#ffffff;">
        <div style="background:linear-gradient(135deg,#f97316,#fb923c);color:#fff;padding:20px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-size:22px;">🚛 Nouveau lead Vrac Québec Simple</h1>
          <p style="margin:6px 0 0;font-size:13px;opacity:0.95;">
            Soumission #${submission_number ?? "—"}${dompe_number ? ` &nbsp;•&nbsp; DOMPE ${dompe_number}` : ""}
          </p>
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #f3d9b8;border-top:none;">
          ${row("Nom complet", name)}
          ${row("Téléphone", phone)}
          ${row("Courriel", email)}
          ${row("Adresse civique", address)}
          ${row("Code postal", postal_code)}
          ${row("Matériel demandé", materialsStr)}
          ${row("Nombre de voyages", quantity)}
          ${row("Accessibilité du terrain", accessibilityStr)}
          ${row("Machinerie sur place", machineryStr)}
          ${row("Montant prêt à payer", budgetStr)}
          ${row("Notes", description)}
          ${row("Numéro DOMPE", dompe_number)}
        </table>
        <div style="text-align:center;margin:24px 0;">
          <a href="${crmLink}" style="display:inline-block;background:#f97316;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;box-shadow:0 4px 12px rgba(249,115,22,0.3);">
            👉 Voir ce lead dans le CRM
          </a>
        </div>
        <p style="font-size:12px;color:#6b7280;text-align:center;margin-top:20px;">
          Notification automatique — Vrac Québec
        </p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Vrac Québec <notifications@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `🚛 Nouveau lead Vrac Québec Simple — ${name}`,
        html: emailHtml,
      }),
    });

    const result = await res.json();
    console.log("Email response:", res.status, result);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-submission error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
