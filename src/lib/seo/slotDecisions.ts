// Décisions admin par ville sur les combinaisons à disponibilité inconnue (table seo_city_slot_decisions).
// Une décision ne lance JAMAIS de génération; une inconnue ne devient jamais confirmée sans décision explicite.
import { supabase } from "@/integrations/supabase/client";

export type Decision = "confirmee" | "exclue";
export type DecisionRow = { city_slug: string; kind: "material" | "service"; slug: string; decision: Decision; reason: string };
export const decisionKey = (city: string, kind: string, slug: string | null) => `${city}|${kind}|${slug ?? ""}`;

/** Disponibilité d'une combinaison : preuve (demande exacte / service configuré), sinon décision admin, sinon inconnue. */
export function availabilityOf(item: { kind: string; status: string }, decision: Decision | undefined): "confirmee" | "exclue" | "inconnue" {
  if (item.kind === "hub") return "confirmee";
  if (decision === "exclue") return "exclue";
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
