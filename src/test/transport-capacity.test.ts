import { describe, expect, it } from "vitest";
import {
  VEHICLE_CONFIG_CODES,
  computePayloadKg,
  resolveTareKg,
  validateOperationalCapacityKg,
  effectiveCapacity,
  tripsForTonnes,
  volumeToTonnes,
  kgToTonnes,
  tonnesToKg,
  cubicYardsToM3,
  m3ToCubicYards,
} from "@/lib/transport/capacity";

describe("capacités réelles de transport", () => {
  it("supporte les cinq configurations demandées", () => {
    expect(VEHICLE_CONFIG_CODES).toEqual([
      "porteur_10_roues", "porteur_12_roues",
      "semi_2_essieux", "semi_3_essieux", "semi_4_essieux",
    ]);
  });

  it("charge utile = masse admissible − poids à vide", () => {
    expect(computePayloadKg({ grossAdmissibleKg: 55_000, comboTareKg: 20_000 })).toBe(35_000);
    expect(computePayloadKg({ grossAdmissibleKg: 55_000, tractorTareKg: 9_000, trailerTareKg: 8_000 }))
      .toBe(38_000);
  });

  it("deux équipements de même configuration peuvent avoir des charges utiles différentes", () => {
    const a = computePayloadKg({ grossAdmissibleKg: 55_000, comboTareKg: 18_000 });
    const b = computePayloadKg({ grossAdmissibleKg: 55_000, comboTareKg: 21_000 });
    expect(a).toBeGreaterThan(b!);
  });

  it("n'invente aucune valeur lorsqu'une donnée manque", () => {
    expect(computePayloadKg({ comboTareKg: 20_000 })).toBeNull();
    expect(computePayloadKg({ grossAdmissibleKg: 55_000 })).toBeNull();
    expect(resolveTareKg({})).toBeNull();
    // poids à vide supérieur à la masse admissible → pas de charge utile fictive
    expect(computePayloadKg({ grossAdmissibleKg: 10_000, comboTareKg: 12_000 })).toBeNull();
  });

  it("interdit une capacité opérationnelle supérieure à la capacité légale calculée", () => {
    expect(validateOperationalCapacityKg(30_000, 35_000).ok).toBe(true);
    expect(validateOperationalCapacityKg(35_000, 35_000).ok).toBe(true);
    const ko = validateOperationalCapacityKg(40_000, 35_000);
    expect(ko.ok).toBe(false);
    expect(ko.value).toBeNull();
    expect(validateOperationalCapacityKg(30_000, null).ok).toBe(false);
  });

  it("retient la capacité opérationnelle quand elle est valide", () => {
    const e = effectiveCapacity({ grossAdmissibleKg: 55_000, comboTareKg: 20_000, operationalCapacityKg: 32_000 });
    expect(e.payloadKg).toBe(35_000);
    expect(e.operationalKg).toBe(32_000);
    expect(e.usableTonnes).toBe(32);
  });

  it("arrondit le nombre de voyages vers le haut", () => {
    expect(tripsForTonnes(100, 28)).toBe(4);
    expect(tripsForTonnes(56, 28)).toBe(2);
    expect(tripsForTonnes(1, 28)).toBe(1);
    expect(tripsForTonnes(100, null)).toBeNull();
    expect(tripsForTonnes(0, 28)).toBeNull();
  });

  it("convertit correctement les unités", () => {
    expect(kgToTonnes(32_500)).toBe(32.5);
    expect(tonnesToKg(32.5)).toBe(32_500);
    expect(cubicYardsToM3(1)).toBeCloseTo(0.764554857984, 9);
    expect(m3ToCubicYards(cubicYardsToM3(10))).toBeCloseTo(10, 9);
  });

  it("identifie les densités comme des estimations", () => {
    const r = volumeToTonnes(10, { avgKgPerM3: 1600, minKgPerM3: 1500, maxKgPerM3: 1800, isEstimate: true });
    expect(r.tonnes).toBe(16);
    expect(r.minTonnes).toBe(15);
    expect(r.maxTonnes).toBe(18);
    expect(r.isEstimate).toBe(true);
    expect(r.note).toMatch(/Estimation/);
    expect(volumeToTonnes(10, null).tonnes).toBeNull();
  });
});
