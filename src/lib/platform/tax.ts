// ============================================================
// CRM-02B — Lecture honnête de l'état des taxes.
// Un montant nul ne prouve jamais une exemption, et l'interface
// n'annonce jamais un calcul de taxes qui n'a pas été observé.
// ============================================================

export type TaxState =
  | "not_configured" // Le calcul n'est pas configuré dans cet environnement.
  | "unavailable" // Configuration présente, mais aucun calcul observé sur ce dossier.
  | "computed" // Un montant de taxe a été calculé et figure sur la facture.
  | "zero_justified"; // Le calcul a eu lieu et a conclu à zéro, avec justification.

export interface TaxInfo {
  state: TaxState;
  /** Renseigné par le serveur : ce qui manque ou ce qui a été observé. */
  detail: string;
  /** Adresse de l'établissement vendeur enregistrée chez le prestataire. */
  sellerAddressConfigured: boolean;
  /** Classification fiscale du service enregistrée chez le prestataire. */
  serviceTaxCodeConfigured: boolean;
  /** Calcul automatique réellement actif sur l'abonnement existant. */
  automaticTaxOnSubscription: boolean | null;
  /** Nombre d'inscriptions fiscales actives déclarées chez le prestataire. */
  registrations: number | null;
  /** Dernier état de calcul observé sur une facture. */
  lastInvoiceStatus: string | null;
}

export const TAX_LABELS: Record<TaxState, string> = {
  not_configured: "Taxes non configurées dans cet environnement",
  computed: "Taxes calculées par le prestataire",
  unavailable: "Calcul des taxes indisponible",
  zero_justified: "Taxe nulle justifiée par le calcul",
};

export const TAX_TONES: Record<TaxState, string> = {
  not_configured: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  unavailable: "bg-zinc-200 text-zinc-700 border-zinc-300",
  computed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  zero_justified: "bg-sky-500/15 text-sky-700 border-sky-500/30",
};

/** Conséquence pratique pour la personne qui lit la page. */
export function taxGuidance(state: TaxState): string {
  switch (state) {
    case "not_configured":
      return "Ce paiement vérifie uniquement le paiement lui-même : aucune taxe n'est calculée ni perçue ici.";
    case "unavailable":
      return "Aucun calcul de taxe n'a été observé sur ce dossier. Le montant affiché ne comprend donc aucune taxe.";
    case "zero_justified":
      return "Le calcul a été effectué et conclut à aucune taxe applicable pour cette adresse.";
    case "computed":
      return "Le montant des taxes provient du calcul du prestataire, jamais d'un taux saisi à la main.";
  }
}

/**
 * Montant de taxe d'une facture : « null » signifie non calculé.
 * Un zéro n'est affiché comme zéro que si le calcul a réellement eu lieu.
 */
export function invoiceTaxLabel(
  amountCents: number | null | undefined,
  calculationStatus: string | null | undefined,
  currency = "CAD",
): string {
  if (calculationStatus !== "complete") return "Taxes non calculées";
  if (amountCents === null || amountCents === undefined) return "Taxes non calculées";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(amountCents / 100);
}
