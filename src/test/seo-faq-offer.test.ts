import { describe, it, expect } from "vitest";
import { offerFaq, offerKind } from "../../supabase/functions/_shared/seo-faq-offer";

describe("FAQ offre adaptée au type de page", () => {
  it("page matériau : Vrac Québec offre le matériau et la soumission", () => {
    const f = offerFaq(offerKind("asphalte", null), "asphalte", "Beauport");
    expect(f.answer.startsWith("Oui. Vrac Québec offre des matériaux en vrac")).toBe(true);
    expect(f.answer).toContain("soumission");
  });
  it("page transport : coordination, jamais exécution directe", () => {
    expect(offerKind(null, "transport-vrac")).toBe("transport");
    expect(offerKind(null, "livraison-gravier")).toBe("transport");
    const f = offerFaq("transport", "transport en vrac", "Beauport");
    expect(f.answer).toContain("aide à coordonner");
    expect(f.answer).not.toMatch(/nos camions|nous livrons|notre flotte/i);
  });
  it("page dompe : aide à trouver une solution", () => {
    expect(offerKind(null, "dompe")).toBe("dompe");
    expect(offerFaq("dompe", "dompe", "X").answer).toContain("aide à trouver une solution de dompe");
  });
  it("page ville : présente toutes les offres", () => {
    expect(offerKind(null, null)).toBe("city");
    const a = offerFaq("city", "", "Beauport").answer;
    for (const w of ["matériaux en vrac", "dompes", "transport", "entreprises adaptées"]) expect(a).toContain(w);
  });
  it("aucune catégorie ne reprend la réponse universelle « Non. … plateforme »", () => {
    for (const k of ["material", "transport", "dompe", "service", "city"] as const)
      expect(offerFaq(k, "t", "c").answer).not.toMatch(/^Non\./);
  });
});
