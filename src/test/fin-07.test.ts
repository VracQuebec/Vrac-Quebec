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

describe("FIN-07B arrondis taxes incluses", () => {
  const inc = { ...reg, pricesIncludeTax: true };
  it("petits montants : total saisi conservé, chaque taxe extraite indépendamment", () => {
    for (const t of ["0.01", "0.05", "0.99", "1.15", "2.30", "11.49", "114.97"]) {
      const r = computeTaxes([{ qty: 1, price: t, tax: "taxable" }], inc);
      expect(r.total).toBe(Number(t));
      expect(Math.round((r.taxable_base! + r.gst! + r.qst!) * 100)).toBe(Math.round(Number(t) * 100));
    }
    const r = computeTaxes([{ qty: 1, price: "1.15", tax: "taxable" }], inc);
    // 1,15 × 5/114,975 = 0,0500… → 0,05 ; × 9,975/114,975 = 0,0998 → 0,10 ; base 1,00
    expect([r.taxable_base, r.gst, r.qst]).toEqual([1, 0.05, 0.1]);
  });
  it("plusieurs lignes, quantités, rabais et mélange de traitements", () => {
    const r = computeTaxes([
      { qty: "12.5", price: "26.99", disc_pct: 5, tax: "taxable" }, { qty: 3, price: "9.99", tax: "taxable" },
      { qty: 2, price: "5.00", tax: "detaxe" }, { qty: 1, price: "20.00", tax: "exonere" },
    ], inc);
    // 337,38 − 16,87 = 320,51 + 29,97 = 350,48 TTC taxable
    expect(r.gst).toBe(15.24); expect(r.qst).toBe(30.41); expect(r.taxable_base).toBe(304.83);
    expect(r.total).toBe(380.48);
  });
  it("TPS seule, TVQ seule, aucune taxe", () => {
    const L = [{ qty: 1, price: "105", tax: "taxable" as const }];
    expect(computeTaxes(L, { ...inc, qstStatus: "non_inscrit" })).toMatchObject({ taxable_base: 100, gst: 5, qst: 0, total: 105 });
    const q = computeTaxes([{ qty: 1, price: "109.98", tax: "taxable" }], { ...inc, gstStatus: "non_inscrit" });
    expect(q).toMatchObject({ gst: 0, qst: 9.98, taxable_base: 100, total: 109.98 });
    expect(computeTaxes(L, { ...inc, gstStatus: "non_inscrit", qstStatus: "non_inscrit" })).toMatchObject({ taxable_base: 105, gst: 0, qst: 0, total: 105 });
  });
});
