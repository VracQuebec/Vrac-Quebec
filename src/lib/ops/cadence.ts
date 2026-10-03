// Lot 6 — calendrier des relances. Fonction pure : décide QUEL message est dû, sans rien envoyer.
// Les promotions partiront par Mailchimp (consentement + désabonnement) une fois le compte connecté.
export type Audience = "client" | "entrepreneur";
export type Profile = {
  audience: Audience; signedUpAt: string; consent: boolean; unsubscribed: boolean;
  lastActivityAt: string | null; lastPromoAt: string | null; stepsIncomplete: boolean;
  remblaiFinishedAt: string | null; sent: string[]; ignoredSinceInactive: number;
};
export type Step = { key: string; label: string; promo: boolean };

const DAY = 86400000;
export const PROMO_GAP_DAYS = 7;

const days = (from: string, now: Date) => Math.floor((now.getTime() - Date.parse(from)) / DAY);

/** Retourne le prochain message dû, ou null. Un seul promotionnel par 7 jours, tous scénarios confondus. */
export function nextStep(p: Profile, now = new Date()): Step | null {
  if (p.unsubscribed) return null;
  const d = days(p.signedUpAt, now);
  const has = (k: string) => p.sent.includes(k);
  // Messages attendus (non promotionnels).
  if (!has("bienvenue")) return { key: "bienvenue", label: "Bienvenue, carnet et prochaines étapes", promo: false };
  if (d >= 3 && p.stepsIncomplete && !has("j3")) return { key: "j3", label: "J+3 — aide à démarrer", promo: false };

  if (!p.consent) return null;
  const promoOk = !p.lastPromoAt || days(p.lastPromoAt, now) >= PROMO_GAP_DAYS;
  if (!promoOk) return null;
  if (p.remblaiFinishedAt && !has("fin_remblai")) return { key: "fin_remblai", label: "Fin du remblai — pépine, nivellement, finition", promo: true };
  if (d >= 10 && !has("j10")) return { key: "j10", label: "J+10 — accompagnement / offre", promo: true };
  if (d >= 21 && !has("j21")) return { key: "j21", label: "J+21 — vérification du besoin", promo: true };
  if (p.lastActivityAt && days(p.lastActivityAt, now) >= 60) {
    if (p.ignoredSinceInactive >= 2) return null; // réduction des envois sans réaction
    return { key: `inactif_${p.ignoredSinceInactive}`, label: "Relance après 60 jours d'inactivité", promo: true };
  }
  if (d >= 21) {
    const every = p.audience === "client" ? 30 : 14;
    if (!p.lastPromoAt || days(p.lastPromoAt, now) >= every)
      return { key: `campagne_${Math.floor(d / every)}`, label: p.audience === "client" ? "Promotion mensuelle" : "Campagne aux deux semaines", promo: true };
  }
  return null;
}
