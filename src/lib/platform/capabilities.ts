// ============================================================
// CRM-02B — Traduction des capacités techniques en services compréhensibles.
// Les identifiants internes sont conservés tels quels côté données ;
// seule la présentation est humaine. Aucune capacité n'est inventée :
// « available: false » signifie que la fonction n'existe pas encore
// dans l'espace entrepreneur au moment de l'écriture.
// ============================================================

export interface CapabilityInfo {
  /** Identifiant interne, inchangé dans la base et chez le prestataire. */
  key: string;
  /** Libellé lisible affiché à l'entrepreneur. */
  label: string;
  /** Ce que la personne peut réellement faire. */
  description: string;
  /** La fonction existe et est ouverte dans l'espace entrepreneur. */
  available: boolean;
  /** Destination existante, si la fonction est ouverte. */
  route: string | null;
  /** Précision affichée quand la fonction n'est pas encore ouverte. */
  unavailableReason?: string;
}

/**
 * Sens réel vérifié dans le produit :
 * - /entrepreneur/demandes, /entrepreneur/carte et /entrepreneur/reseau existent ;
 * - aucune fonction d'export n'existe dans l'espace entrepreneur ;
 * - le jumelage remblai reste interne (drapeau désactivé).
 */
export const CAPABILITIES: CapabilityInfo[] = [
  {
    key: "crm_demandes",
    label: "Demandes et suivi",
    description: "Déposer vos demandes, suivre leur avancement et retrouver leur historique.",
    available: true,
    route: "/entrepreneur/demandes",
  },
  {
    key: "carte_dompes",
    label: "Carte des demandes de remblai",
    description:
      "Voir sur une carte les demandes de remblai autour de vos chantiers, y compris celles à plusieurs matériaux.",
    available: true,
    route: "/entrepreneur/carte",
  },
  {
    key: "annuaire_reseau",
    label: "Annuaire des entrepreneurs",
    description:
      "Consulter l'identité professionnelle publique des entreprises du réseau. Aucune coordonnée privée n'est partagée.",
    available: true,
    route: "/entrepreneur/reseau",
  },
  {
    key: "exports",
    label: "Export de vos propres demandes en fichier",
    description:
      "Télécharger la liste de vos demandes et de vos chantiers dans un fichier tableur.",
    available: false,
    route: null,
    unavailableReason:
      "Fonction prévue : aucun export n'est encore disponible dans l'espace entrepreneur. Les exports d'administration restent réservés à l'équipe interne.",
  },
  {
    key: "jumelage_remblai",
    label: "Jumelage automatique des remblais",
    description:
      "Proposition automatique de sites de dépôt compatibles avec votre chargement.",
    available: false,
    route: null,
    unavailableReason: "Fonction interne en préparation : non ouverte aux entreprises abonnées.",
  },
];

const BY_KEY = new Map(CAPABILITIES.map((c) => [c.key, c]));

/** Une capacité inconnue reste visible sous son identifiant plutôt que d'être masquée. */
export function describeCapability(key: string): CapabilityInfo {
  return (
    BY_KEY.get(key) ?? {
      key,
      label: key,
      description: "Service non documenté dans cette version.",
      available: false,
      route: null,
      unavailableReason: "Description à compléter par l'équipe interne.",
    }
  );
}

/** Services d'un forfait, ouverts d'abord puis à venir. */
export function describeCapabilities(keys: string[] | null | undefined): CapabilityInfo[] {
  const list = (keys ?? []).map(describeCapability);
  return [...list.filter((c) => c.available), ...list.filter((c) => !c.available)];
}

/** L'abonnement n'ouvre jamais ces accès, quel que soit le forfait. */
export const NEVER_INCLUDED = [
  "Notes privées de l'équipe interne",
  "Coordonnées protégées des autres entreprises",
  "Exports et rapports d'administration",
];
