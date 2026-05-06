import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SPREADSHEET_ID = "17qJgVMdmVQj5MYeNDP2qQnmz6cBIa4Xc7NrZzo9eMlo";
const SHEET_NAME = "Backup Leads";
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
  const range = `${SHEET_NAME}!A1:AE1`;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!GOOGLE_SHEETS_API_KEY) throw new Error("GOOGLE_SHEETS_API_KEY is not configured");

    const payload = await req.json();
    const s = payload?.submission ?? payload;
    if (!s || typeof s !== "object") {
      return new Response(JSON.stringify({ error: "Missing submission payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    ];

    const appendRange = `${SHEET_NAME}!A:AE`;
    const appendRes = await fetch(
      `${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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