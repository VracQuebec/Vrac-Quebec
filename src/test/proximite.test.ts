import { describe, it, expect } from "vitest";
import {
  compareProximity,
  isSameLocalZone,
  isPublicCandidate,
  normalizeCityKey,
  normalizeProvinceCode,
  PROXIMITY_RANK,
  type ProximityProfile,
} from "@/lib/parcours/proximite";
import type { PublicLocalisation } from "@/lib/parcours/localisation";

const loc = (p: Partial<PublicLocalisation>): PublicLocalisation => ({
  city: null,
  region: null,
  province: null,
  provinceName: null,
  postalSector: null,
  ...p,
});

const prof = (p: Partial<PublicLocalisation>, visible?: boolean): ProximityProfile => ({
  localisation: loc(p),
  isNetworkVisible: visible,
});

describe("contrat de proximité", () => {
  it("A — même ville", () => {
    expect(
      compareProximity(prof({ city: "Québec", province: "QC" }), prof({ city: "Québec", province: "QC" })).relation,
    ).toBe("same_city");
  });

  it("B — même région", () => {
    expect(
      compareProximity(prof({ city: "Québec", province: "QC" }), prof({ city: "Beauport", province: "QC" })).relation,
    ).toBe("same_region");
  });

  it("C — même province", () => {
    expect(
      compareProximity(prof({ city: "Québec", province: "QC" }), prof({ city: "Montréal", province: "QC" })).relation,
    ).toBe("same_province");
  });

  it("D — provinces différentes", () => {
    expect(
      compareProximity(prof({ city: "Québec", province: "QC" }), prof({ city: "Ottawa", province: "ON" })).relation,
    ).toBe("different_province");
  });

  it("E — ville inconnue → unknown (jamais same_province deviné)", () => {
    expect(
      compareProximity(prof({ province: "QC" }), prof({ city: "Montréal", province: "QC" })).relation,
    ).toBe("unknown");
  });

  it("F — région inconnue mais villes différentes → same_province", () => {
    const r = compareProximity(
      prof({ city: "Villeneuve-Inconnue", province: "QC" }),
      prof({ city: "Autre-Ville-Inconnue", province: "QC" }),
    );
    expect(r.relation).toBe("same_province");
  });

  it("G — province inconnue → unknown", () => {
    expect(compareProximity(prof({ city: "Québec" }), prof({ city: "Québec", province: "QC" })).relation).toBe(
      "unknown",
    );
    expect(compareProximity(prof({ city: "Québec", province: "XX" }), prof({ city: "Québec", province: "QC" })).relation).toBe(
      "unknown",
    );
  });

  it("H — accents insensibles", () => {
    expect(
      compareProximity(prof({ city: "Quebec", province: "QC" }), prof({ city: "Québec", province: "QC" })).relation,
    ).toBe("same_city");
  });

  it("I — casse insensible", () => {
    expect(
      compareProximity(prof({ city: "QUEBEC", province: "qc" }), prof({ city: "québec", province: "Québec" })).relation,
    ).toBe("same_city");
  });

  it("J — espaces normalisés", () => {
    expect(
      compareProximity(prof({ city: "  Trois   Rivières ", province: "QC" }), prof({ city: "Trois-Rivières", province: "QC" })).relation,
    ).toBe("same_city");
  });

  it("K — apostrophes normalisées", () => {
    expect(
      compareProximity(prof({ city: "Val d’Or", province: "QC" }), prof({ city: "Val-d'Or", province: "QC" })).relation,
    ).toBe("same_city");
  });

  it("L — tirets normalisés", () => {
    expect(normalizeCityKey("Saint-Jérôme", "QC")).toBe(normalizeCityKey("Saint Jérôme", "QC"));
  });

  it("M — faux rapprochement refusé (Québec ≠ Québec-Est)", () => {
    expect(
      compareProximity(prof({ city: "Québec", province: "QC" }), prof({ city: "Québec-Est", province: "QC" })).relation,
    ).not.toBe("same_city");
    expect(
      compareProximity(prof({ city: "Montréal", province: "QC" }), prof({ city: "Montréal-Est", province: "QC" })).relation,
    ).not.toBe("same_city");
  });

  it("N — hors Québec : aucune région québécoise inventée", () => {
    const r = compareProximity(
      prof({ city: "Toronto", province: "ON" }),
      prof({ city: "Ottawa", province: "ON" }),
    );
    expect(r.relation).toBe("same_province");
    const same = compareProximity(prof({ city: "Toronto", province: "ON" }), prof({ city: "Toronto", province: "ON" }));
    expect(same.relation).toBe("same_city");
  });

  it("O — profil non visible n'est pas candidat public", () => {
    expect(isPublicCandidate(prof({ city: "Québec", province: "QC" }, false))).toBe(false);
    expect(isPublicCandidate(prof({ city: "Québec", province: "QC" }))).toBe(false);
    expect(isPublicCandidate(prof({ city: "Québec", province: "QC" }, true))).toBe(true);
  });

  it("P — aucune donnée privée utilisée", () => {
    const dirty = {
      localisation: {
        ...loc({ city: "Québec", province: "QC" }),
        // champs privés volontairement injectés : ils doivent être ignorés
        address: "123 rue Privée, app. 4",
        postal_code: "G1A 1A1",
        phone: "581-994-7717",
        email: "prive@example.com",
        user_id: "uuid-prive",
      } as PublicLocalisation,
    };
    expect(compareProximity(dirty, prof({ city: "Québec", province: "QC" })).relation).toBe("same_city");
    // le secteur postal seul ne crée aucune proximité
    expect(compareProximity(prof({ postalSector: "G1A" }), prof({ postalSector: "G1A" })).relation).toBe("unknown");
  });

  it("Q — aucune approximation : unknown reste unknown", () => {
    expect(compareProximity(null, prof({ city: "Québec", province: "QC" })).relation).toBe("unknown");
    expect(compareProximity(prof({}), prof({})).relation).toBe("unknown");
  });

  it("R — aucun fuzzy matching", () => {
    expect(compareProximity(prof({ city: "Quebek", province: "QC" }), prof({ city: "Québec", province: "QC" })).relation).toBe(
      "same_province",
    );
    expect(normalizeProvinceCode("Quebeq")).toBeNull();
  });

  it("zone locale + rang", () => {
    expect(isSameLocalZone(prof({ city: "Québec", province: "QC" }), prof({ city: "Beauport", province: "QC" }))).toBe(true);
    expect(isSameLocalZone(prof({ city: "Québec", province: "QC" }), prof({ city: "Montréal", province: "QC" }))).toBe(false);
    expect(PROXIMITY_RANK.same_city).toBeLessThan(PROXIMITY_RANK.same_region);
  });
});
