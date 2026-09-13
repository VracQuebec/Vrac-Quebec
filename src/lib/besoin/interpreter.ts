// ============================================================
// LOT 7 — ASSISTANT IA « J'AI BESOIN DE MATÉRIAUX »
// ------------------------------------------------------------
// Interprétation de texte libre (langage de chantier québécois)
// vers une demande de remblai structurée.
//
// Règles absolues :
//  - INTERNE / APERÇU seulement : rien n'est branché sur le
//    formulaire public, aucune demande réelle n'est créée ici.
//  - Le texte original n'est JAMAIS écrasé.
//  - Trois états partout : ACCEPTE / REFUSE / A_CONFIRMER.
//    Une information inconnue n'est jamais un refus.
//  - « propre », « contaminé », « non contaminé » restent des
//    DÉCLARATIONS, jamais une classification environnementale.
//  - Les conversions voyages ↔ tonnes sont toujours des ESTIMATIONS.
//  - Aucune capacité restante n'est diminuée automatiquement.
// ============================================================

import {
  DEFAULT_SYNONYMS, MATERIAL_LABELS, interpretDescription, normalize,
  type FieldConfidence, type MaterialKey, type Presence, type SynonymEntry,
} from "@/lib/matching/interpreter";
import type { QuantityUnit } from "@/lib/matching/engine";

export const BESOIN_INTERPRETER_VERSION = "besoin-ia-v1";

export const BESOIN_STEPS = ["Endroit", "Ce que vous pouvez recevoir", "Accès / quantité", "Confirmation"] as const;
export type BesoinStep = 1 | 2 | 3 | 4;

export type Stance = "ACCEPTE" | "REFUSE" | "A_CONFIRMER";

export interface MaterialStance {
  key: MaterialKey;
  label: string;
  stance: Stance;
  confidence: FieldConfidence;
  /** Expression du texte d'origine ayant produit cette décision. */
  matchedExpression: string | null;
  /** Suggestion d'élargissement proposée par l'assistant (jamais cochée d'office). */
  suggested?: boolean;
  note?: string;
}

export type TruckCode =
  | "porteur_6_roues" | "porteur_10_roues" | "porteur_12_roues"
  | "semi_2_essieux" | "semi_3_essieux" | "semi_4_essieux";

export const BESOIN_TRUCKS: { code: TruckCode; label: string; isSemi: boolean }[] = [
  { code: "porteur_6_roues", label: "6 roues", isSemi: false },
  { code: "porteur_10_roues", label: "10 roues", isSemi: false },
  { code: "porteur_12_roues", label: "12 roues", isSemi: false },
  { code: "semi_2_essieux", label: "Semi 2 essieux", isSemi: true },
  { code: "semi_3_essieux", label: "Semi 3 essieux", isSemi: true },
  { code: "semi_4_essieux", label: "Semi 4 essieux", isSemi: true },
];

export interface ScheduleInfo {
  /** Texte exactement tel qu'écrit — jamais remplacé. */
  originalText: string | null;
  weekdays: Presence;
  weekend: Presence;
  morningsOnly: boolean;
  byAppointment: boolean;
  callBefore: boolean;
  anytime: boolean;
  summary: string | null;
}

export interface AccessInfo {
  /** Un tracteur semi-remorque peut-il entrer et ressortir ? */
  semiAccess: Presence;
  tight: boolean;
  entranceWidthFeet: number | null;
  clearHeightFeet: number | null;
  weightRestriction: Presence;
  gate: Presence;
  notes: string[];
}

export interface CapacityInfo {
  initialQuantity: number | null;
  remainingQuantity: number | null;
  unit: QuantityUnit | null;
  source: "DECLARE" | "ESTIME" | "INCONNU";
  lastUpdated: string | null;
  /** Toujours faux dans ce lot : aucune diminution automatique. */
  autoDecrement: false;
}

export interface BesoinInterpretation {
  originalText: string;
  normalizedText: string;
  accepted: MaterialStance[];
  refused: MaterialStance[];
  toConfirm: MaterialStance[];
  quantity: number | null;
  unit: QuantityUnit | null;
  quantityIsApproximate: boolean;
  quantityUnknown: boolean;
  quantityLarge: boolean;
  trips: number | null;
  maxSizeInches: number | null;
  maxSizeLabel: string | null;
  trucks: Record<TruckCode, Stance>;
  schedule: ScheduleInfo;
  access: AccessInfo;
  startDate: string | null;
  endDate: string | null;
  dates: string[];
  driverInstructions: string[];
  /** Déclarations utilisateur non vérifiées (propre, non contaminé…). */
  declarations: string[];
  location: string | null;
  fieldConfidence: Record<string, FieldConfidence>;
  notes: string[];
  version: string;
}

