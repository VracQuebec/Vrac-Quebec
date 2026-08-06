import { describe, expect, it } from "vitest";
import { buildQuoteRequest } from "@/lib/vrac/estimate";
import { EMPTY_VRAC_DRAFT, type VracDraft } from "@/lib/vrac/catalog";

const base: VracDraft = {
  ...EMPTY_VRAC_DRAFT,
  materialId: "pierre_0_34",
  address: "1000 Boulevard Charest O, Québec, QC",
  addressLat: 46.8,
  addressLng: -71.25,
};

describe("buildQuoteRequest — calcul systématique quand les données existent", () => {
  it("tonnes", () => {
    const r = buildQuoteRequest({ ...base, tonnes: "20" }, { hasDensity: true, truckCapacityTonnes: 18 });
    expect(r).toMatchObject({ quantity: 20, unit: "tonne" });
  });

  it("m³ et verges³ avec densité configurée", () => {
    for (const unit of ["m3", "verge"] as const) {
      const r = buildQuoteRequest({ ...base, tonnes: "10", quantityUnit: unit }, { hasDensity: true });
      expect(r).toMatchObject({ quantity: 10, unit });
    }
  });

  it("dimensions converties en m³", () => {
    const r = buildQuoteRequest(
      { ...base, quantityMode: "dimensions", dims: { length: "30", width: "20", depth: "4" } },
      { hasDensity: true },
    );
    expect("unsupported" in r).toBe(false);
  });

  it("voyages convertis en tonnes selon la capacité configurée", () => {
    const r = buildQuoteRequest({ ...base, quantityMode: "voyages", trips: "2" }, { truckCapacityTonnes: 18 });
    expect(r).toMatchObject({ quantity: 36, unit: "tonne" });
  });
});

describe("buildQuoteRequest — raisons précises", () => {
  const reason = (d: Partial<VracDraft>, ctx = {}) => {
    const r = buildQuoteRequest({ ...base, ...d } as VracDraft, ctx);
    return "unsupported" in r ? r.unsupported : null;
  };

  it("matériau manquant", () => expect(reason({ materialId: null })).toMatch(/Matériau non sélectionné/));
  it("adresse non validée", () => expect(reason({ addressLat: null, addressLng: null, tonnes: "10" })).toMatch(/Adresse de livraison invalide/));
  it("quantité invalide", () => expect(reason({ tonnes: "0" })).toMatch(/Quantité invalide/));
  it("densité absente", () => expect(reason({ tonnes: "10", quantityUnit: "m3" }, { hasDensity: false })).toMatch(/Densité du matériau non configurée/));
  it("capacité camion absente", () => expect(reason({ quantityMode: "voyages", trips: "2" }, { truckCapacityTonnes: null })).toMatch(/Capacité de camion non configurée/));
  it("quantité inconnue", () => expect(reason({ quantityMode: "inconnu" })).toMatch(/Quantité non précisée/));
});
