import { describe, expect, it } from "vitest";
import { buildQuoteRequest } from "@/lib/vrac/estimate";
import { EMPTY_VRAC_DRAFT, type VracDraft } from "@/lib/vrac/catalog";

const base: VracDraft = {
  ...EMPTY_VRAC_DRAFT, materialId: "sable", address: "25 rue Laurier, Gatineau, QC",
  addressLat: 45.43, addressLng: -75.71,
};

// Unités envoyées au serveur : uniquement celles qu'il accepte (tonne, verge, m3, voyage).
describe("unités transmises au calcul", () => {
  for (const u of ["tonne", "m3", "verge"] as const) {
    it(`quantité en ${u} transmise telle quelle`, () => {
      const r = buildQuoteRequest({ ...base, quantityMode: "tonnes", tonnes: "8", quantityUnit: u }, { hasDensity: true });
      expect(r).toMatchObject({ quantity: 8, unit: u });
    });
  }
  it("voyages transmis en unité « voyage »", () => {
    const r = buildQuoteRequest({ ...base, quantityMode: "voyages", trips: "2" });
    expect(r).toMatchObject({ quantity: 2, unit: "voyage" });
  });
  it("dimensions converties en m3", () => {
    const r = buildQuoteRequest({ ...base, quantityMode: "dimensions", dims: { length: "10", width: "10", depth: "12" } }, { hasDensity: true });
    expect(r).toMatchObject({ unit: "m3" });
  });
});
