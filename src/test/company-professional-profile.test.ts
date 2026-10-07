import { describe, expect, it } from "vitest";
import { isProfessionalCompanyName, professionalProfileIsComplete } from "@/components/entrepreneur-app/CompanyProfileDetails";
import type { MarketplacePartner } from "@/lib/marketplace/types";

const partner = (values: Partial<MarketplacePartner> = {}) => ({
  trade_name: "Excavation ABC",
  legal_name: "Excavation ABC inc.",
  description: "Transport et travaux spécialisés.",
  city: "Lévis",
  ...values,
} as MarketplacePartner);

describe("Profil professionnel entreprise", () => {
  it("considère complet seulement un profil avec identité, description et ville réelles", () => {
    expect(professionalProfileIsComplete(partner())).toBe(true);
    expect(professionalProfileIsComplete(partner({ trade_name: null, legal_name: null }))).toBe(false);
    expect(professionalProfileIsComplete(partner({ description: null }))).toBe(false);
    expect(professionalProfileIsComplete(partner({ city: null }))).toBe(false);
  });

  it("n'utilise jamais un courriel comme identité de repli", () => {
    expect(professionalProfileIsComplete(partner({ trade_name: null, legal_name: "Entreprise réelle" }))).toBe(true);
    expect(professionalProfileIsComplete(null)).toBe(false);
    expect(isProfessionalCompanyName("Entreprise de membre@exemple.com")).toBe(false);
    expect(isProfessionalCompanyName("membre@exemple.com")).toBe(false);
    expect(isProfessionalCompanyName("Excavation ABC")) .toBe(true);
  });
});