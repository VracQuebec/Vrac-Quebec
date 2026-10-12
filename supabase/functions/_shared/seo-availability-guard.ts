// Garde serveur commune : aucune génération (ni aperçu IA) sans disponibilité
// confirmée par une preuve existante ou une décision explicite enregistrée.
// Relu à l'exécution : un changement entre sélection et exécution est refusé.
export type Availability = "confirmee" | "exclue" | "inconnue";

export function availabilityRefusal(av: unknown): string | null {
  if (av === "confirmee") return null;
  if (av === "exclue") return "Combinaison exclue — génération refusée.";
  return "Disponibilité inconnue — décision explicite requise avant toute génération.";
}

export async function checkAvailability(
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>,
  city: string, material: string | null, service: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string; availability?: unknown }> {
  const { data, error } = await rpc("seo_slot_availability", {
    _city_slug: city, _material_slug: material, _service_slug: service,
  });
  if (error) return { ok: false, status: 503, error: `Disponibilité non vérifiable — aucun traitement : ${error.message}` };
  const refusal = availabilityRefusal(data);
  return refusal ? { ok: false, status: 403, error: refusal, availability: data ?? "inconnue" } : { ok: true };
}
