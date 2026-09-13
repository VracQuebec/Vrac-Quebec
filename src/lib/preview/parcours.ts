// ============================================================
// PARCOURS PUBLIC — APERÇU INTERNE (LOT 6)
// ------------------------------------------------------------
// Fonctions pures de présentation : traduction humaine des données
// manquantes, regroupement des résultats, phrases de quantité/voyages,
// brouillon temporaire et noms d'événements anonymes.
// Aucune écriture métier, aucune réservation.
// ============================================================
import type { MatchResult } from "@/lib/matching/engine";

export const PARCOURS_PREVIEW_VERSION = "parcours-preview-v1";

export const PARCOURS_STEPS = ["Lieu", "Matériel", "Confirmation", "Résultats"] as const;
export type ParcoursStep = 1 | 2 | 3 | 4;

/** Vitesse moyenne prudente pour une estimation de temps (jamais un temps garanti). */
export const AVERAGE_SPEED_KMH = 55;

export interface TruckOption {
  code: string | null;
  label: string;
}

export const TRUCK_OPTIONS: TruckOption[] = [
  { code: "porteur_6_roues", label: "6 roues" },
  { code: "porteur_10_roues", label: "10 roues" },
  { code: "porteur_12_roues", label: "12 roues" },
  { code: "semi_2_essieux", label: "Semi 2 essieux" },
  { code: "semi_3_essieux", label: "Semi 3 essieux" },
  { code: "semi_4_essieux", label: "Semi 4 essieux" },
  { code: null, label: "Je ne sais pas" },
];

export function truckLabelFor(code: string | null | undefined): string {
  if (!code) return "Non précisé";
  return TRUCK_OPTIONS.find((t) => t.code === code)?.label ?? code.replace(/_/g, " ");
}

/** Temps de route approximatif, en minutes. Toujours présenté comme une estimation. */
export function estimatedMinutes(km: number | null | undefined): number | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  return Math.max(1, Math.round((km / AVERAGE_SPEED_KMH) * 60));
}

// ---------- Données manquantes : formulation humaine ----------

const HUMAN_MISSING: { test: RegExp; text: string }[] = [
  { test: /access_width|largeur/i, text: "Largeur de l'entrée à confirmer" },
  { test: /clear_height|hauteur/i, text: "Hauteur libre à confirmer" },
  { test: /length|longueur/i, text: "Longueur utilisable à confirmer" },
  { test: /turning|rayon/i, text: "Espace pour tourner à confirmer" },
  { test: /slope|pente/i, text: "Pente de l'entrée à confirmer" },
  { test: /surface/i, text: "État du chemin à confirmer" },
  { test: /weight|poids|charge/i, text: "Limite de poids à confirmer" },
  { test: /mat(é|e)riau/i, text: "Ce matériau doit être confirmé avec le site" },
  { test: /distance/i, text: "Distance à confirmer" },
  { test: /capacit/i, text: "Capacité restante à confirmer" },
  { test: /disponib/i, text: "Disponibilité à confirmer avec le site" },
];

