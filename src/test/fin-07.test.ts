import { describe, it, expect } from "vitest";
import { computeTaxes, computeCorrection } from "@/lib/finances/tax";

const rates = { gst: "0.05", qst: "0.09975" };
const reg = { gstStatus: "inscrit" as const, qstStatus: "inscrit" as const, rates };

describe("FIN-07 moteur TPS/TVQ", () => {
  it("base 1 000 $", () => {
    const r = computeTaxes([{ qty: 1, price: 1000, tax: "taxable" }], reg);
    expect([r.gst, r.qst, r.total]).toEqual([50, 99.75, 1149.75]);
  });
  it("rabais 10 %", () => {
    const r = computeTaxes([{ qty: 1, price: 1000, disc_pct: 10, tax: "taxable" }], reg);
    expect([r.discount, r.taxable_base, r.gst, r.qst, r.total]).toEqual([100, 900, 45, 89.78, 1034.78]);
  });
  it("taxes incluses 1 149,75 $", () => {
    const r = computeTaxes([{ qty: 1, price: "1149.75", tax: "taxable" }], { ...reg, pricesIncludeTax: true });
    expect([r.taxable_base, r.gst, r.qst, r.total]).toEqual([1000, 50, 99.75, 1149.75]);
  });
  it("lignes mixtes et petits montants", () => {
    const r = computeTaxes([
      { qty: 3, price: "0.33", tax: "taxable" }, { qty: "12.5", price: "23.47", tax: "taxable" },
      { qty: 1, price: "0.07", tax: "detaxe" }, { qty: 2, price: "4.99", tax: "exonere" },
    ], reg);
    // 0.99 + 293.38 = 294.37 taxable ; TPS 14.72 ; TVQ 29.36
    expect([r.taxable_base, r.gst, r.qst]).toEqual([294.37, 14.72, 29.36]);
    expect(r.total).toBe(Math.round((294.37 + 14.72 + 29.36 + 0.07 + 9.98) * 100) / 100);
  });
  it("profil inconnu ou ligne à déterminer : aucun faux zéro", () => {
    const a = computeTaxes([{ qty: 1, price: 100, tax: "taxable" }], { ...reg, gstStatus: "a_completer" });
    const b = computeTaxes([{ qty: 1, price: 100 }], reg);
    for (const r of [a, b]) { expect(r.resolved).toBe(false); expect(r.gst).toBeNull(); expect(r.total).toBeNull(); }
  });
  it("non inscrit : résolu sans taxe ; correction reprend les taux figés", () => {
    const r = computeTaxes([{ qty: 1, price: 100, tax: "taxable" }], { ...reg, gstStatus: "non_inscrit", qstStatus: "non_inscrit" });
    expect([r.resolved, r.gst, r.total]).toEqual([true, 0, 100]);
    const c = computeCorrection({ gst_status: "inscrit", qst_status: "inscrit", gst_rate: 0.05, qst_rate: 0.09975, prices_include_tax: false }, [{ qty: -1, price: 1000, tax: "taxable" }]);
    expect([c.gst, c.qst, c.total]).toEqual([-50, -99.75, -1149.75]);
  });
});
