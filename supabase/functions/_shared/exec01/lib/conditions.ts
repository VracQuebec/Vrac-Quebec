import { z } from "npm:zod@4.6.6";

export const WAITING_MESSAGE = "Votre demande est active. Aucune livraison n’est confirmée. Nous vous contacterons lorsqu’une proposition compatible sera disponible dans votre secteur. Les disponibilités dépendent des chantiers; aucune date ne peut être garantie à ce stade.";
const text = z.string().trim().max(2000).nullable();
const amount = z.number().finite().nonnegative().max(999999).nullable();
const answer = z.enum(["oui", "non", "inconnu"]);
export const preference = z.enum(["accepte", "refuse", "a_confirmer"]);
export const conditionsSchema = z.object({
  total: amount, remaining: amount, unit: z.enum(["tonnes", "m3", "verges3", "voyages", "inconnu"]),
  minimumDelivery: amount, minimumDay: amount, progressive: answer,
  materials: z.array(z.object({ name: z.string().trim().min(1).max(120), stance: preference })).max(30),
  mixed: preference, mixedDetails: text, maxRockCm: amount,
  vehicles: z.array(z.object({ name: z.string().max(120), stance: preference })).max(12),
  access: text, hours: text, presence: answer, instructions: text,
  photos: z.array(z.object({ name: z.string().max(200), preview: z.string().max(7000000) })).max(8),
  mode: z.enum(["a_confirmer", "preautorisee", "creneaux", "par_demande"]),
  periodStart: z.string().max(30).nullable(), periodEnd: z.string().max(30).nullable(),
  slots: text, explicitConditions: text,
  environmental: z.enum(["a_valider", "documente", "non_admissible"]), projectFit: z.enum(["a_valider", "adapte", "incompatible"]),
  promotional: z.boolean(),
}).strict().superRefine((v, ctx) => {
  if (v.remaining != null && v.total != null && v.remaining > v.total) ctx.addIssue({ code: "custom", path: ["remaining"], message: "Le besoin restant ne peut pas dépasser la quantité totale." });
  if (v.unit === "inconnu" && [v.total, v.remaining, v.minimumDelivery, v.minimumDay].some(n => n != null)) ctx.addIssue({ code: "custom", path: ["unit"], message: "Précisez l’unité d’origine ou laissez les quantités inconnues." });
  if (v.mode === "preautorisee" && (!v.periodStart || !v.periodEnd || !v.explicitConditions || v.periodEnd < v.periodStart)) ctx.addIssue({ code: "custom", path: ["mode"], message: "Indiquez une période valide et les conditions explicites de réception." });
  if (v.mode === "creneaux" && !v.slots) ctx.addIssue({ code: "custom", path: ["slots"], message: "Précisez les créneaux souhaités." });
});
export type ReceptionConditions = z.infer<typeof conditionsSchema>;
export const MATERIAL_NAMES = ["Terre", "Sable", "Glaise", "Gravier", "Roche", "Béton", "Asphalte", "Branches", "Souches", "Déchets"];
export function unknownConditions(): ReceptionConditions {
  return { total: null, remaining: null, unit: "inconnu", minimumDelivery: null, minimumDay: null, progressive: "inconnu", materials: MATERIAL_NAMES.map(name => ({ name, stance: "a_confirmer" })), mixed: "a_confirmer", mixedDetails: null, maxRockCm: null, vehicles: ["6 roues", "10 roues", "12 roues", "Semi-remorque"].map(name => ({ name, stance: "a_confirmer" })), access: null, hours: null, presence: "inconnu", instructions: null, photos: [], mode: "a_confirmer", periodStart: null, periodEnd: null, slots: null, explicitConditions: null, environmental: "a_valider", projectFit: "a_valider", promotional: false };
}
export function quantityLabel(value: number | null, unit: ReceptionConditions["unit"]) {
  return value == null || unit === "inconnu" ? "Inconnu" : `${value.toLocaleString("fr-CA")} ${unit === "m3" ? "m³" : unit === "verges3" ? "verges³" : unit}`;
}