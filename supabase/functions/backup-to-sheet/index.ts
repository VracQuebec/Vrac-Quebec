import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { isTrustedCron } from "../_shared/cron-auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SPREADSHEET_ID = "17qJgVMdmVQj5MYeNDP2qQnmz6cBIa4Xc7NrZzo9eMlo";
const SHEET_NAME = "Backup_Leads";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

const HEADERS = [
  "Date création",
  "# Soumission",
  "# DOMPE",
  "Nom",
  "Courriel",
  "Téléphone",
  "Adresse",
  "Code postal",
  "Latitude",
  "Longitude",
  "Type de demande",
  "Matériaux",
  "Autre matériau",
  "Type propriété",
  "Quantité",
  "Tonnage",
  "Voyages (qté)",
  "Budget unité",
  "Budget max",
  "Livrer/Sortir",
  "Contamination",
  "Longueur (pi)",
  "Largeur (pi)",
  "Profondeur (po)",
  "Accessibilité",
  "Machinerie dispo",
  "Description machinerie",
  "Notes / description",
  "Photos",
  "Statut",
  "Priorité",
  "Date limite réception",
  "Délai souhaité",
];

async function ensureSheetAndHeader(lovableKey: string, sheetsKey: string) {
  // Check spreadsheet metadata for sheet existence
  const metaRes = await fetch(`${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  const meta = await metaRes.json();
  if (!metaRes.ok) throw new Error(`Sheets meta failed [${metaRes.status}]: ${JSON.stringify(meta)}`);

  const exists = (meta.sheets || []).some((s: any) => s.properties?.title === SHEET_NAME);
  if (!exists) {
    const addRes = await fetch(`${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
      }),
    });
    const addJson = await addRes.json();
    if (!addRes.ok) throw new Error(`Add sheet failed [${addRes.status}]: ${JSON.stringify(addJson)}`);
  }

  // Check if header row exists
  const range = `${SHEET_NAME}!A1:AG1`;
  const hRes = await fetch(`${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${range}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  const hJson = await hRes.json();
  if (!hRes.ok) throw new Error(`Get header failed [${hRes.status}]: ${JSON.stringify(hJson)}`);
  const hasHeader = Array.isArray(hJson.values) && hJson.values[0]?.length > 0;
  if (!hasHeader) {
    const writeRes = await fetch(
      `${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": sheetsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [HEADERS] }),
      }
    );
    const wJson = await writeRes.json();
    if (!writeRes.ok) throw new Error(`Write header failed [${writeRes.status}]: ${JSON.stringify(wJson)}`);
  }
}

// Sanitize values written to Google Sheets to prevent formula injection.
// Even with valueInputOption=RAW we defensively prefix risky leading chars.
function sanitizeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!GOOGLE_SHEETS_API_KEY) throw new Error("GOOGLE_SHEETS_API_KEY is not configured");

    // SECURITY: never trust the caller-supplied row data. Accept only a
    // submission_id and look up the canonical row in the database with the
    // service role. This prevents anonymous callers from writing arbitrary
    // (or formula-injecting) data into the backup sheet.
    const body = await req.json().catch(() => ({}));
    const submissionId: string | undefined =
      body?.submission_id ?? body?.submissionId ?? body?.submission?.id;

    if (!submissionId || typeof submissionId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
      return new Response(JSON.stringify({ error: "Missing or invalid submission_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase service credentials are not configured");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // SECURITY: this endpoint must not be freely callable.
    // 1) Internal cron / admin callers may back up any submission.
    // 2) The public questionnaire may back up ONLY a submission it has just
    //    created (< 15 min old) and only once (sheet_backup_at guard).
    const isCron = await isTrustedCron(req, supabase);
    let isAdmin = false;
    const authHeader = req.headers.get("Authorization") || "";
    if (!isCron && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7);
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        const { data: roleOk } = await supabase.rpc("has_role", {
          _user_id: userData.user.id,
          _role: "admin",
        });
        isAdmin = Boolean(roleOk);
      }
    }

    const { data: s, error: lookupError } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (lookupError) throw new Error(`Submission lookup failed: ${lookupError.message}`);
    if (!s) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isCron && !isAdmin) {
      const createdAt = s.created_at ? new Date(s.created_at).getTime() : 0;
      const fresh = createdAt > 0 && Date.now() - createdAt < 15 * 60 * 1000;
      if (!fresh || s.sheet_backup_at) {
        // Deliberately vague: do not confirm whether the ID exists.
        return new Response(JSON.stringify({ error: "Not allowed" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    await ensureSheetAndHeader(LOVABLE_API_KEY, GOOGLE_SHEETS_API_KEY);

    const row = [
      s.created_at ?? new Date().toISOString(),
      s.submission_number ?? "",
      s.dompe_number ?? "",
      s.name ?? "",
      s.email ?? "",
      s.phone ?? "",
      s.address ?? "",
      s.postal_code ?? "",
      s.latitude ?? "",
      s.longitude ?? "",
      s.request_type ?? "",
      Array.isArray(s.materials) ? s.materials.join(", ") : (s.materials ?? ""),
      s.other_material ?? "",
      s.property_type ?? "",
      s.quantity ?? "",
      s.tonnage ?? "",
      s.trips ?? "",
      s.budget_unit ?? "",
      s.budget_max ?? "",
      s.deliver_or_remove ?? "",
      s.contamination ?? "",
      s.length_ft ?? "",
      s.width_ft ?? "",
      s.depth_in ?? "",
      Array.isArray(s.accessibility) ? s.accessibility.join(", ") : (s.accessibility ?? ""),
      s.machinery_available ? "Oui" : "Non",
      s.machinery_description ?? "",
      s.description ?? "",
      Array.isArray(s.photos) ? s.photos.join(" | ") : (s.photos ?? ""),
      s.status ?? "",
      s.priority ?? "",
      s.delivery_deadline ?? "",
      s.delivery_timeframe ?? "",
    ].map(sanitizeCell);

    const appendRange = `${SHEET_NAME}!A:AG`;
    const appendRes = await fetch(
      `${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [row] }),
      }
    );
    const appendJson = await appendRes.json();
    if (!appendRes.ok) {
      throw new Error(`Append failed [${appendRes.status}]: ${JSON.stringify(appendJson)}`);
    }

    await supabase
      .from("submissions")
      .update({ sheet_backup_at: new Date().toISOString() })
      .eq("id", submissionId);

    return new Response(JSON.stringify({ success: true, updates: appendJson.updates ?? null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("backup-to-sheet error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});