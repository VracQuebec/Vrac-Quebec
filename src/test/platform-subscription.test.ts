import { describe, it, expect } from "vitest";
import {
  subscriptionState, hasPaidAccess, formatAmount, formatDate, stateGuidance,
  type SubscriptionRow,
} from "@/lib/platform/subscription";

const NOW = new Date("2026-06-15T12:00:00Z");
const future = "2026-07-01T00:00:00Z";
const past = "2026-05-01T00:00:00Z";

const row = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: "s1", status: "active", billing_status: "active", amount_cents: 1000, currency: "CAD",
  environment: "sandbox", price_ref: "test_entrepreneur_pro_monthly", plan_version: 1,
  current_period_start: past, current_period_end: future, cancel_at_period_end: false,
  ended_at: null, last_payment_failed_at: null, last_synced_at: past,
  provider_subscription_id: "sub_test", ...over,
});

describe("état de l'abonnement", () => {
  it("aucun abonnement : aucun droit payant", () => {
    expect(subscriptionState(null, NOW)).toBe("none");
    expect(hasPaidAccess(null, NOW)).toBe(false);
  });

  it("paiement initial incomplet : aucun droit payant", () => {
    const s = row({ status: "incomplete" });
    expect(subscriptionState(s, NOW)).toBe("incomplete");
    expect(hasPaidAccess(s, NOW)).toBe(false);
  });

  it("période payée valide : accès", () => {
    expect(subscriptionState(row(), NOW)).toBe("active");
    expect(hasPaidAccess(row(), NOW)).toBe(true);
  });

  it("annulation programmée : accès maintenu jusqu'à la fin", () => {
    const s = row({ status: "canceled", cancel_at_period_end: true });
    expect(subscriptionState(s, NOW)).toBe("canceled");
    expect(hasPaidAccess(s, NOW)).toBe(true);
  });

  it("période terminée : fin des fonctions payantes", () => {
    const s = row({ status: "canceled", current_period_end: past });
    expect(subscriptionState(s, NOW)).toBe("ended");
    expect(hasPaidAccess(s, NOW)).toBe(false);
  });

  it("paiement échoué : régularisation possible sans perte immédiate", () => {
    const s = row({ status: "past_due", last_payment_failed_at: past });
    expect(subscriptionState(s, NOW)).toBe("past_due");
    expect(hasPaidAccess(s, NOW)).toBe(true);
    expect(stateGuidance("past_due")).toContain("régulariser");
  });

  it("un abonnement actif mais échu ne prolonge pas l'accès", () => {
    const s = row({ current_period_end: past });
    expect(subscriptionState(s, NOW)).toBe("ended");
    expect(hasPaidAccess(s, NOW)).toBe(false);
  });

  it("reprise après vérification : retour à l'état actif", () => {
    const s = row({ status: "active", current_period_end: future, ended_at: null });
    expect(hasPaidAccess(s, NOW)).toBe(true);
  });
});

describe("affichage", () => {
  it("un montant absent n'est jamais 0 $", () => {
    expect(formatAmount(null)).toBe("À définir");
    expect(formatAmount(1000, "CAD")).toContain("10");
  });

  it("une date absente n'invente rien", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("2026-07-01T12:00:00Z")).toContain("2026");
  });
});
