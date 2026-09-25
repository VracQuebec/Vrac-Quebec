import { describe, expect, it } from "vitest";
import { resolveMaterialPrice } from "../../supabase/functions/_shared/vqos/supply.ts";
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
  it("unité non tonne => aucune conversion inventée", () => expect(() => resolveMaterialPrice(cfg([P({ unit: "verge" })]), 10)).toThrow(/unité non convertible/));
  it("ambigu => manuel", () => expect(() => resolveMaterialPrice(cfg([P({}), P({ selling_price: 25 })]), 10)).toThrow(/non départagés/));
  it("priorité départage", () => expect(resolveMaterialPrice(cfg([P({}), P({ selling_price: 25, priority: 1 })]), 10)).toBe(25));
  it("paliers de quantité", () => {
    const rows = [P({ max_quantity: 10 }), P({ selling_price: 18, minimum_quantity: 10.01 })];
    expect(resolveMaterialPrice(cfg(rows), 5)).toBe(20);
    expect(resolveMaterialPrice(cfg(rows), 30)).toBe(18);
  });
  it("calcul automatique désactivé => manuel", () => expect(() => resolveMaterialPrice(cfg([P({ auto_quote_enabled: false })]), 10)).toThrow(/admissible/));
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
