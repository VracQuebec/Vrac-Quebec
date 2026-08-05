// ============================================================
// MODULE 4 — SUPPLÉMENTS ET FRAIS FIXES
// ------------------------------------------------------------
// Registre déclaratif : ajouter un supplément ou un frais fixe
// consiste à ajouter une ligne ici + le paramètre administrateur
// correspondant. Aucun montant n'est codé dans le moteur.
// ============================================================
import type { SettingsMap } from "../core.ts";

export const CHARGES_MODULE_VERSION = "charges-1.0.0";

/** Sur quoi la valeur du paramètre s'applique. */
export type ChargeBasis =
  | "percent_of_transport"
  | "percent_of_material"
  | "percent_of_base"
  | "fixed_per_quote"
  | "fixed_per_trip"
  | "fixed_per_km"
  | "fixed_per_tonne";

export interface ChargeDefinition {
  key: string;
  label: string;
  /** Paramètre administrateur qui porte la valeur (% ou $). */
  setting_key: string;
  basis: ChargeBasis;
  kind: "surcharge" | "fixed_fee";
}

/** Registre officiel Transport JSC. 100 % paramétrable. */
export const DEFAULT_CHARGE_DEFINITIONS: ChargeDefinition[] = [
  { key: "fuel", label: "Supplément carburant", setting_key: "fuel_surcharge_percent", basis: "percent_of_transport", kind: "surcharge" },
  { key: "distance", label: "Supplément kilométrage", setting_key: "distance_surcharge_per_km", basis: "fixed_per_km", kind: "surcharge" },
  { key: "trip_fee", label: "Frais par voyage", setting_key: "trip_fee_amount", basis: "fixed_per_trip", kind: "fixed_fee" },
  { key: "environmental", label: "Frais environnementaux", setting_key: "environmental_fee_per_tonne", basis: "fixed_per_tonne", kind: "fixed_fee" },
  { key: "administration", label: "Frais d'administration", setting_key: "administration_fee_amount", basis: "fixed_per_quote", kind: "fixed_fee" },
];

export interface ChargeContext {
  transport_amount: number;
  material_amount: number;
  trips: number;
  distance_km: number;
  tonnage: number;
}

export interface ComputedCharge {
  key: string;
  label: string;
  kind: "surcharge" | "fixed_fee";
  basis: ChargeBasis;
  setting_key: string;
  /** Valeur du paramètre administrateur (pourcentage ou montant unitaire). */
  rate: number;
  amount: number;
  /** Explication lisible de la ligne. */
  detail: string;
  configured: boolean;
}

function readRate(settings: SettingsMap, key: string): number | null {
  const raw = settings[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Paramètre « ${key} » invalide : ${raw}`);
  return n;
}

const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("fr-CA");

/** Calcule tous les suppléments et frais fixes configurés. */
export function computeCharges(
  settings: SettingsMap,
  ctx: ChargeContext,
  definitions: ChargeDefinition[] = DEFAULT_CHARGE_DEFINITIONS,
): { charges: ComputedCharge[]; surcharges_total: number; fixed_fees_total: number; total: number } {
  const base = ctx.transport_amount + ctx.material_amount;
  const charges: ComputedCharge[] = definitions.map((def) => {
    const rate = readRate(settings, def.setting_key);
    const r = rate ?? 0;
    let amount = 0;
    let detail = "";
    switch (def.basis) {
      case "percent_of_transport":
        amount = ctx.transport_amount * (r / 100);
        detail = `${r} % de ${fmt(ctx.transport_amount)} $ (transport)`;
        break;
      case "percent_of_material":
        amount = ctx.material_amount * (r / 100);
        detail = `${r} % de ${fmt(ctx.material_amount)} $ (matériau)`;
        break;
      case "percent_of_base":
        amount = base * (r / 100);
        detail = `${r} % de ${fmt(base)} $ (transport + matériau)`;
        break;
      case "fixed_per_quote":
        amount = r;
        detail = `${fmt(r)} $ par soumission`;
        break;
      case "fixed_per_trip":
        amount = r * ctx.trips;
        detail = `${fmt(r)} $ × ${ctx.trips} voyage(s)`;
        break;
      case "fixed_per_km":
        amount = r * ctx.distance_km;
        detail = `${fmt(r)} $ × ${fmt(ctx.distance_km)} km`;
        break;
      case "fixed_per_tonne":
        amount = r * ctx.tonnage;
        detail = `${fmt(r)} $ × ${fmt(ctx.tonnage)} t`;
        break;
      default:
        throw new Error(`Base de calcul inconnue : ${def.basis}`);
    }
    return {
      key: def.key, label: def.label, kind: def.kind, basis: def.basis,
      setting_key: def.setting_key, rate: r, amount, detail, configured: rate !== null,
    };
  });

  const sum = (kind: "surcharge" | "fixed_fee") =>
    charges.filter((c) => c.kind === kind).reduce((s, c) => s + c.amount, 0);

  const surcharges = sum("surcharge");
  const fees = sum("fixed_fee");
  return { charges, surcharges_total: surcharges, fixed_fees_total: fees, total: surcharges + fees };
}