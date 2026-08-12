import { describe, it, expect, beforeEach } from "vitest";
import { computeBesoin, basisForUnit, volumeToM3 } from "@/lib/parcours/besoin";
import { saveSelection, loadSelection, clearSelection, type ComparateurSelection } from "@/lib/parcours/handoff";

const base = { densityKgPerM3: null as number | null, capacityTonnes: 15 };

describe("comparateur — calcul du besoin", () => {
  it("reconnaît les unités du parcours", () => {
    expect(basisForUnit("voyages")).toBe("voyages");
    expect(basisForUnit("tonnes")).toBe("tonnes");
    expect(basisForUnit("m3")).toBe("volume");
    expect(basisForUnit("verges")).toBe("volume");
    expect(basisForUnit("banane")).toBeNull();
  });

  it("utilise directement une quantité déjà exprimée en voyages", () => {
    const r = computeBesoin({ ...base, quantityValue: "4", quantityUnit: "voyages" });
    expect(r.trips).toBe(4);
    expect(r.tonnes).toBeNull();
  });

  it("calcule les voyages depuis un tonnage avec la capacité administrée", () => {
    const r = computeBesoin({ ...base, quantityValue: "25", quantityUnit: "tonnes" });
    expect(r.trips).toBe(2);
    expect(r.tonnes).toBe(25);
  });

  it("ne crée pas de voyage superflu à capacité exacte", () => {
    expect(computeBesoin({ ...base, quantityValue: "15", quantityUnit: "tonnes" }).trips).toBe(1);
  });

  it("convertit un volume seulement si la densité est configurée", () => {
    const sansDensite = computeBesoin({ ...base, quantityValue: "10", quantityUnit: "m3" });
    expect(sansDensite.trips).toBeNull();
    expect(sansDensite.missing.join(" ")).toMatch(/densité/);

    const avec = computeBesoin({ quantityValue: "10", quantityUnit: "m3", densityKgPerM3: 1500, capacityTonnes: 15 });
    expect(avec.tonnes).toBe(15);
    expect(avec.trips).toBe(1);
  });

  it("convertit les verges cubes en m³ sans valeur inventée", () => {
    const m3 = volumeToM3(1, "verges")!;
    expect(m3).toBeCloseTo(0.764554857, 6);
    const r = computeBesoin({ quantityValue: "20", quantityUnit: "verges", densityKgPerM3: 1600, capacityTonnes: 18 });
    expect(r.tonnes).toBeCloseTo((20 / 1.30795062) * 1600 / 1000, 6);
    expect(r.trips).toBe(2);
  });

  it("signale clairement une capacité de camion absente", () => {
    const r = computeBesoin({ quantityValue: "25", quantityUnit: "tonnes", densityKgPerM3: null, capacityTonnes: null });
    expect(r.trips).toBeNull();
    expect(r.missing.join(" ")).toMatch(/capacité/);
  });

  it("signale une quantité absente sans rien inventer", () => {
    const r = computeBesoin({ ...base, quantityValue: "", quantityUnit: "tonnes" });
    expect(r.ok).toBe(false);
    expect(r.trips).toBeNull();
    expect(r.missing).toContain("la quantité");
  });
});

describe("comparateur — persistance de la sélection", () => {
  beforeEach(() => clearSelection());

  const sel: ComparateurSelection = {
    submissionId: "11111111-2222-3333-4444-555555555555",
    siteId: "site-1", siteLabel: "Dompe 12",
    distanceKm: 14.2, durationMinutes: 21,
    trips: 2, tonnes: 25,
    quantityValue: "25", quantityUnit: "tonnes",
    materialKey: "terre", materialLabel: "Terre",
    truckKey: "10_roues", truckLabel: "Camion 10 roues",
    capacityTonnes: 15,
    address: "500 Bd Alphonse-Deshaies, Bécancour",
    coords: { lat: 46.38, lng: -72.38 },
    desiredDate: "2026-09-15", timeframe: "Cette semaine",
    accessDetails: ["Sol mou"], createdAt: Date.now(),
  };

  it("survit à un rechargement et reste liée à la demande existante", () => {
    saveSelection(sel);
    const back = loadSelection();
    expect(back?.siteId).toBe("site-1");
    expect(back?.submissionId).toBe(sel.submissionId);
    expect(back?.trips).toBe(2);
  });

  it("peut être effacée pour changer de site", () => {
    saveSelection(sel);
    clearSelection();
    expect(loadSelection()).toBeNull();
  });
});