// ---------------- Refus ----------------

const REFUSAL_MARKERS = [
  "pas de", "pas d", "aucun", "aucune", "sans", "sauf", "rien de", "rien d",
  "je ne prends pas", "je prends pas", "on prend pas", "refuse", "excepte", "a part",
];
const SEGMENT_END = /,|\.|;|\bmais\b|\bpar contre\b|\bet je\b/;

interface Segment { text: string; start: number; end: number }

/** Isole les segments de refus du texte normalisé (« pas mal de » n'est PAS un refus). */
export function refusalSegments(normalized: string): Segment[] {
  const out: Segment[] = [];
  for (const marker of REFUSAL_MARKERS) {
    const re = new RegExp(`\\b${marker}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized))) {
      const afterStart = m.index + m[0].length;
      const rest = normalized.slice(afterStart);
      if (/^\s*mal\b/.test(rest)) continue; // « pas mal de » = beaucoup
      const stop = rest.search(SEGMENT_END);
      const end = stop >= 0 ? afterStart + stop : normalized.length;
      out.push({ text: normalized.slice(afterStart, end).trim(), start: m.index, end });
    }
  }
  return out.filter((s) => s.text.length > 0);
}

function materialsIn(segment: string, synonyms: SynonymEntry[]) {
  if (!segment.trim()) return [];
  return interpretDescription(segment, synonyms).materials;
}

// ---------------- Suggestions d'élargissement ----------------

const SUGGESTION_RULES: { when: MaterialKey[]; suggest: MaterialKey[] }[] = [
  { when: ["terre"], suggest: ["terre_excavation", "sable", "argile"] },
  { when: ["sable"], suggest: ["terre"] },
  { when: ["argile"], suggest: ["terre"] },
  { when: ["pierre"], suggest: ["terre_excavation"] },
  { when: ["terre_excavation"], suggest: ["terre", "pierre"] },
];

/**
 * Propose des matériaux compatibles supplémentaires pour éviter une demande
 * trop restrictive. Rien n'est accepté automatiquement : tout reste À CONFIRMER.
 */
export function suggestAdditionalMaterials(
  accepted: MaterialStance[],
  refused: MaterialStance[],
): MaterialStance[] {
  const acceptedKeys = new Set(accepted.map((m) => m.key));
  const refusedKeys = new Set(refused.map((m) => m.key));
  const out = new Map<MaterialKey, MaterialStance>();
  for (const rule of SUGGESTION_RULES) {
    if (!rule.when.some((k) => acceptedKeys.has(k))) continue;
    for (const key of rule.suggest) {
      if (acceptedKeys.has(key) || refusedKeys.has(key) || out.has(key)) continue;
      out.set(key, {
        key,
        label: MATERIAL_LABELS[key],
        stance: "A_CONFIRMER",
        confidence: "FAIBLE",
        matchedExpression: null,
        suggested: true,
        note: "Suggestion d'élargissement — à confirmer par le propriétaire",
      });
    }
  }
  return [...out.values()];
}

// ---------------- Camions ----------------

const TRUCK_PATTERNS: { code: TruckCode; re: RegExp }[] = [
  { code: "porteur_6_roues", re: /\b6\s*roues?\b|petits?\s*camions?/ },
  { code: "porteur_10_roues", re: /\b10\s*roues?\b/ },
  { code: "porteur_12_roues", re: /\b12\s*roues?\b/ },
  { code: "semi_2_essieux", re: /semi\s*(?:remorques?\s*)?(?:a\s*)?2\s*essieux/ },
  { code: "semi_3_essieux", re: /semi\s*(?:remorques?\s*)?(?:a\s*)?3\s*essieux/ },
  { code: "semi_4_essieux", re: /semi\s*(?:remorques?\s*)?(?:a\s*)?4\s*essieux/ },
];
const GENERIC_SEMI = /\bsemis?\b|\bsemi\s*remorques?\b|\bfardiers?\b|\btracteurs?\s*remorques?\b/;

export function detectTrucks(normalized: string): Record<TruckCode, Stance> {
  const state = {} as Record<TruckCode, Stance>;
  for (const t of BESOIN_TRUCKS) state[t.code] = "A_CONFIRMER";

  if (/tout\s*rentre|tout\s*passe|n\s*importe\s*quel\s*camion|tous\s*les\s*camions|toute\s*sorte\s*de\s*camion/.test(normalized)) {
    for (const t of BESOIN_TRUCKS) state[t.code] = "ACCEPTE";
    return state;
  }

  const refusals = refusalSegments(normalized);
  const refusedCodes = new Set<TruckCode>();
  for (const seg of refusals) {
    for (const p of TRUCK_PATTERNS) if (p.re.test(seg.text)) refusedCodes.add(p.code);
    if (GENERIC_SEMI.test(seg.text)) {
      for (const t of BESOIN_TRUCKS) if (t.isSemi) refusedCodes.add(t.code);
    }
  }

  // Texte hors segments de refus (pour ne pas accepter ce qui est refusé).
  let positive = normalized;
  for (const seg of refusals) positive = positive.replace(seg.text, " ");

  const mentioned = new Set<TruckCode>();
  for (const p of TRUCK_PATTERNS) if (p.re.test(positive)) mentioned.add(p.code);
  if (GENERIC_SEMI.test(positive)) {
    const specific = BESOIN_TRUCKS.filter((t) => t.isSemi && mentioned.has(t.code));
    if (specific.length === 0) for (const t of BESOIN_TRUCKS) if (t.isSemi) mentioned.add(t.code);
  }

  for (const code of mentioned) state[code] = "ACCEPTE";
  for (const code of refusedCodes) state[code] = "REFUSE";

  const exclusive = /\bseulement\b|\buniquement\b|\brien que\b|\bjuste des?\b/.test(positive);
  if (exclusive && mentioned.size > 0) {
    for (const t of BESOIN_TRUCKS) if (!mentioned.has(t.code)) state[t.code] = "REFUSE";
  }
  return state;
}

// ---------------- Horaires ----------------

export function detectSchedule(originalText: string, normalized: string): ScheduleInfo {
  const weekdays: Presence =
    /ouvert la semaine|la semaine|lundi au vendredi|lun au ven|jours de semaine|semaine seulement/.test(normalized) ? "OUI" : "INCONNU";
  const weekend: Presence =
    /fin de semaine|samedi|dimanche|week ?end/.test(normalized)
      ? (refusalSegments(normalized).some((s) => /fin de semaine|samedi|dimanche|week ?end/.test(s.text)) ? "NON" : "OUI")
      : "INCONNU";
  const morningsOnly = /seulement le matin|le matin seulement|avant midi|am seulement/.test(normalized);
  const byAppointment = /sur rendez vous|sur rdv|rendez vous/.test(normalized);
  const callBefore = /appel(?:er|ez)?\s*avant|telephoner avant|call avant|avertir avant/.test(normalized);
  const anytime = /n importe quand|en tout temps|24\s*7|toujours ouvert/.test(normalized);

  const bits: string[] = [];
  if (anytime) bits.push("N'importe quand");
  if (weekdays === "OUI") bits.push("Lundi au vendredi");
  if (weekend === "OUI") bits.push("Fin de semaine");
  if (weekend === "NON") bits.push("Pas la fin de semaine");
  if (morningsOnly) bits.push("Le matin seulement");
  if (byAppointment) bits.push("Sur rendez-vous");
  if (callBefore) bits.push("Appeler avant");

  const sentence = (originalText.match(/[^.;\n]*\b(semaine|matin|rendez|appel|lundi|samedi|dimanche|quand)\b[^.;\n]*/i) ?? [null])[0];

  return {
    originalText: sentence ? sentence.trim() : null,
    weekdays, weekend, morningsOnly, byAppointment, callBefore, anytime,
    summary: bits.length ? bits.join(" · ") : null,
  };
}

// ---------------- Accès ----------------

const FEET = /(\d+(?:[.,]\d+)?)\s*(pieds?|pi\b|ft\b)/;

export function detectAccess(originalText: string, normalized: string): AccessInfo {
  const refusals = refusalSegments(normalized);
  const semiRefused = refusals.some((s) => GENERIC_SEMI.test(s.text));
  const semiOk = !semiRefused && /(semis?|semi remorques?|fardiers?)[^.;]{0,30}(rentre|rentrent|passe|passent|entre|entrent|accepte|acceptes|ok)/.test(normalized);
  const tight = /c est serre|cest serre|serre|juste juste|tight|tres etroit|etroit/.test(normalized);

  const widthM = normalized.match(new RegExp(`(?:entree|largeur|large)[^.;]{0,20}${FEET.source}`));
  const heightM = normalized.match(new RegExp(`(?:hauteur|haut|fils|degagement)[^.;]{0,20}${FEET.source}`));
  const num = (s?: string) => (s ? Number(s.replace(",", ".")) : null);

  const notes: string[] = [];
  if (tight) notes.push("Accès déclaré serré — à valider sur place");

  return {
    semiAccess: semiOk ? "OUI" : semiRefused ? "NON" : "INCONNU",
    tight,
    entranceWidthFeet: num(widthM?.[1]),
    clearHeightFeet: num(heightM?.[1]),
    weightRestriction: /limite de poids|restriction de poids|charge limite|pont limite/.test(normalized) ? "OUI" : "INCONNU",
    gate: /barriere|portail|cloture|clôture/.test(normalized) ? "OUI" : "INCONNU",
    notes,
  };
}

// ---------------- Instructions chauffeur ----------------

const DRIVER_HINTS = /(appel|telephon|téléphon|entrer par|entree|entrée|reculer|recul|barriere|barrière|portail|domper|klaxon|chien|garage|deuxieme|deuxième|sonner|avertir)/i;

export function detectDriverInstructions(originalText: string): string[] {
  return (originalText.split(/[.;\n]/).map((s) => s.trim()).filter(Boolean))
    .filter((s) => DRIVER_HINTS.test(s))
    .slice(0, 5);
}

// ---------------- Interprétation complète ----------------

export function interpretBesoin(
  originalText: string,
  synonyms: SynonymEntry[] = DEFAULT_SYNONYMS,
): BesoinInterpretation {
  const normalized = normalize(originalText);
  const base = interpretDescription(originalText, synonyms);

  const refusals = refusalSegments(normalized);
  const refusedMap = new Map<MaterialKey, MaterialStance>();
  for (const seg of refusals) {
    for (const m of materialsIn(seg.text, synonyms)) {
      if (m.key === "materiel_inconnu") continue;
      refusedMap.set(m.key, {
        key: m.key, label: m.label, stance: "REFUSE",
        confidence: m.confidence, matchedExpression: m.matchedExpression, note: m.note,
      });
    }
  }

  let positiveText = normalized;
  for (const seg of refusals) positiveText = positiveText.replace(seg.text, " ");

  const acceptedMap = new Map<MaterialKey, MaterialStance>();
  for (const m of materialsIn(positiveText, synonyms)) {
    if (refusedMap.has(m.key)) continue;
    acceptedMap.set(m.key, {
      key: m.key, label: m.label,
      stance: m.confidence === "FAIBLE" ? "A_CONFIRMER" : "ACCEPTE",
      confidence: m.confidence, matchedExpression: m.matchedExpression, note: m.note,
    });
  }

  const accepted = [...acceptedMap.values()].filter((m) => m.stance === "ACCEPTE");
  const lowConfidence = [...acceptedMap.values()].filter((m) => m.stance === "A_CONFIRMER");
  const refused = [...refusedMap.values()];
  const toConfirm = [...lowConfidence, ...suggestAdditionalMaterials(accepted, refused)];

  const quantityUnknown = /je sais pas combien|je ne sais pas combien|sais pas combien|aucune idee de la quantite/.test(normalized);
  const quantityLarge = /beaucoup|pas mal de|en masse|illimite|autant que|le plus possible|gros volume/.test(normalized);

  const schedule = detectSchedule(originalText, normalized);
  const access = detectAccess(originalText, normalized);
  const trucks = detectTrucks(normalized);
  if (access.semiAccess === "OUI") {
    for (const t of BESOIN_TRUCKS) if (t.isSemi && trucks[t.code] === "A_CONFIRMER") trucks[t.code] = "ACCEPTE";
  }

  const declarations: string[] = [];
  if (/\bpropre\b|non contamine|pas contamine/.test(normalized)) {
    declarations.push("Déclaré « propre / non contaminé » par la personne — déclaration non vérifiée");
  }
  if (/contamine/.test(normalized) && !/non contamine|pas contamine/.test(normalized)) {
    declarations.push("Mention de contamination — déclaration non vérifiée, à valider");
  }

  const fieldConfidence: Record<string, FieldConfidence> = {
    ...base.fieldConfidence,
    materiaux: accepted.length > 0 ? "ELEVEE" : "FAIBLE",
    camions: Object.values(trucks).some((s) => s !== "A_CONFIRMER") ? "MOYENNE" : "FAIBLE",
    horaires: schedule.summary ? "MOYENNE" : "FAIBLE",
    acces: access.semiAccess !== "INCONNU" ? "MOYENNE" : "FAIBLE",
  };

  const notes = [...base.notes];
  if (access.tight) notes.push("Le texte mentionne un accès serré : gabarits à valider.");
  if (quantityLarge && base.quantity == null) notes.push("Quantité exprimée de façon vague (« beaucoup ») — à confirmer.");

  return {
    originalText,
    normalizedText: normalized,
    accepted,
    refused,
    toConfirm,
    quantity: base.quantity,
    unit: base.unit,
    quantityIsApproximate: base.quantityIsApproximate,
    quantityUnknown,
    quantityLarge,
    trips: base.trips,
    maxSizeInches: base.maxSizeInches,
    maxSizeLabel: base.maxSizeLabel,
    trucks,
    schedule,
    access,
    startDate: base.dates[0] ?? null,
    endDate: base.dates[1] ?? null,
    dates: base.dates,
    driverInstructions: detectDriverInstructions(originalText),
    declarations,
    location: base.location,
    fieldConfidence,
    notes,
    version: BESOIN_INTERPRETER_VERSION,
  };
}

// ---------------- Complétude ----------------

export type CompletenessLevel = "EXCELLENT" | "BON" | "UTILISABLE" | "A_COMPLETER";

export interface Completeness {
  level: CompletenessLevel;
  score: number;
  /** Informations importantes manquantes, formulées simplement. */
  missing: string[];
  /** Une demande imparfaite reste toujours utilisable. */
  usable: true;
}

export function scoreCompleteness(
  interp: BesoinInterpretation,
  opts: { hasLocation: boolean } = { hasLocation: false },
): Completeness {
  const missing: string[] = [];
  let score = 0;

  if (opts.hasLocation) score += 30;
  else missing.push("Où est le site ?");

  if (interp.accepted.length > 0) score += 25;
  else missing.push("Quels matériaux pouvez-vous recevoir ?");

  if (interp.quantity != null || interp.trips != null || interp.quantityLarge) score += 20;
  else missing.push("Environ quelle quantité pouvez-vous recevoir ?");

  const semiKnown = Object.entries(interp.trucks).some(([code, s]) => code.startsWith("semi_") && s !== "A_CONFIRMER");
  if (semiKnown || interp.access.semiAccess !== "INCONNU") score += 15;
  else missing.push("Les semi-remorques peuvent-elles entrer ?");

  if (interp.schedule.summary) score += 10;
  else missing.push("Quand peut-on livrer ?");

  const level: CompletenessLevel =
    score >= 85 ? "EXCELLENT" : score >= 65 ? "BON" : score >= 40 ? "UTILISABLE" : "A_COMPLETER";

  return { level, score, missing: missing.slice(0, 3), usable: true };
}

// ---------------- Capacité (jamais décrémentée dans ce lot) ----------------

export function buildCapacity(interp: BesoinInterpretation, now: string | null = null): CapacityInfo {
  const declared = interp.quantity;
  return {
    initialQuantity: declared,
    remainingQuantity: declared,
    unit: interp.unit,
    source: declared != null ? "DECLARE" : interp.trips != null ? "ESTIME" : "INCONNU",
    lastUpdated: now,
    autoDecrement: false,
  };
}

// ---------------- Dédoublonnage (jamais de fusion automatique) ----------------

export interface ExistingRequestLite {
  id: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  createdAt: string | null;
  isArchived?: boolean;
}

export interface DuplicateHit {
  request: ExistingRequestLite;
  distanceKm: number | null;
  reason: "ADRESSE" | "PROXIMITE";
  /** Une ancienne demande ne peut être que PROPOSÉE à la vérification admin. */
  suggestReviewOnly: true;
}

const R = 6371;
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Détecte des doublons probables. Ne fusionne jamais, ne réactive jamais. */
export function detectDuplicates(
  target: { address?: string | null; lat?: number | null; lng?: number | null },
  existing: ExistingRequestLite[],
  radiusKm = 0.3,
): DuplicateHit[] {
  const addr = normalize(target.address ?? "");
  const hits: DuplicateHit[] = [];
  for (const r of existing) {
    const sameAddress = addr.length > 6 && normalize(r.address ?? "") === addr;
    let km: number | null = null;
    if (target.lat != null && target.lng != null && r.latitude != null && r.longitude != null) {
      km = haversineKm({ lat: target.lat, lng: target.lng }, { lat: Number(r.latitude), lng: Number(r.longitude) });
    }
    if (sameAddress || (km != null && km <= radiusKm)) {
      hits.push({ request: r, distanceKm: km, reason: sameAddress ? "ADRESSE" : "PROXIMITE", suggestReviewOnly: true });
    }
  }
  return hits.sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99)).slice(0, 5);
}

// ---------------- Données structurées (mode simple = mode détaillé) ----------------

export interface BesoinStructuredData {
  original_user_description: string;
  structured: {
    accepted_materials: MaterialKey[];
    refused_materials: MaterialKey[];
    to_confirm_materials: MaterialKey[];
    quantity: number | null;
    unit: QuantityUnit | null;
    quantity_unknown: boolean;
    trips: number | null;
    max_size_inches: number | null;
    max_size_label: string | null;
    trucks: Record<TruckCode, Stance>;
    schedule: ScheduleInfo;
    access: AccessInfo;
    capacity: CapacityInfo;
    start_date: string | null;
    end_date: string | null;
    driver_instructions: string[];
    declarations: string[];
    photos: string[];
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    /** L'adresse privée n'est jamais exposée sans règle explicite. */
    address_visibility: "PRIVEE";
    completeness: Completeness;
    field_confidence: Record<string, FieldConfidence>;
  };
  interpreter_version: string;
}

export function toBesoinStructuredData(
  interp: BesoinInterpretation,
  opts: {
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    photos?: string[];
    /** Décisions humaines sur les matériaux à confirmer. */
    confirmations?: Partial<Record<MaterialKey, Stance>>;
    trucksOverride?: Partial<Record<TruckCode, Stance>>;
    now?: string | null;
  } = {},
): BesoinStructuredData {
  const accepted = new Set(interp.accepted.map((m) => m.key));
  const refused = new Set(interp.refused.map((m) => m.key));
  const toConfirm = new Set(interp.toConfirm.map((m) => m.key));

  for (const [key, stance] of Object.entries(opts.confirmations ?? {}) as [MaterialKey, Stance][]) {
    accepted.delete(key); refused.delete(key); toConfirm.delete(key);
    if (stance === "ACCEPTE") accepted.add(key);
    else if (stance === "REFUSE") refused.add(key);
    else toConfirm.add(key);
  }

  const trucks = { ...interp.trucks, ...(opts.trucksOverride ?? {}) } as Record<TruckCode, Stance>;

  return {
    original_user_description: interp.originalText,
    structured: {
      accepted_materials: [...accepted],
      refused_materials: [...refused],
      to_confirm_materials: [...toConfirm],
      quantity: interp.quantity,
      unit: interp.unit,
      quantity_unknown: interp.quantityUnknown || (interp.quantity == null && interp.trips == null),
      trips: interp.trips,
      max_size_inches: interp.maxSizeInches,
      max_size_label: interp.maxSizeLabel,
      trucks,
      schedule: interp.schedule,
      access: interp.access,
      capacity: buildCapacity(interp, opts.now ?? null),
      start_date: interp.startDate,
      end_date: interp.endDate,
      driver_instructions: interp.driverInstructions,
      declarations: interp.declarations,
      photos: opts.photos ?? [],
      address: opts.address ?? null,
      latitude: opts.lat ?? null,
      longitude: opts.lng ?? null,
      address_visibility: "PRIVEE",
      completeness: scoreCompleteness(interp, { hasLocation: opts.lat != null && opts.lng != null }),
      field_confidence: interp.fieldConfidence,
    },
    interpreter_version: BESOIN_INTERPRETER_VERSION,
  };
}
