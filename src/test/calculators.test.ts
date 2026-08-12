import { describe, expect, it } from "vitest";
import {
  computeVolume, isValidDimension, toMeters, tripsFor, roundTo,
  FT_TO_M, IN_TO_M, M3_TO_YD3,
} from "@/lib/vrac/calculator";
import { BULK_TRUCK_TYPES, isBulkTruck } from "@/lib/trucks/catalog";

describe("conversions d'unités", () => {
  it("pieds et pouces", () => {
    expect(toMeters(1, "pi")).toBeCloseTo(FT_TO_M, 10);
    expect(toMeters(12, "po")).toBeCloseTo(FT_TO_M, 10);
    expect(IN_TO_M * 12).toBeCloseTo(FT_TO_M, 10);
  });
  it("métriques", () => {
    expect(toMeters(2.5, "m")).toBe(2.5);
    expect(toMeters(100, "cm")).toBeCloseTo(1, 10);
  });
});

describe("volume", () => {
  it("volume rectangulaire exact en m³", () => {
    const r = computeVolume(10, "m", 5, "m", 0.3, "m", null)!;
    expect(r.m3).toBeCloseTo(15, 10);
    expect(r.yd3).toBeCloseTo(15 * M3_TO_YD3, 10);
  });
  it("pieds/pouces", () => {
    const r = computeVolume(30, "pi", 20, "pi", 4, "po", null)!;
    expect(r.m3).toBeCloseTo(30 * FT_TO_M * 20 * FT_TO_M * 4 * IN_TO_M, 10);
  });
  it("décimales acceptées", () => {
    expect(computeVolume(2.5, "m", 1.2, "m", 0.15, "m", null)!.m3).toBeCloseTo(0.45, 10);
  });
  it("valeurs invalides rejetées", () => {
    expect(computeVolume(-1, "m", 2, "m", 1, "m", null)).toBeNull();
    expect(computeVolume(0, "m", 2, "m", 1, "m", null)).toBeNull();
    expect(computeVolume(NaN, "m", 2, "m", 1, "m", null)).toBeNull();
    expect(computeVolume(Infinity, "m", 2, "m", 1, "m", null)).toBeNull();
    expect(computeVolume(1e9, "m", 2, "m", 1, "m", null)).toBeNull();
    expect(isValidDimension(50_000, "m")).toBe(false);
  });
});

describe("volume → tonnage (densité réelle uniquement)", () => {
  it("utilise la densité fournie", () => {
    // 1700 kg/m³ = densité administrée de la pierre 0-3/4
    expect(computeVolume(10, "m", 1, "m", 1, "m", 1700)!.tonnes).toBeCloseTo(17, 10);
  });
  it("aucune densité → pas de tonnage inventé", () => {
    expect(computeVolume(10, "m", 1, "m", 1, "m", null)!.tonnes).toBeNull();
    expect(computeVolume(10, "m", 1, "m", 1, "m", 0)!.tonnes).toBeNull();
  });
});

describe("nombre de voyages", () => {
  it("quantité exactement égale à la capacité", () => expect(tripsFor(18, 18)).toBe(1));
  it("quantité légèrement supérieure", () => expect(tripsFor(18.5, 18)).toBe(2));
  it("plusieurs voyages", () => expect(tripsFor(50, 15)).toBe(4));
  it("très petite quantité", () => expect(tripsFor(0.2, 15)).toBe(1));
  it("capacité absente", () => {
    expect(tripsFor(10, 0)).toBeNull();
    expect(tripsFor(10, NaN)).toBeNull();
  });
  it("quantité invalide", () => {
    expect(tripsFor(0, 15)).toBeNull();
    expect(tripsFor(-5, 15)).toBeNull();
  });
});

describe("nomenclature camions", () => {
  it("le fardier est exclu du vrac", () => {
    expect(isBulkTruck("fardier")).toBe(false);
    expect(BULK_TRUCK_TYPES.some((t) => t.key === "fardier")).toBe(false);
  });
  it("les camions dompeurs restent inclus", () => {
    for (const k of ["6_roues", "10_roues", "12_roues", "semi_remorque"]) {
      expect(isBulkTruck(k)).toBe(true);
    }
  });
});

describe("arrondis", () => {
  it("arrondi d'affichage sans perte interne", () => {
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(roundTo(17.05, 1)).toBe(17.1);
  });
});
