// ============================================================
// LOT 18 — COUCHE D'AFFICHAGE SÛRE (mojibake / encodage)
// ------------------------------------------------------------
// Fonctions PURES. Elles corrigent uniquement l'AFFICHAGE.
// Aucune donnée historique n'est réécrite : la valeur d'origine
// reste intacte en base et reste disponible via `original`.
// ============================================================

/** Séquences UTF-8 relues en Latin-1 (« Ã© » pour « é »), en minuscules. */
const MOJIBAKE_MAP: [RegExp, string][] = [
  [/Ã©/gi, "é"], [/Ã¨/gi, "è"], [/Ãª/gi, "ê"], [/Ã«/gi, "ë"],
  [/Ã /gi, "à"], [/Ã¢/gi, "â"], [/Ã´/gi, "ô"], [/Ã¶/gi, "ö"],
  [/Ã®/gi, "î"], [/Ã¯/gi, "ï"], [/Ã»/gi, "û"], [/Ã¹/gi, "ù"],
  [/Ã¼/gi, "ü"], [/Ã§/gi, "ç"], [/Å"/g, "œ"], [/Ã‰/g, "É"],
  [/â€™/g, "’"], [/â€˜/g, "‘"], [/â€œ/g, "“"], [/â€\u009d/g, "”"],
  [/â€"/g, "—"], [/Â /g, " "], [/Â/g, ""],
];

/** Détecte une chaîne visiblement mal encodée. */
export function hasMojibake(value: string): boolean {
  return /Ã.|â€.|Â/i.test(value);
}

/** Corrige l'affichage d'une chaîne mal encodée (sans toucher à la donnée source). */
export function fixMojibake(value: string): string {
  let out = value;
  for (const [pattern, replacement] of MOJIBAKE_MAP) out = out.replace(pattern, replacement);
  return out;
}

/** Majuscule intempestive au milieu d'un mot (« PréVost » → « Prévost »). */
function fixInnerCaps(value: string): string {
  return value.replace(/([a-zà-öø-ÿ])([A-ZÀ-ÖØ-Þ])(?=[a-zà-öø-ÿ])/g, (_m, a, b) => a + b.toLowerCase());
}

/** Texte prêt à afficher : encodage corrigé, espaces normalisés. */
export function displayText(value: string | null | undefined, fallback = ""): string {
  if (!value) return fallback;
  const fixed = fixMojibake(value).replace(/\s+/g, " ").trim();
  return fixed || fallback;
}

/** Nom de lieu prêt à afficher (encodage + capitales internes). */
export function displayCity(value: string | null | undefined, fallback = ""): string {
  const text = displayText(value, "");
  if (!text) return fallback;
  return fixInnerCaps(text);
}

/** Rapport d'audit d'affichage : ce qui serait corrigé, sans rien écrire. */
export interface DisplayFix { original: string; displayed: string }

export function auditDisplayValues(values: (string | null | undefined)[]): DisplayFix[] {
  const out: DisplayFix[] = [];
  for (const v of values) {
    if (!v || !hasMojibake(v)) continue;
    const displayed = displayCity(v);
    if (displayed !== v) out.push({ original: v, displayed });
  }
  return out;
}
