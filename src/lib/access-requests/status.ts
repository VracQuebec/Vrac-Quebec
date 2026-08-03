// Source de vérité unique des statuts d'une demande d'accès aux dompes.
// Vrac Québec coordonne l'accès aux dompes : les statuts décrivent la
// coordination, jamais une livraison.

export type AccessStatus =
  | "nouvelle"
  | "en_analyse"
  | "en_attente_proprietaire"
  | "acceptee"
  | "refusee"
  | "terminee"
  | "annulee";

export interface AccessStatusMeta {
  value: AccessStatus;
  label: string;
  color: string;
  /** Regroupement utilisé dans l'espace entrepreneur. */
  bucket: "pending" | "accepted" | "completed" | "refused";
}

export const ACCESS_STATUSES: AccessStatusMeta[] = [
  { value: "nouvelle", label: "Nouvelle demande", color: "#3b82f6", bucket: "pending" },
  { value: "en_analyse", label: "En analyse", color: "#8b5cf6", bucket: "pending" },
  { value: "en_attente_proprietaire", label: "En attente du propriétaire", color: "#f59e0b", bucket: "pending" },
  { value: "acceptee", label: "Acceptée", color: "#10b981", bucket: "accepted" },
  { value: "refusee", label: "Refusée", color: "#ef4444", bucket: "refused" },
  { value: "terminee", label: "Terminée", color: "#22c55e", bucket: "completed" },
  { value: "annulee", label: "Annulée", color: "#64748b", bucket: "refused" },
];

/**
 * Anciens statuts encore possibles en base : ils sont affichés via leur
 * équivalent simplifié. Aucune donnée n'est modifiée.
 */
const LEGACY_MAP: Record<string, AccessStatus> = {
  a_rappeler: "en_analyse",
  soumission_envoyee: "en_attente_proprietaire",
  planifiee: "acceptee",
  en_cours: "acceptee",
};

export const normalizeStatus = (raw: string | null | undefined): AccessStatus => {
  if (!raw) return "nouvelle";
  if (LEGACY_MAP[raw]) return LEGACY_MAP[raw];
  return (ACCESS_STATUSES.find((s) => s.value === raw)?.value ?? "nouvelle") as AccessStatus;
};

export const statusMeta = (raw: string | null | undefined): AccessStatusMeta => {
  const v = normalizeStatus(raw);
  return ACCESS_STATUSES.find((s) => s.value === v)!;
};

export const statusLabel = (raw: string | null | undefined) => statusMeta(raw).label;
export const statusColor = (raw: string | null | undefined) => statusMeta(raw).color;
export const statusBucket = (raw: string | null | undefined) => statusMeta(raw).bucket;

/** Statuts considérés comme « en cours de coordination ». */
export const OPEN_STATUSES: AccessStatus[] = ["nouvelle", "en_analyse", "en_attente_proprietaire", "acceptee"];
/** Statuts terminaux (historique). */
export const CLOSED_STATUSES: AccessStatus[] = ["terminee", "annulee", "refusee"];
