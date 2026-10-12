// Garde pure (sans Deno ni réseau) partagée par l'aperçu et la fonction seo-page-repair préparée.
// « Régénérer les erreurs » = UNIQUEMENT des brouillons existants réellement en erreur,
// jamais une page manquante, publiée ou en noindex volontaire, et au plus 3 tentatives.

export const MAX_ATTEMPTS = 3;
export const NOINDEX_ONLY = "Publiée mais noindex";

export type RepairCandidate = {
  key: string;
  label: string;
  gen_state: string;
  has_page: boolean;
  published: boolean;
  noindex_volontaire: boolean;
  issues: string[] | null;
  attempts: number;
};

export type RepairSkip = { key: string; label: string; reason: string };

export function selectRepairTargets(rows: RepairCandidate[]): { targets: RepairCandidate[]; skipped: RepairSkip[] } {
  const targets: RepairCandidate[] = [];
  const skipped: RepairSkip[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    const skip = (reason: string) => skipped.push({ key: r.key, label: r.label, reason });
    if (r.gen_state === "ok") continue;
    if (!r.has_page) { skip("Page manquante — relève de « Générer », jamais de « Régénérer les erreurs »."); continue; }
    if (r.published) { skip("Page en ligne protégée — correction par proposition à valider seulement."); continue; }
    if (r.noindex_volontaire) { skip("Noindex volontaire — décision distincte requise."); continue; }
    if (r.gen_state !== "invalid") { skip(`État « ${r.gen_state} » — pas un brouillon en erreur.`); continue; }
    if (!r.issues?.length || r.issues.every((i) => i === NOINDEX_ONLY)) { skip("Aucune erreur réelle signalée."); continue; }
    if (r.attempts >= MAX_ATTEMPTS) { skip(`Limite de ${MAX_ATTEMPTS} tentatives atteinte — intervention manuelle documentée requise.`); continue; }
    targets.push(r);
  }
  return { targets, skipped };
}

/** Clé de verrou d'une combinaison (identique à l'index unique préparé côté base). */
export const lockKey = (city: string, material: string | null, service: string | null) =>
  `${city}|${material ?? ""}|${service ?? ""}`;

/** Réponse d'une régénération unitaire : jamais « réussi » si la génération ou le remplacement a échoué. */
export type SlotResult = { ok: boolean; error?: string; skipped?: boolean };
export function repairResponse(r: SlotResult): { status: number; body: Record<string, unknown> } {
  if (r.skipped) return { status: 409, body: { ok: false, queued: 0, done: false, error: "Une génération est déjà en cours pour cette combinaison — aucune nouvelle tentative." } };
  if (!r.ok) return { status: 502, body: { ok: false, queued: 1, done: true, error: r.error ?? "Échec de la génération — brouillon non remplacé." } };
  return { status: 200, body: { ok: true, queued: 1, done: true } };
}
