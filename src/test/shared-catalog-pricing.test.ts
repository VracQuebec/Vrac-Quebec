import { describe, expect, it } from "vitest";
import { convertQuantity, resolveMaterialPrice, resolveMaterialTariff } from "../../supabase/functions/_shared/vqos/supply.ts";
import { normalizeSearch, searchCatalog, type CatalogItem } from "@/lib/vrac/sharedCatalog";

const cfg = (prices: any[]) => ({ material: { id: "m", name: "Pierre" }, prices } as any);
const P = (o: any) => ({ material_id: "m", unit: "tonne", is_active: true, auto_quote_enabled: true, selling_price: 20, ...o });

describe("sélection de tarif", () => {
  it("utilise un prix saisi", () => expect(resolveMaterialPrice(cfg([P({})]), 10, "2026-09-25")).toBe(20));
  it("prix vide => manuel, jamais 0", () => expect(() => resolveMaterialPrice(cfg([P({ selling_price: null })]), 10)).toThrow(/aucun prix saisi/));
  it("0 $ non confirmé refusé, confirmé accepté", () => {
    expect(() => resolveMaterialPrice(cfg([P({ selling_price: 0 })]), 10)).toThrow(/Soumission à confirmer/);
    expect(resolveMaterialPrice(cfg([P({ selling_price: 0, zero_price_confirmed: true })]), 10)).toBe(0);
  });
  it("tarif expiré => manuel", () => expect(() => resolveMaterialPrice(cfg([P({ valid_to: "2026-01-01" })]), 10, "2026-09-25")).toThrow(/expiré/));
  it("tonnes demandées, tarif à la verge, sans densité => aucune conversion inventée", () => expect(() => resolveMaterialPrice(cfg([P({ unit: "verge" })]), 10)).toThrow(/masse-volume impossible sans densité/));
  it("ambigu => manuel", () => expect(() => resolveMaterialPrice(cfg([P({}), P({ selling_price: 25 })]), 10)).toThrow(/non départagés/));
  it("priorité départage", () => expect(resolveMaterialPrice(cfg([P({}), P({ selling_price: 25, priority: 1 })]), 10)).toBe(25));
  it("paliers de quantité", () => {
    const rows = [P({ max_quantity: 10 }), P({ selling_price: 18, minimum_quantity: 10.01 })];
    expect(resolveMaterialPrice(cfg(rows), 5)).toBe(20);
    expect(resolveMaterialPrice(cfg(rows), 30)).toBe(18);
  });
  it("calcul automatique désactivé => manuel", () => expect(() => resolveMaterialPrice(cfg([P({ auto_quote_enabled: false })]), 10)).toThrow(/admissible/));
  it("tarif de transport/réception ignoré par la vente", () => expect(() => resolveMaterialPrice(cfg([P({ price_kind: "reception" })]), 10)).toThrow(/aucun prix saisi/));
});

describe("CATALOGUE-02 — calcul multi-unités", () => {
  const T = (unit: string, value: number, prices: any[], density: number | null = null) =>
    resolveMaterialTariff({ material: { id: "m", name: "X", density_kg_per_m3: density }, prices } as any, { value, unit }, "2026-09-25");
  it("tonnes × prix/tonne", () => expect(T("tonne", 12, [P({})])).toMatchObject({ unit_price: 20, price_unit: "tonne", billed_quantity: 12 }));
  it("m³ × prix/m³ sans densité", () => expect(T("m3", 5, [P({ unit: "m3", selling_price: 40 })])).toMatchObject({ price_unit: "m3", billed_quantity: 5 }));
  it("verges³ × prix/verge³ sans densité", () => expect(T("verge", 8, [P({ unit: "verge", selling_price: 48.5 })])).toMatchObject({ billed_quantity: 8 }));
  it("m³ → verges³ : conversion de volume sans densité", () => expect(T("m3", 7.6455, [P({ unit: "verge" })]).billed_quantity).toBeCloseTo(10, 3));
  it("tonnes → m³ avec densité documentée", () => expect(T("tonne", 16, [P({ unit: "m3" })], 1600).billed_quantity).toBeCloseTo(10, 3));
  it("masse-volume sans densité => manuel", () => expect(() => T("m3", 5, [P({})])).toThrow(/masse-volume/));
  it("voyage jamais converti en tonnage", () => expect(() => T("voyage", 2, [P({})])).toThrow(/unité compatible/));
  it("voyage × prix/voyage", () => expect(T("voyage", 2, [P({ unit: "voyage", selling_price: 300 })])).toMatchObject({ billed_quantity: 2 }));
  it("forfait", () => expect(T("tonne", 3, [P({ unit: "forfait", selling_price: 150 })])).toMatchObject({ billed_quantity: 1, unit_price: 150 }));
  it("convertQuantity refuse voyage", () => expect(convertQuantity(3, "voyage", "tonne", 1600)).toBeNull());
});

const item = (name: string, terms: string[] = [], variants: string[] = []): CatalogItem => ({
  material_id: name, slug: name, name, family: "F", family_label: "F", requires_granulometry: variants.length > 0,
  search_terms: terms, variants: variants.map((v) => ({ granulometry_id: v, label: v, jsc_material_id: v, jsc_name: v, price_available: false })), price_status: "sur_demande",
});

describe("recherche catalogue", () => {
  const items = [item("Argile / glaise", ["glaise"]), item("Pierre concassée", [], ["0-3/4", "3/4 net"]), item("Roche", ["tuf"])];
  it("accents et casse", () => expect(searchCatalog(items, "PIERRE CONCASSEE").map((i) => i.name)).toEqual(["Pierre concassée"]));
  it("synonyme", () => expect(searchCatalog(items, "tuf").map((i) => i.name)).toEqual(["Roche"]));
  it("fractions", () => {
    expect(normalizeSearch("0 - ¾")).toBe("0-3/4");
    expect(searchCatalog(items, "0-¾").map((i) => i.name)).toEqual(["Pierre concassée"]);
  });
});
