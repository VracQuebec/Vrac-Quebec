import type { MySubmission } from "./mes-demandes";
import { NEED_LABELS, needDirection } from "./sens-besoin";

/** Lien transport ↔ demande : seulement par identifiant explicite, jamais par nom ou adresse. */
export const isTransportLinked = (
  t: { origin_submission_id?: unknown; dump_submission_id?: unknown },
  submissionId: string,
) => String(t.origin_submission_id ?? "") === submissionId || String(t.dump_submission_id ?? "") === submissionId;

export type ParcoursTrip = { submission_id: string | null; voided_at: string | null; side?: string | null; count?: number | null };

export type ParcoursLine = { label: string; value: string; known: boolean };

const NA = "Non disponible";

/** Résumé d'affichage du parcours d'une demande; aucune valeur n'est déduite d'un texte copié. */
export function buildDemandeParcours(
  s: MySubmission,
  transport: { request_number?: unknown; status?: unknown } | null | undefined,
  trips: ParcoursTrip[],
  stageLabel: string | null,
): ParcoursLine[] {
  const dir = needDirection(s);
  const site = s.selectedSiteId
    ? s.siteValidatedAt ? "Site sélectionné · validé" : "Site sélectionné"
    : s.siteValidatedAt ? "Site validé" : null;
  const live = trips.filter((t) => t.submission_id === s.id && !t.voided_at);
  // Côtés « reçu » et « livré » affichés séparément, jamais additionnés.
  const bySide = new Map<string, number>();
  for (const t of live) {
    const key = t.side === "livre" ? "livré" : t.side === "recu" ? "reçu" : "autre";
    bySide.set(key, (bySide.get(key) ?? 0) + (typeof t.count === "number" && t.count > 0 ? t.count : 1));
  }
  const trip = live.length
    ? [...bySide].map(([k, n]) => `${n} ${k}${n > 1 ? "s" : ""}`).join(" · ") + " (enregistré)"
    : null;
  const tr = transport
    ? transport.request_number ? `Transport lié · Nº ${String(transport.request_number)}` : "Transport lié"
    : null;
  return [
    { label: "Matériau", value: s.material || NA, known: !!s.material },
    { label: "Quantité", value: s.quantity || NA, known: !!s.quantity },
    { label: "Sens du besoin", value: dir === "a_preciser" ? "Sens à confirmer" : NEED_LABELS[dir], known: dir !== "a_preciser" },
    { label: "Site / dompe", value: site ?? "Aucun site lié", known: !!site },
    { label: "Transport", value: tr ?? "Aucun transport lié", known: !!tr },
    { label: "Voyage", value: trip ?? "Aucun voyage lié", known: !!trip },
    { label: "Étape actuelle", value: stageLabel ?? NA, known: !!stageLabel },
  ];
}
