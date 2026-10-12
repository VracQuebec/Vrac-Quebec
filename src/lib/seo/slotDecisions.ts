// Décisions admin par ville sur les combinaisons à disponibilité inconnue (table seo_city_slot_decisions).
// Une décision ne lance JAMAIS de génération; une inconnue ne devient jamais confirmée sans décision explicite.
import { supabase } from "@/integrations/supabase/client";

export type Decision = "confirmee" | "exclue";
export type DecisionRow = { city_slug: string; kind: "material" | "service"; slug: string; decision: Decision; reason: string };
export const decisionKey = (city: string, kind: string, slug: string | null) => `${city}|${kind}|${slug ?? ""}`;

/** Disponibilité d'une combinaison : preuve (demande exacte / service configuré), sinon décision admin, sinon inconnue. */
export type ServerAvailability = "confirmee" | "exclue" | "inconnue";
/** server = disponibilité du catalogue serveur (seo_city_slots_catalog) : règle de référence quand elle est fournie
 *  (« Terre » n'y prouve plus le remblai). Sans elle, ancien repli sur le statut de couverture. */
export function availabilityOf(item: { kind: string; status: string }, decision: Decision | undefined, server?: ServerAvailability): "confirmee" | "exclue" | "inconnue" {
  if (item.kind === "hub") return "confirmee";
  if (server === "exclue") return "exclue";
  if (decision === "exclue") return "exclue";
  if (decision === "confirmee") return "confirmee";
  if (server !== undefined) return server;
  if (["covered", "draft", "to_develop"].includes(item.status)) return "confirmee";
  if (decision === "confirmee") return "confirmee";
  return "inconnue";
}

export function validReason(r: string): boolean { return r.trim().length >= 5; }

export async function loadDecisions(): Promise<Map<string, DecisionRow>> {
  const { data, error } = await supabase.from("seo_city_slot_decisions").select("city_slug, kind, slug, decision, reason");
  if (error) throw new Error(error.message);
  const m = new Map<string, DecisionRow>();
  for (const r of (data ?? []) as DecisionRow[]) m.set(decisionKey(r.city_slug, r.kind, r.slug), r);
  return m;
}

/** Enregistre UNE décision (aucune génération, aucune autre écriture). */
export async function saveDecision(d: DecisionRow): Promise<void> {
  if (!validReason(d.reason)) throw new Error("Motif obligatoire (5 caractères minimum).");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Session requise.");
  const { error } = await supabase.from("seo_city_slot_decisions")
    .upsert({ ...d, reason: d.reason.trim(), decided_by: u.user.id, decided_at: new Date().toISOString() }, { onConflict: "city_slug,kind,slug" });
  if (error) throw new Error(error.message);
}

export type BulkDecision = { city_slug: string; kind: "material" | "service"; slugs: string[]; decision: Decision; reason: string };
/** Décisions en lot : UNE ligne par combinaison (chacune garde sa décision et son motif); aucune génération. */
export function expandBulk(b: BulkDecision[]): DecisionRow[] {
  const out: DecisionRow[] = [];
  for (const x of b) for (const slug of x.slugs) {
    if (!validReason(x.reason)) throw new Error("Motif obligatoire (5 caractères minimum).");
    out.push({ city_slug: x.city_slug, kind: x.kind, slug, decision: x.decision, reason: x.reason.trim() });
  }
  return out;
}
export async function saveDecisions(rows: DecisionRow[]): Promise<{ ok: string[]; failed: { slug: string; error: string }[] }> {
  const ok: string[] = []; const failed: { slug: string; error: string }[] = [];
  for (const r of rows) {
    try { await saveDecision(r); ok.push(r.slug); } catch (e) { failed.push({ slug: r.slug, error: e instanceof Error ? e.message : "Erreur" }); }
  }
  return { ok, failed };
}
