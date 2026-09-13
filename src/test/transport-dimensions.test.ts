import { describe, expect, it } from "vitest";
import { VEHICLE_CONFIG_CODES } from "@/lib/transport/capacity";
import {
  DIMENSION_SOURCES,
  resolvePhysicalDimension,
  feetInchesToM,
  mToFeetInches,
  mToFeet,
  mirrorToMirrorWidthM,
  comboOverallLengthM,
  buildLogisticProfile,
  checkRegulatoryCompliance,
  canVehicleAccess,
  DEFAULT_SAFETY_MARGINS,
} from "@/lib/transport/dimensions";

const profile = (over: Record<string, unknown> = {}) =>
  buildLogisticProfile({ configCode: "semi_3_essieux", ...over } as never);

describe("gabarits et dimensions des camions", () => {
  it("supporte 6, 10, 12 roues et semi 2/3/4 essieux", () => {
    for (const c of [
      "porteur_6_roues", "porteur_10_roues", "porteur_12_roues",
      "semi_2_essieux", "semi_3_essieux", "semi_4_essieux",
    ]) {
      expect(VEHICLE_CONFIG_CODES).toContain(c);
    }
  });

  it("les dimensions réelles sont propres au véhicule, jamais déduites des essieux", () => {
    const a = profile({ configCode: "semi_3_essieux", lengthM: 20.4 });
    const b = profile({ configCode: "semi_3_essieux", lengthM: 22.1 });
    expect(a.lengthM).not.toBe(b.lengthM);
    const d6 = profile({ configCode: "porteur_6_roues" });
    expect(d6.lengthM).toBeNull(); // aucune longueur inventée par catégorie
  });

  it("distingue largeur carrosserie et largeur miroir à miroir", () => {
    const body = 2.6;
    const mirrors = mirrorToMirrorWidthM({
      bodyWidthM: body, mirrorLeftOffsetM: 0.2, mirrorRightOffsetM: 0.22,
    });
    expect(mirrors).toBeCloseTo(3.02, 6);
    expect(mirrors).toBeGreaterThan(body);
    expect(mirrorToMirrorWidthM({ measuredMirrorWidthM: 3.15, bodyWidthM: 2.6 })).toBe(3.15);
    expect(mirrorToMirrorWidthM({ bodyWidthM: 2.6 })).toBeNull();
  });

  it("ne confond pas largeur réglementaire et largeur de passage réelle", () => {
    const p = profile({ bodyWidthM: 2.6, mirrorWidthM: 3.02 });
    // conforme au réglementaire 2,6 m…
    expect(checkRegulatoryCompliance(p, { maxRegulatoryWidthM: 2.6 }).ok).toBe(true);
    // …mais ne passe pas dans une ouverture de 3,00 m
    expect(canVehicleAccess(p, { accessWidthM: 3.0 }).fits).toBe(false);
  });

  it("hauteur : compare à la limite versionnée sans l'inventer", () => {
    expect(checkRegulatoryCompliance({ lengthM: null, bodyWidthM: null, heightM: 4.3 },
      { maxHeightM: 4.15 }).ok).toBe(false);
    expect(checkRegulatoryCompliance({ lengthM: null, bodyWidthM: null, heightM: 4.3 }, null)
      .evaluated).toBe(false);
  });

  it("longueur d'ensemble ≠ tracteur + semi-remorque", () => {
    const naive = 6.5 + 16.2;
    const geo = comboOverallLengthM({
      tractorLengthM: 6.5, trailerLengthM: 16.2, kingpinSetbackM: 0.9, tractorWheelbaseM: 4.6,
    });
    expect(geo.method).toBe("geometric");
    expect(geo.lengthM!).toBeLessThan(naive);
    const measured = comboOverallLengthM({ measuredComboLengthM: 21.4, tractorLengthM: 6.5 });
    expect(measured.method).toBe("measured");
    expect(measured.lengthM).toBe(21.4);
    expect(comboOverallLengthM({ tractorLengthM: 6.5 }).lengthM).toBeNull();
  });

  it("convertit mètres ↔ pieds/pouces", () => {
    expect(feetInchesToM(13, 6)).toBeCloseTo(4.1148, 6);
    expect(mToFeet(4.15)).toBeCloseTo(13.6155, 3);
    const { feet, inches } = mToFeetInches(4.1148);
    expect(feet).toBe(13);
    expect(inches).toBeCloseTo(6, 2);
  });

  it("classe les sources et priorise la mesure réelle", () => {
    expect(DIMENSION_SOURCES).toContain("ACTUAL_MEASURED");
    expect(DIMENSION_SOURCES).toContain("REGULATORY_LIMIT");
    const r = resolvePhysicalDimension([
      { value: 12.0, source: "DEFAULT_ESTIMATE" },
      { value: 11.4, source: "ACTUAL_MEASURED" },
      { value: 11.8, source: "MANUFACTURER_SPEC" },
    ]);
    expect(r?.value).toBe(11.4);
    // une limite réglementaire ne décrit jamais un véhicule réel
    expect(resolvePhysicalDimension([{ value: 12.5, source: "REGULATORY_LIMIT" }])).toBeNull();
  });

  it("accessibilité : marges opérationnelles, jamais une norme réglementaire", () => {
    expect(DEFAULT_SAFETY_MARGINS.isRegulatory).toBe(false);
    const p = profile({ configCode: "porteur_10_roues", mirrorWidthM: 2.9, heightM: 3.9, lengthM: 9 });
    const ok = canVehicleAccess(p, {
      accessWidthM: 4, clearHeightM: 4.5, maxPracticalLengthM: 12,
    });
    expect(ok.fits).toBe(true);
    expect(canVehicleAccess(p, { accessWidthM: 2.9 }).fits).toBe(false);
    expect(canVehicleAccess(p, { accessWidthM: 4, clearHeightM: 4.0 }).fits).toBe(false);
  });

  it("propose un plus petit camion quand la semi est refusée", () => {
    const access = { accessWidthM: 3.6, clearHeightM: 5, acceptsSemiTrailer: false, accepts10Roues: true };
    const semi = profile({ configCode: "semi_3_essieux", mirrorWidthM: 3.05, heightM: 4.0 });
    const dix = profile({ configCode: "porteur_10_roues", mirrorWidthM: 2.9, heightM: 3.8 });
    expect(canVehicleAccess(semi, access).fits).toBe(false);
    expect(canVehicleAccess(dix, access).fits).toBe(true);
  });

  it("ne conclut jamais sans donnée", () => {
    expect(canVehicleAccess(profile(), null).fits).toBeNull();
    expect(canVehicleAccess(profile({ mirrorWidthM: null }), { accessWidthM: 3.5 }).fits).toBeNull();
  });
});
