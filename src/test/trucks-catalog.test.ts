import { describe, expect, it } from "vitest";
import {
  TRUCK_TYPES, BULK_TRUCK_TYPES, normalizeTruckType, truckTypeLabel, isBulkTruck,
} from "@/lib/trucks/catalog";
import { TRUCK_OPTIONS, BULK_TRUCK_OPTIONS, normalizeTruck } from "@/lib/entrepreneur/site-match";

describe("nomenclature centrale des camions", () => {
  it("A — expose la liste centrale", () => {
    expect(TRUCK_TYPES.map((t) => t.key)).toEqual([
      "6_roues", "10_roues", "12_roues", "semi_remorque", "fardier", "autre",
    ]);
  });
  it("B/C/D — 10 roues, 12 roues et semi-dompeur", () => {
    expect(truckTypeLabel("10_roues")).toBe("Camion 10 roues");
    expect(truckTypeLabel("12_roues")).toBe("Camion 12 roues");
    expect(truckTypeLabel("semi_remorque")).toBe("Semi-dompeur");
  });
  it("E — le fardier est catégorisé machinerie", () => {
    const f = TRUCK_TYPES.find((t) => t.key === "fardier")!;
    expect(f.usage).toBe("machinerie");
    expect(f.bulk).toBe(false);
  });
  it("F — le fardier est exclu des calculs de voyages en vrac", () => {
    expect(BULK_TRUCK_TYPES.map((t) => t.key)).not.toContain("fardier");
    expect(BULK_TRUCK_OPTIONS.map((t) => t.key)).not.toContain("fardier");
    expect(isBulkTruck("fardier")).toBe(false);
  });
  it("G — le comparateur partage les mêmes identifiants", () => {
    expect(TRUCK_OPTIONS.map((t) => t.key)).toEqual([
      "6_roues", "10_roues", "12_roues", "semi_remorque", "fardier",
    ]);
  });
  it("I — les variantes historiques restent interprétables", () => {
    for (const v of ["12 roues", "12-roues", "Camion 12 roues", "CAMION 12 ROUES"]) {
      expect(normalizeTruckType(v)).toBe("12_roues");
    }
    expect(normalizeTruck("Semi-Remorque 3 essieux")).toBe("semi_remorque");
    expect(normalizeTruck("Camion 10 roues")).toBe("10_roues");
    expect(normalizeTruckType("lowbed")).toBe("fardier");
    expect(normalizeTruckType("inconnu")).toBeNull();
  });
});
