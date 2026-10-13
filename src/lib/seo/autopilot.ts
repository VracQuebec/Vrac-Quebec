// START — Compléter le SEO : lecture du résumé, lancement et suivi (aucune logique de génération côté navigateur).
import { supabase } from "@/integrations/supabase/client";
import { estimateCredits } from "@/lib/seo/catalogStatus";

export type AutopilotScopes = {
  muni_places: number; muni_published: number; muni_drafts: number;
  other_places: number; other_published: number; other_drafts: number;
  all_published: number; all_drafts: number;
};
export type AutopilotPreview = {
  cities: number; combinations: number; published: number; to_generate: number;
  drafts_to_finish: number; drafts_waiting: number; waiting_evidence: number; excluded: number; global_locked: boolean;
  scopes?: AutopilotScopes;
};

/** Périmètres comparables : municipalités (catalogue START), arrondissements/secteurs (hors START), total. */
export function scopeLines(p: AutopilotPreview): string[] {
  const s = p.scopes;
  if (!s) return ["Répartition par périmètre indisponible (lecture serveur incomplète)."];
  return [
    `Municipalités (${s.muni_places}) — périmètre START : ${p.combinations} combinaisons, ${s.muni_published} pages publiées, ${s.muni_drafts} brouillons.`,
    `Arrondissements et secteurs (${s.other_places}) — hors START, sans combinaisons au catalogue : ${s.other_published} pages publiées, ${s.other_drafts} brouillons (jamais modifiées par START).`,
    `Total général (${s.muni_places + s.other_places} lieux) : ${s.all_published} pages publiées, ${s.all_drafts} brouillons — chiffre des statistiques générales.`,
  ];
}
export type AutopilotStatus = {
  run: null | { id: string; status: string; pause_reason: string | null; started_at: string | null; finished_at: string | null; current_city_slug: string | null };
  cities_total?: number; cities_done?: number; tasks_queued?: number; generated?: number; fixed?: number; published?: number;
  not_published?: number; waiting_evidence?: number; excluded?: number; errors?: number; credits?: number;
  recent_issues?: { city: string; material: string | null; service: string | null; outcome: string | null; reason: string; at: string }[];
};

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
};

export const loadPreview = () => rpc<AutopilotPreview>("seo_autopilot_preview");
export const loadStatus = () => rpc<AutopilotStatus>("seo_autopilot_status");
export const startAutopilot = () => rpc<{ created: boolean; run_id?: string; cities?: number; reason?: string }>("seo_autopilot_start", { _confirm: true });
export const controlAutopilot = (runId: string, action: "pause" | "resume" | "stop") => rpc<{ ok: boolean }>("seo_autopilot_control", { _run_id: runId, _action: action });

/** Lignes du résumé affiché avant la confirmation (chiffres serveur, coût estimé). */
export function previewLines(p: AutopilotPreview): string[] {
  const aiPages = p.to_generate + p.drafts_to_finish;
  return [
    `${p.cities} villes actives, ${p.combinations} combinaisons du catalogue.`,
    `${p.published} pages déjà en ligne : protégées, non modifiées.`,
    `${p.to_generate} pages manquantes à disponibilité confirmée : générées automatiquement.`,
    `${p.drafts_to_finish} brouillons confirmés : qualité recalculée, corrigés si besoin, publiés s'ils respectent tous les critères (note ≥ 90, aucun blocage, noindex volontaire respecté).`,
    `${p.waiting_evidence + p.drafts_waiting} combinaisons sans preuve commerciale : mises en liste d'attente avec la raison, jamais générées ni publiées.`,
    `${p.excluded} combinaisons exclues : ignorées.`,
    `Publications prévues : au plus ${p.to_generate + p.drafts_to_finish} (seulement les pages admissibles).`,
    `Coût IA estimé : environ ${estimateCredits(aiPages)} crédit(s) (génération et régénérations éventuelles en sus).`,
  ];
}

export const isActive = (s: AutopilotStatus | null) => !!s?.run && ["queued", "running", "paused"].includes(s.run.status);
