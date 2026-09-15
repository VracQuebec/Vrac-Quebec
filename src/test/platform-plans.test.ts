import { describe, it, expect } from "vitest";
import {
  planCompleteness, formatPrice, featureMatrix, subscriptionMetrics,
  businessDay, metricLabel, PLATFORM_FEATURES,
  type PlatformSubscription, type PlatformPlan,
} from "@/lib/platform/plans";

const plan = (over: Partial<PlatformPlan> = {}): PlatformPlan => ({
  id: "p1", slug: "entrepreneur-pro", name: "Entrepreneur Pro",
  description: "Accès pro", billing_interval: "month", currency: "CAD",
  price_cents: null, features: ["crm_demandes"], audience: "entreprise",
  status: "draft", notes: null, ...over,
});

const sub = (over: Partial<PlatformSubscription> = {}): PlatformSubscription => ({
  id: "s1", company_id: "c1", plan_id: "p1", status: "active",
  amount_cents: 10000, currency: "CAD", current_period_end: "2026-11-01T00:00:00Z",
  last_payment_failed_at: null, is_test: false, ...over,
});

describe("forfaits", () => {
  it("un forfait sans prix ne peut pas être activé", () => {
    const c = planCompleteness(plan());
    expect(c.canActivate).toBe(false);
    expect(c.missing).toContain("Prix");
  });

  it("un forfait complet peut être activé", () => {
    expect(planCompleteness(plan({ price_cents: 9900 })).canActivate).toBe(true);
  });

  it("un prix absent n'est jamais 0 $", () => {
    expect(formatPrice(null)).toBe("À définir");
    expect(formatPrice(0)).not.toBe("À définir");
    expect(formatPrice(9900)).toContain("99");
  });

  it("la matrice distingue disponible, activée et incluse", () => {
    const rows = featureMatrix(plan({ features: ["crm_demandes", "jumelage_remblai"] }), () => true);
    const crm = rows.find((r) => r.key === "crm_demandes")!;
    const jumelage = rows.find((r) => r.key === "jumelage_remblai")!;
    expect(crm).toMatchObject({ available: true, enabled: true, included: true });
    // Fonctionnalité incluse au forfait mais pas encore disponible → jamais « activée ».
    expect(jumelage).toMatchObject({ available: false, enabled: false, included: true });
    expect(rows).toHaveLength(PLATFORM_FEATURES.length);
  });
});

describe("abonnements", () => {
  it("aucun abonnement réel : indicateurs à configurer, jamais de faux zéro monétaire", () => {
    const m = subscriptionMetrics([], []);
    expect(m.payingActive).toBe(0);
    expect(m.mrrCents).toBeNull();
    expect(m.nextDueDates).toEqual([]);
  });

  it("ignore les abonnements de test", () => {
    expect(subscriptionMetrics([sub({ is_test: true })]).payingActive).toBe(0);
  });

  it("calcule le revenu mensuel récurrent (année ÷ 12)", () => {
    const m = subscriptionMetrics(
      [sub(), sub({ id: "s2", amount_cents: null, plan_id: "p2" })],
      [plan(), plan({ id: "p2", price_cents: 120000, billing_interval: "year" })],
    );
    expect(m.mrrCents).toBe(10000 + 10000);
    expect(m.payingActive).toBe(2);
  });

  it("compte les paiements en échec et trie les échéances", () => {
    const m = subscriptionMetrics([
      sub({ id: "a", current_period_end: "2026-12-01T00:00:00Z" }),
      sub({ id: "b", status: "past_due", last_payment_failed_at: "2026-10-01T00:00:00Z", current_period_end: "2026-10-15T00:00:00Z" }),
    ]);
    expect(m.failedPayments).toBe(1);
    expect(m.nextDueDates[0].date).toContain("2026-10-15");
    expect(m.payingActive).toBe(1);
  });
});

describe("états des sources", () => {
  it("distingue chargement, erreur, source absente et zéro réel", () => {
    expect(metricLabel({ state: "loading", value: null })).toBe("…");
    expect(metricLabel({ state: "error", value: null })).toBe("Erreur");
    expect(metricLabel({ state: "not_configured", value: null })).toBe("À configurer");
    expect(metricLabel({ state: "ready", value: null })).toBe("À configurer");
    expect(metricLabel({ state: "ready", value: 0 })).toBe("0");
  });

  it("utilise le fuseau America/Toronto pour la journée métier", () => {
    // 2026-03-02 02:00 UTC = 2026-03-01 21:00 à Toronto
    expect(businessDay(new Date("2026-03-02T02:00:00Z"))).toBe("2026-03-01");
  });
});
