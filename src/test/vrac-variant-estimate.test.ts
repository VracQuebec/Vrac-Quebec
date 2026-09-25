import { describe, it, expect } from "vitest";
import { buildQuoteRequest, quoteKey } from "@/lib/vrac/estimate";
import { EMPTY_VRAC_DRAFT, type VracDraft } from "@/lib/vrac/catalog";

const base: VracDraft = {
  ...EMPTY_VRAC_DRAFT,
  tonnes: "10",
  address: "123 rue Test, Québec",
  addressLat: 46.8,
  addressLng: -71.2,
};
const cat = (variantId: string, priced = true) => ({
  materialId: "11111111-1111-1111-1111-111111111111", name: "Pierre test",
  granulometryId: null, variantId, variantLabel: variantId, priceStatus: priced ? "prix_disponible" : "sur_demande",
});

describe("Lot C — changement de variante", () => {
  it("transmet l'identifiant exact de la variante", () => {
    const r = buildQuoteRequest({ ...base, catalog: cat("aaaaaaaaaa-A") });
    expect(r).toMatchObject({ material_catalog_id: cat("x").materialId, material_variant_id: "aaaaaaaaaa-A" });
    expect("material_slug" in r).toBe(false);
  });
  it("la variante fait partie de la clé : A ≠ B (réponse tardive de A rejetée)", () => {
    const a = quoteKey(buildQuoteRequest({ ...base, catalog: cat("aaaaaaaaaa-A") }));
    const b = quoteKey(buildQuoteRequest({ ...base, catalog: cat("bbbbbbbbbb-B") }));
    expect(a).not.toEqual(b);
  });
  it("variante sans tarif : Sur demande, aucun repli sur A ni la famille", () => {
    const r = buildQuoteRequest({ ...base, catalog: cat("bbbbbbbbbb-B", false) });
    expect(r).toMatchObject({ unsupported: expect.stringMatching(/Sur demande/) });
  });
});
