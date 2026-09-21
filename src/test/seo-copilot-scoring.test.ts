import { describe, expect, it } from "vitest";
import {
  CATEGORY_OF, evaluateRelevance, expectedImpact, priorityOf, scoreSignal,
  servicePriority, topOpportunities, type SignalContext,
} from "../../supabase/functions/_shared/copilot-scoring.ts";

const ctx = (over: Partial<SignalContext>): SignalContext => ({
  type: "ctr_top10",
  impressions: 0, clicks: 0, ctr: 0, position: null,
  conversions: 0, qa: null, indexed: true,
  ...over,
});

describe("Copilote SEO — filtre de pertinence (signal ≠ opportunité)", () => {
  it("écarte une page avec 2 impressions et aucun clic", () => {
    const r = evaluateRelevance(ctx({ type: "ctr_top10", impressions: 2, position: 7 }));
    expect(r.relevant).toBe(false);
    expect(r.rejection).toContain("volume insuffisant");
  });

  it("retient une page avec 800 impressions en position 8.7 et CTR faible", () => {
    const r = evaluateRelevance(ctx({ type: "ctr_top10", impressions: 800, clicks: 9, ctr: 0.011, position: 8.7 }));
    expect(r.relevant).toBe(true);
    expect(r.dataQuality).toBe("suffisante");
  });

  it("retient malgré un faible volume si la page convertit", () => {
    const r = evaluateRelevance(ctx({ type: "ctr_top10", impressions: 5, conversions: 3, position: 6 }));
    expect(r.relevant).toBe(true);
  });

  it("écarte une page non indexée sans impression ni conversion", () => {
    const r = evaluateRelevance(ctx({ type: "not_indexed", indexed: false, impressions: 0 }));
    expect(r.relevant).toBe(false);
  });

  it("retient une page non indexée en noindex", () => {
    expect(evaluateRelevance(ctx({ type: "not_indexed", indexed: false, noindex: true })).relevant).toBe(true);
  });

  it("écarte un signal de conversion sans conversion mesurée", () => {
    const r = evaluateRelevance(ctx({ type: "converting_page", conversions: 0, impressions: 500 }));
    expect(r.relevant).toBe(false);
  });

  it("marque la qualité de donnée comme partielle quand les impressions sont inconnues", () => {
    const r = evaluateRelevance(ctx({ type: "converting_page", conversions: 2, impressions: null }));
    expect(r.dataQuality).toBe("partielle");
  });
});

describe("Copilote SEO — scoring explicable", () => {
  it("ne classe jamais une page à très faible volume en critique", () => {
    const { score } = scoreSignal(ctx({ impressions: 3, clicks: 0, ctr: 0, position: 7 }));
    expect(priorityOf(score)).not.toBe("critical");
    expect(score).toBeLessThan(60);
  });

  it("priorise une page à fort volume mal positionnée", () => {
    const strong = scoreSignal(ctx({ type: "position_gain", impressions: 900, clicks: 5, ctr: 0.005, position: 12, serviceSlug: "livraison" }));
    const weak = scoreSignal(ctx({ type: "position_gain", impressions: 35, clicks: 0, ctr: 0, position: 12 }));
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(["critical", "high"]).toContain(priorityOf(strong.score));
  });

  it("donne un poids supérieur à une page qui convertit", () => {
    const base = ctx({ type: "converting_page", impressions: 200, clicks: 6, ctr: 0.03, position: 6 });
    const withConv = scoreSignal({ ...base, conversions: 3 });
    const without = scoreSignal({ ...base, conversions: 0 });
    expect(withConv.score).toBeGreaterThan(without.score);
  });

  it("récompense une position 4-10 davantage qu'une position au-delà de 30", () => {
    const top = scoreSignal(ctx({ impressions: 300, ctr: 0.01, position: 6 }));
    const far = scoreSignal(ctx({ impressions: 300, ctr: 0.01, position: 45 }));
    expect(top.score).toBeGreaterThan(far.score);
  });

  it("expose toujours des facteurs lisibles qui somment au score", () => {
    const { score, factors } = scoreSignal(ctx({ impressions: 400, clicks: 4, ctr: 0.01, position: 8, conversions: 1 }));
    expect(factors.length).toBeGreaterThan(2);
    const sum = factors.reduce((s, f) => s + f.points, 0);
    expect(Math.min(100, Math.max(0, sum))).toBe(score);
    for (const f of factors) expect(f.label.length).toBeGreaterThan(3);
  });

  it("borne le score entre 0 et 100", () => {
    const max = scoreSignal(ctx({ impressions: 5000, clicks: 1, ctr: 0.0002, position: 5, conversions: 20, qa: 30, serviceSlug: "remblai", siblingPages: 4, groupPages: 30, wordCount: 100, internalLinks: 0 }));
    expect(max.score).toBeLessThanOrEqual(100);
    expect(max.score).toBeGreaterThanOrEqual(0);
  });

  it("n'invente aucune donnée quand les impressions sont inconnues", () => {
    const { factors } = scoreSignal(ctx({ impressions: null }));
    expect(factors.some((f) => f.label === "Impressions inconnues")).toBe(true);
  });
});

describe("Copilote SEO — priorités, catégories et écosystème", () => {
  it("mappe les seuils de priorité", () => {
    expect(priorityOf(85)).toBe("critical");
    expect(priorityOf(65)).toBe("high");
    expect(priorityOf(45)).toBe("medium");
    expect(priorityOf(20)).toBe("low");
  });

  it("associe chaque type de signal à une catégorie de filtre", () => {
    for (const [type, cat] of Object.entries(CATEGORY_OF)) {
      expect(cat).toBeTruthy();
      expect(expectedImpact(type as keyof typeof CATEGORY_OF)).toBeTruthy();
    }
  });

  it("reconnaît les services stratégiques de Vrac Québec", () => {
    expect(servicePriority("remblai")).toBe("haute");
    expect(servicePriority("dompe")).toBe("haute");
    expect(servicePriority("blog")).toBe("faible");
    expect(servicePriority("service-inconnu")).toBe("moyenne");
    expect(servicePriority(null)).toBe("moyenne");
  });

  it("ne promet jamais un gain de position chiffré", () => {
    expect(expectedImpact("position_gain")).toMatch(/garanti/i);
  });

  it("classe le top opportunités par score décroissant", () => {
    const top = topOpportunities([
      { score: 40, effort_score: 10 }, { score: 91, effort_score: 20 },
      { score: 91, effort_score: 5 }, { score: 70, effort_score: 10 },
    ], 3);
    expect(top.map((t) => t.score)).toEqual([91, 91, 70]);
    expect(top[0].effort_score).toBe(5);
  });
});
