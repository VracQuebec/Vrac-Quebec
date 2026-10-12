// « Régénérer les erreurs » d'une ville : sélection stricte (garde partagée) puis appel UNITAIRE
// de seo-page-repair pour chaque brouillon visé — le mode « toutes les erreurs » du serveur
// (qui inclut aussi les pages manquantes) n'est plus appelé.
// La sauvegarde avant remplacement et la vérification « non modifié depuis la lecture »
// sont faites par seo-generate-page (version en service).
import { selectRepairTargets, type RepairCandidate, type RepairSkip } from "../../../prepared/seo-generator/_shared/seo-repair-guard";
import { repairSeoPages } from "./useSeoCityMatrix";

export type RepairSlot = RepairCandidate & { material_slug: string | null; service_slug: string | null };

export type RepairOutcome = { done: string[]; failed: Array<{ label: string; error: string }>; skipped: RepairSkip[] };

type Repair = (slot: RepairSlot) => Promise<{ error?: string } | void>;

const defaultRepair: Repair = async (s) => {
  const r = await repairSeoPages({ citySlug: s.key.split("|")[0], materialSlug: s.material_slug, serviceSlug: s.service_slug });
  if ((r as { error?: string })?.error) return { error: (r as { error?: string }).error };
};

export function planRepair(slots: RepairSlot[]) {
  return selectRepairTargets(slots) as { targets: RepairSlot[]; skipped: RepairSkip[] };
}

export async function repairCity(slots: RepairSlot[], repair: Repair = defaultRepair): Promise<RepairOutcome> {
  const { targets, skipped } = planRepair(slots);
  const out: RepairOutcome = { done: [], failed: [], skipped };
  for (const t of targets) {
    try {
      const r = await repair(t);
      if (r && r.error) out.failed.push({ label: t.label, error: r.error });
      else out.done.push(t.label);
    } catch (e) {
      out.failed.push({ label: t.label, error: e instanceof Error ? e.message : "Erreur inconnue" });
    }
  }
  return out;
}

export function repairOutcomeMessage(o: RepairOutcome): string {
  return `${o.done.length} brouillon(s) envoyé(s) en régénération, ${o.failed.length} échec(s), ${o.skipped.length} ignoré(s).`
    + (o.skipped[0] ? ` Ex. ${o.skipped[0].label} : ${o.skipped[0].reason}` : "");
}
