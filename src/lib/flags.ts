// ============================================================
// Drapeaux de fonctionnalité (feature flags) — côté client.
// Par défaut TOUT est désactivé : la production conserve
// exactement le comportement actuel.
// Activation possible seulement en preview / test :
//   - paramètre d'URL : ?material_assistant_v2=1  (ou =0 pour désactiver)
//   - stockage local  : vq_flag_material_assistant_v2 = "1"
// ============================================================

export const FEATURE_FLAGS = {
  /** Nouvel assistant « Décrivez votre matériel » branché au parcours. */
  material_assistant_v2: false,
  /** Compatibilité matériaux structurée (chargement ↔ demande de remblai). */
  material_matching_v2: false,
  /** Qualification administrateur des demandes de remblai (LOT 12) — interne. */
  material_qualification_v2: false,
  /** Centre de contrôle intelligent des demandes de remblai (LOT 13) — interne. */
  qualification_control_center_v2: false,
  /** Écritures réelles des confirmations humaines (LOT 14) — FAUX en production. */
  qualification_writes_v2: false,
  /** Enrichissement progressif + matching explicable (LOT 15) — interne. */
  material_enrichment_v2: false,
  /** File intelligente de qualification des demandes de remblai (LOT 16) — interne. */
  qualification_queue_v2: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

const storageKey = (flag: FeatureFlag) => `vq_flag_${flag}`;

/** Lit un drapeau : URL > stockage local > valeur par défaut (false). */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (typeof window === "undefined") return FEATURE_FLAGS[flag];
  try {
    const param = new URLSearchParams(window.location.search).get(flag);
    if (param === "1" || param === "true") {
      window.localStorage.setItem(storageKey(flag), "1");
      return true;
    }
    if (param === "0" || param === "false") {
      window.localStorage.removeItem(storageKey(flag));
      return false;
    }
    return window.localStorage.getItem(storageKey(flag)) === "1";
  } catch {
    return FEATURE_FLAGS[flag];
  }
}

/** Activation/désactivation manuelle (utilisée par les pages d'aperçu interne). */
export function setFeatureEnabled(flag: FeatureFlag, enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(storageKey(flag), "1");
    else window.localStorage.removeItem(storageKey(flag));
  } catch { /* stockage indisponible */ }
}
