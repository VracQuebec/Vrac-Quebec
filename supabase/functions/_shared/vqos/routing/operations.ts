// ============================================================
// MODULE 3 — ÉTAPE 2 : TEMPS OPÉRATIONNELS
// ------------------------------------------------------------
// Architecture ouverte permettant d'ajouter n'importe quel temps
// opérationnel sans modifier le moteur.
//
// RÈGLE ABSOLUE : aucune valeur en dur. Chaque composante lit sa
// valeur dans les paramètres administrateur (`jsc_settings`) ou
// dans le point de chargement / le camion lorsqu'une valeur
// spécifique existe. Une valeur absente n'est jamais remplacée par
// une valeur par défaut : elle est signalée dans `missing`.
// ============================================================
import type { SettingsMap } from "../core.ts";

export const OPERATIONS_MODULE_VERSION = "operations-1.0.0";

/** À quel moment du cycle un temps s'applique. */
export type TimeScope = "per_trip" | "first_trip_only" | "per_quote";

/** Définition déclarative d'une composante de temps. */
export interface TimeComponentDefinition {
  /** Identifiant technique stable. */
  key: string;
  /** Libellé affichable (administration, traces, soumission). */
  label: string;
  /** Clé du paramètre administrateur qui porte la valeur en minutes. */
  setting_key: string;
  scope: TimeScope;
  /** Si vrai, l'absence du paramètre bloque le calcul en aval. */
  required: boolean;
  /** Source prioritaire optionnelle (ex. temps de chargement de la carrière). */
  override?: (ctx: OverrideContext) => number | null | undefined;
}

export interface OverrideContext {
  pickup_loading_time_minutes?: number | null;
  truck_loading_time_minutes?: number | null;
  truck_unloading_time_minutes?: number | null;
  truck_fixed_time_minutes?: number | null;
}

/** Une composante résolue avec sa valeur et sa provenance. */
export interface ResolvedTimeComponent {
  key: string;
  label: string;
  scope: TimeScope;
  minutes: number | null;
  source: "override" | "settings" | "missing";
  setting_key: string;
  required: boolean;
}

export interface OperationalTimeProfile {
  components: ResolvedTimeComponent[];
  /** Accès direct par clé. */
  by_key: Record<string, ResolvedTimeComponent>;
  /** Totaux par portée — matière première du module financier. */
  totals: Record<TimeScope, number>;
  /** Paramètres administrateur manquants (composantes requises). */
  missing: string[];
  module_version: string;
}

/**
 * Registre officiel des temps opérationnels de Transport JSC.
 * Ajouter un temps = ajouter une ligne ici + le paramètre admin.
 * Aucune modification du moteur n'est nécessaire.
 */
export const DEFAULT_TIME_COMPONENTS: TimeComponentDefinition[] = [
  {
    key: "loading",
    label: "Temps de chargement",
    setting_key: "loading_time_minutes",
    scope: "per_trip",
    required: true,
    override: (c) => c.pickup_loading_time_minutes ?? c.truck_loading_time_minutes,
  },
  {
    key: "unloading",
    label: "Temps de déchargement",
    setting_key: "unloading_time_minutes",
    scope: "per_trip",
    required: true,
    override: (c) => c.truck_unloading_time_minutes,
  },
  {
    key: "waiting",
    label: "Temps d'attente",
    setting_key: "waiting_time_minutes",
    scope: "per_trip",
    required: false,
  },
  {
    key: "buffer",
    label: "Temps tampon opérationnel",
    setting_key: "buffer_time_minutes",
    scope: "per_trip",
    required: true,
  },
  {
    key: "additional",
    label: "Temps additionnels",
    setting_key: "additional_time_minutes",
    scope: "per_trip",
    required: false,
  },
  {
    key: "truck_fixed",
    label: "Temps fixe du camion",
    setting_key: "truck_fixed_time_minutes",
    scope: "per_quote",
    required: false,
    override: (c) => c.truck_fixed_time_minutes,
  },
  {
    key: "departure_preparation",
    label: "Préparation au départ",
    setting_key: "departure_preparation_minutes",
    scope: "first_trip_only",
    required: false,
  },
];

function readOptionalMinutes(settings: SettingsMap, key: string): number | null {
  const raw = settings[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Paramètre « ${key} » invalide : ${raw}`);
  return n;
}

/**
 * Résout toutes les composantes de temps déclarées.
 * Ne calcule aucun montant, ne prend aucune décision financière.
 */
export function resolveOperationalTimes(
  settings: SettingsMap,
  overrides: OverrideContext = {},
  definitions: TimeComponentDefinition[] = DEFAULT_TIME_COMPONENTS,
): OperationalTimeProfile {
  const components: ResolvedTimeComponent[] = definitions.map((def) => {
    const overrideValue = def.override?.(overrides);
    const fromOverride = typeof overrideValue === "number" && Number.isFinite(overrideValue)
      ? overrideValue
      : null;
    const fromSettings = readOptionalMinutes(settings, def.setting_key);
    const minutes = fromOverride ?? fromSettings;
    return {
      key: def.key,
      label: def.label,
      scope: def.scope,
      minutes,
      source: fromOverride !== null ? "override" : fromSettings !== null ? "settings" : "missing",
      setting_key: def.setting_key,
      required: def.required,
    };
  });

  const totals: Record<TimeScope, number> = { per_trip: 0, first_trip_only: 0, per_quote: 0 };
  for (const c of components) totals[c.scope] += c.minutes ?? 0;

  return {
    components,
    by_key: Object.fromEntries(components.map((c) => [c.key, c])),
    totals,
    missing: components.filter((c) => c.required && c.minutes === null).map((c) => c.setting_key),
    module_version: OPERATIONS_MODULE_VERSION,
  };
}

/** Bloque explicitement si un temps obligatoire n'est pas configuré. */
export function assertOperationalTimes(profile: OperationalTimeProfile) {
  if (profile.missing.length) {
    throw new Error(
      `Temps opérationnels manquants : ${profile.missing.join(", ")}. ` +
        "Configurez-les dans Configuration des soumissions › Paramètres généraux.",
    );
  }
}