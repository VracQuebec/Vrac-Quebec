// Réponse FAQ « offre de Vrac Québec » adaptée au type de page.
// Matériaux : Vrac Québec offre le matériau et la soumission.
// Transport/livraison, dompe, autres services : aide à trouver/coordonner, sans exécuter.
// Ville : présente l'ensemble des offres. Prix, disponibilité et modalités
// sont toujours confirmés dans la soumission ou la réponse, jamais promis.

export type OfferKind = "material" | "transport" | "dompe" | "service" | "city";

const TRANSPORT_SERVICES = /^(transport|livraison|camion)/;

export function offerKind(materialSlug?: string | null, serviceSlug?: string | null): OfferKind {
  const s = (serviceSlug || "").toLowerCase();
  if (s) {
    if (s.startsWith("dompe")) return "dompe";
    if (TRANSPORT_SERVICES.test(s)) return "transport";
    return "service";
  }
  const m = (materialSlug || "").toLowerCase();
  if (m === "dompe") return "dompe";
  if (m === "neige") return "service";
  if (m) return "material";
  return "city";
}

export function offerFaq(kind: OfferKind, topic: string, city: string): { question: string; answer: string } {
  switch (kind) {
    case "material":
      return {
        question: `Vrac Québec offre-t-il ce matériau ?`,
        answer: `Oui. Vrac Québec offre des matériaux en vrac, notamment pour vos besoins en ${topic}, et vous permet de demander une soumission. Le prix, la disponibilité et les modalités vous sont confirmés dans la soumission, selon votre projet et l'adresse du chantier, avant toute confirmation de la demande.`,
      };
    case "transport":
      return {
        question: `Comment Vrac Québec aide-t-il pour le transport ?`,
        answer: `Vrac Québec reçoit votre demande et aide à coordonner le transport adapté à votre projet, notamment en la transmettant aux entreprises appropriées. Le prix, la date et les modalités vous sont confirmés avant toute réalisation.`,
      };
    case "dompe":
      return {
        question: `Comment Vrac Québec aide-t-il à trouver une dompe ?`,
        answer: `Vrac Québec aide à trouver une solution de dompe adaptée au matériau à déposer, peut coordonner le transport et transmet au besoin la demande aux entreprises appropriées. L'acceptation du matériau, le prix et les modalités vous sont confirmés avant tout dépôt.`,
      };
    case "service":
      return {
        question: `Comment Vrac Québec aide-t-il pour ce service ?`,
        answer: `Vrac Québec reçoit votre demande, aide à trouver la solution pertinente et la transmet aux entreprises adaptées à votre projet. Le prix et les modalités vous sont confirmés avant toute intervention.`,
      };
    default:
      return {
        question: `Que propose Vrac Québec à ${city} ?`,
        answer: `Vrac Québec offre des matériaux en vrac avec soumission, aide à trouver des solutions pour les dompes, coordonne le transport et transmet les demandes aux entreprises adaptées au projet. Le prix, la disponibilité et les modalités sont confirmés dans chaque soumission ou réponse.`,
      };
  }
}

export const LEGACY_OFFER_QUESTION = "Vrac Québec fournit-il lui-même ce matériau ou ce service ?";

// Réponses anciennes interdites : question universelle et réduction à « une plateforme ».
const LEGACY_QUESTION = /fournit-il lui-m[eê]me ce mat[ée]riau ou ce service/i;
const OFFER_QUESTION = /(offre-t-il ce mat[ée]riau|comment vrac qu[ée]bec aide-t-il|que propose vrac qu[ée]bec)/i;
const PLATFORM_ONLY = /(^\s*non\b[^.]*\.?\s*vrac qu[ée]bec est une plateforme|\b(simple|simplement|uniquement|seulement)\b[^.]{0,40}plateforme|plateforme de mise en relation)/i;

export function isForbiddenOfferFaq(f: { question: string; answer: string }): boolean {
  return LEGACY_QUESTION.test(f.question) || OFFER_QUESTION.test(f.question) || PLATFORM_ONLY.test(f.answer);
}

/** Retire toute réponse « offre » rédigée librement ou ancienne, puis ajoute UNE réponse contrôlée. */
export function enforceOfferFaq(
  faq: Array<{ question: string; answer: string }>,
  kind: OfferKind,
  topic: string,
  city: string,
): Array<{ question: string; answer: string }> {
  return [...faq.filter((f) => !isForbiddenOfferFaq(f)), offerFaq(kind, topic, city)];
}
