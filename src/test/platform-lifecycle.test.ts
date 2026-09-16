import { describe, it, expect } from "vitest";
import {
  isStaleEvent, isDuplicateEvent, canStartNewSubscription,
  shouldIgnoreCheckoutClick, BILLABLE_STATUSES,
} from "@/lib/platform/lifecycle";
import { hasPaidAccess, subscriptionState, type SubscriptionRow } from "@/lib/platform/subscription";

const NOW = new Date("2026-06-15T12:00:00Z");
const row = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: "s1", status: "active", billing_status: "active", amount_cents: 1000, currency: "CAD",
  environment: "sandbox", price_ref: "test_entrepreneur_pro_monthly", plan_version: 1,
  current_period_start: "2026-06-01T00:00:00Z", current_period_end: "2026-07-01T00:00:00Z",
  cancel_at_period_end: false, ended_at: null, last_payment_failed_at: null,
  last_synced_at: null, provider_subscription_id: "sub_test", ...over,
});

describe("CRM-02B — synchronisation des événements", () => {
  it("un événement reçu deux fois n'est traité qu'une fois", () => {
    expect(isDuplicateEvent(["evt_1"], "evt_1")).toBe(true);
    expect(isDuplicateEvent(["evt_1"], "evt_2")).toBe(false);
  });

  it("un événement plus ancien n'écrase pas un état plus récent", () => {
    expect(isStaleEvent("2026-06-15T12:00:00Z", "2026-06-15T11:00:00Z")).toBe(true);
    expect(isStaleEvent("2026-06-15T11:00:00Z", "2026-06-15T12:00:00Z")).toBe(false);
  });

  it("un état sans horodatage connu accepte l'événement", () => {
    expect(isStaleEvent(null, "2026-06-15T12:00:00Z")).toBe(false);
  });
});

describe("CRM-02B — cycle mensuel", () => {
  it("renouvellement : la période avancée prolonge l'accès", () => {
    const renewed = row({ current_period_start: "2026-07-01T00:00:00Z", current_period_end: "2026-08-01T00:00:00Z" });
    expect(hasPaidAccess(renewed, new Date("2026-07-15T12:00:00Z"))).toBe(true);
  });

  it("échec de paiement : état compréhensible, accès maintenu pendant la régularisation", () => {
    const failed = row({ status: "past_due", last_payment_failed_at: "2026-06-10T00:00:00Z" });
    expect(subscriptionState(failed, NOW)).toBe("past_due");
    expect(hasPaidAccess(failed, NOW)).toBe(true);
  });

  it("régularisation : retour à l'état actif sans échec résiduel", () => {
    const fixed = row({ status: "active", last_payment_failed_at: null });
    expect(subscriptionState(fixed, NOW)).toBe("active");
  });

  it("annulation : droits maintenus jusqu'à la fin de la période couverte", () => {
    const canceled = row({ status: "canceled", cancel_at_period_end: true });
    expect(hasPaidAccess(canceled, NOW)).toBe(true);
    expect(hasPaidAccess(canceled, new Date("2026-07-02T00:00:00Z"))).toBe(false);
  });

  it("reprise : aucune nouvelle souscription tant qu'une place facturable est occupée", () => {
    expect(canStartNewSubscription("active")).toBe(false);
    expect(canStartNewSubscription("past_due")).toBe(false);
    expect(canStartNewSubscription("canceled")).toBe(true);
    expect(canStartNewSubscription(null)).toBe(true);
  });

  it("concurrence : un second clic pendant un paiement en cours est ignoré", () => {
    expect(shouldIgnoreCheckoutClick(true)).toBe(true);
    expect(shouldIgnoreCheckoutClick(false)).toBe(false);
  });

  it("les statuts facturables correspondent à la contrainte d'unicité de la base", () => {
    expect([...BILLABLE_STATUSES].sort()).toEqual(["active", "incomplete", "past_due", "trialing"]);
  });
});
