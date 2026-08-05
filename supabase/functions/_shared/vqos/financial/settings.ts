// ============================================================
// MODULE 4 — PARAMÈTRES FINANCIERS
// ------------------------------------------------------------
// Tous les paramètres financiers proviennent de l'administration
// (`jsc_settings`). AUCUNE valeur d'affaires n'est codée ici :
// un paramètre requis absent produit une erreur explicite.
// ============================================================
import type { SettingsMap } from "../core.ts";

export const FINANCIAL_SETTINGS_VERSION = "financial-settings-1.0.0";

export interface FinancialSettingDefinition {
  key: string;
  label: string;
  required: boolean;
}

/** Registre des paramètres financiers. Ajouter une règle = ajouter une ligne. */
export const FINANCIAL_SETTING_DEFINITIONS: FinancialSettingDefinition[] = [
  { key: "time_rounding_minutes", label: "Arrondi du temps facturable (minutes)", required: true },
  { key: "min_billable_minutes", label: "Temps minimum facturable (minutes)", required: true },
  { key: "price_rounding_decimals", label: "Décimales des montants", required: true },
  { key: "margin_percent", label: "Marge (%)", required: true },
  { key: "min_order_amount", label: "Montant minimum de commande ($)", required: false },
];

export interface FinancialSettings {
  time_rounding_minutes: number;
  min_billable_minutes: number;
  price_rounding_decimals: number;
  margin_percent: number;
  min_order_amount: number | null;
  /** Trace : valeur et provenance de chaque paramètre lu. */
  resolved: Array<{ key: string; label: string; value: number | null; source: "settings" | "missing" }>;
}

function readNumber(settings: SettingsMap, key: string): number | null {
  const raw = settings[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Paramètre financier « ${key} » invalide : ${raw}`);
  return n;
}

/** Lit et valide tous les paramètres financiers configurés par l'administration. */
export function resolveFinancialSettings(settings: SettingsMap): FinancialSettings {
  const resolved = FINANCIAL_SETTING_DEFINITIONS.map((def) => {
    const value = readNumber(settings, def.key);
    return { key: def.key, label: def.label, value, source: (value === null ? "missing" : "settings") as "settings" | "missing" };
  });

  const missing = FINANCIAL_SETTING_DEFINITIONS
    .filter((d) => d.required && resolved.find((r) => r.key === d.key)?.value === null)
    .map((d) => d.key);
  if (missing.length) {
    throw new Error(
      `Paramètres financiers manquants : ${missing.join(", ")}. ` +
        "Configurez-les dans Configuration des soumissions › Paramètres généraux.",
    );
  }

  const get = (k: string) => resolved.find((r) => r.key === k)!.value;

  return {
    time_rounding_minutes: get("time_rounding_minutes")!,
    min_billable_minutes: get("min_billable_minutes")!,
    price_rounding_decimals: get("price_rounding_decimals")!,
    margin_percent: get("margin_percent")!,
    min_order_amount: get("min_order_amount"),
    resolved,
  };
}