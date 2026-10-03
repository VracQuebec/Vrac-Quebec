import { describe, it, expect } from "vitest";
import { minusMonths, occurrences, comparable, diff, lowestComparable, flags, policyStatus } from "@/lib/insurance/compare";

describe("ASSUR-01 calendrier", () => {
  it("mois calendaires et fins de mois", () => {
    expect(minusMonths("2027-05-31", 3)).toBe("2027-02-28");
    expect(minusMonths("2028-05-31", 3)).toBe("2028-02-29");
    expect(minusMonths("2027-03-31", 1)).toBe("2027-02-28");
    expect(minusMonths("2027-01-15", 2)).toBe("2026-11-15");
  });
  it("hebdomadaire à partir du rappel d'un mois", () => {
    const o = occurrences("2027-05-31").map((x) => x.on);
    expect(o).toEqual(["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-07", "2027-05-14", "2027-05-21", "2027-05-28", "2027-05-31"]);
  });
  it("préavis séparé", () => {
    expect(occurrences("2027-05-31", "2027-04-01").some((x) => x.code === "preavis_j0" && x.on === "2027-04-01")).toBe(true);
  });
  it("statut de police", () => {
    expect(policyStatus({ expires_on: null })).toBe("a_completer");
    expect(policyStatus({ effective_from: "2026-01-01", expires_on: "2026-12-01" }, "2026-12-02")).toBe("depassee");
  });
});

describe("ASSUR-01 comparaison", () => {
  const ref = { total: 1000, currency: "CAD", cost_basis: "prime_taxes_frais", period_from: "2026-06-01", period_to: "2027-06-01", limit_amount: 2000000, deductible: 1000 };
  it("écart seulement sur bases cohérentes", () => {
    expect(diff(ref, { ...ref, total: 1100 })).toEqual({ dollars: 100, pct: 10 });
    expect(diff(ref, { ...ref, total: 1100, currency: "USD" })).toBeNull();
    expect(diff(ref, { ...ref, total: 600, period_to: "2026-12-01" })).toBeNull();
    expect(comparable(ref, { ...ref, cost_basis: "a_confirmer" }).ok).toBe(false);
  });
  it("référence nulle", () => { expect(diff({ ...ref, total: 0 }, ref)).toEqual({ dollars: 1000, pct: null }); });
  it("prix le plus bas seulement si comparable", () => {
    expect(lowestComparable([{ id: "a", ...ref }, { id: "b", ...ref, total: 900 }])).toBe("b");
    expect(lowestComparable([{ id: "a", ...ref }, { id: "b", ...ref, total: 900, cost_basis: "prime_seule" }])).toBeNull();
    expect(lowestComparable([{ id: "a", ...ref }, { id: "b", total: null }])).toBeNull();
  });
  it("protections réduites et manquants", () => {
    expect(flags(ref, { id: "x", limit_amount: 1000000, deductible: 2500, exclusions: null })).toEqual(["Limite réduite", "Franchise augmentée", "Exclusions non renseignées"]);
  });
});