/** Traduit les diagnostics techniques en phrases compréhensibles, sans doublon. */
export function humanizeMissing(missing: string[] = []): string[] {
  const out: string[] = [];
  for (const raw of missing) {
    const found = HUMAN_MISSING.find((h) => h.test.test(raw));
    const text = found ? found.text : "Information à confirmer avec le site";
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

// ---------- Regroupement des résultats ----------

export type ResultGroupKey = "meilleurs" | "possibles" | "a_confirmer";

export interface ResultGroups {
  meilleurs: MatchResult[];
  possibles: MatchResult[];
  a_confirmer: MatchResult[];
}

export const GROUP_TITLES: Record<ResultGroupKey, string> = {
  meilleurs: "Meilleurs matchs",
  possibles: "Matchs possibles",
  a_confirmer: "À confirmer",
};

/**
 * Le classement vient du moteur (matériau > disponibilité > distance > accès…).
 * Ici on regroupe seulement : aucun résultat n'est caché.
 */
export function groupResults(results: MatchResult[]): ResultGroups {
  const groups: ResultGroups = { meilleurs: [], possibles: [], a_confirmer: [] };
  for (const r of results) {
    const confirmed = r.material.compatibility === "COMPATIBLE_CONFIRME";
    const probable = r.material.compatibility === "COMPATIBLE_PROBABLE";
    if (confirmed && r.score >= 65 && r.availability.state === "OUI") groups.meilleurs.push(r);
    else if (confirmed || probable) groups.possibles.push(r);
    else groups.a_confirmer.push(r);
  }
  return groups;
}

/** Étiquette simple, sans score brut ni vocabulaire technique. */
export function simpleMatchLabel(result: MatchResult): string {
  if (result.material.compatibility === "COMPATIBLE_CONFIRME" && result.score >= 80) return "Excellent match";
  if (result.score >= 65) return "Très bon match";
  if (result.score >= 45) return "Match possible";
  return "À confirmer";
}

// ---------- Quantité et voyages ----------

export interface TripsSentence {
  text: string;
  kind: "DECLARE" | "ESTIME" | "INCONNU";
}

/** Distingue toujours ce qui est déclaré par la personne de ce qui est estimé. */
export function tripsSentence(input: {
  declaredTrips?: number | null;
  tonnes?: number | null;
  trips?: number | null;
  truckLabel?: string | null;
}): TripsSentence {
  if (input.declaredTrips != null && input.declaredTrips > 0) {
    return { text: `Environ ${input.declaredTrips} voyages déclarés`, kind: "DECLARE" };
  }
  if (input.tonnes != null && input.trips != null && input.trips > 0) {
    const camion = input.truckLabel && input.truckLabel !== "Non précisé" ? ` de ${input.truckLabel.toLowerCase()}` : "";
    return {
      text: `Pour environ ${Math.round(input.tonnes)} tonnes : ≈ ${input.trips} voyages${camion} (estimation)`,
      kind: "ESTIME",
    };
  }
  return { text: "Nombre de voyages à confirmer", kind: "INCONNU" };
}

// ---------- Brouillon temporaire (aucun compte requis) ----------

export const DRAFT_KEY = "vq_parcours_preview_draft";

export interface ParcoursDraft {
  step: ParcoursStep;
  address: string;
  lat: number | null;
  lng: number | null;
  description: string;
  truckCode: string | null;
  answers: Record<string, string>;
  detailed?: boolean;
  updatedAt: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(store?: StorageLike): StorageLike | null {
  if (store) return store;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Omit<ParcoursDraft, "updatedAt">, store?: StorageLike): void {
  const s = storage(store);
  if (!s) return;
  try {
    s.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
  } catch {
    /* le brouillon est un confort, jamais bloquant */
  }
}

export function loadDraft(store?: StorageLike): ParcoursDraft | null {
  const s = storage(store);
  if (!s) return null;
  try {
    const raw = s.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ParcoursDraft;
    return parsed && typeof parsed.description === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(store?: StorageLike): void {
  storage(store)?.removeItem(DRAFT_KEY);
}

// ---------- Analytique interne anonyme ----------

export const PARCOURS_EVENTS = {
  start: "parcours_start",
  aiAnalyse: "parcours_ai_analyse",
  aiCorrection: "parcours_ai_correction",
  search: "parcours_search",
  results: "parcours_results",
  resultClick: "parcours_result_click",
  abandon: "parcours_step_abandon",
} as const;

export type ParcoursEventName = (typeof PARCOURS_EVENTS)[keyof typeof PARCOURS_EVENTS];

const PERSONAL_KEYS = /(nom|name|email|courriel|phone|tel|adresse|address|postal|description|text)/i;

/** Retire tout ce qui pourrait identifier une personne ou un chantier. */
export function anonymizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (PERSONAL_KEYS.test(k)) continue;
    if (typeof v === "string" && v.length > 40) continue;
    out[k] = v;
  }
  return out;
}

/** Clé de session éphémère, non reliée à un compte. */
export function sessionKey(random: () => string = () => Math.random().toString(36).slice(2)): string {
  return `sess_${random()}`;
}
