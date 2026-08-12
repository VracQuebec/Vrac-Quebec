import { describe, it, expect, beforeEach } from "vitest";
import {
  buildHandoff, saveHandoff, loadHandoff, clearHandoff, tripsFromHandoff, HANDOFF_KEY,
} from "@/lib/parcours/handoff";

const base = {
  submissionId: "11111111-2222-3333-4444-555555555555",
  address: "500 Bd Alphonse-Deshaies, Bécancour, QC G9H 2Y9",
  lat: 46.3890886,
  lng: -72.3807546,
  materials: ["Terre", "Sable"],
  quantityValue: "25",
  quantityUnit: "tonnes",
  quantityLabel: "25 tonnes",
  truckType: "Camion 10 roues",
  desiredDate: "2026-09-15",
  timeframe: "Cette semaine",
  accessHeavyTruck: "Probablement",
  accessDetails: ["Sol mou ou boueux"],
};

describe("parcours handoff", () => {
  beforeEach(() => clearHandoff());

  it("conserve l'ID réel de la demande", () => {
    expect(buildHandoff(base).submissionId).toBe(base.submissionId);
  });

  it("ne convertit jamais la quantité ni l'unité", () => {
    const h = buildHandoff(base);
    expect(h.quantityValue).toBe("25");
    expect(h.quantityUnit).toBe("tonnes");
    expect(h.quantityLabel).toBe("25 tonnes");
    expect(tripsFromHandoff(h)).toBe("");
  });

  it("transmet les voyages seulement quand l'unité est « voyages »", () => {
    const h = buildHandoff({ ...base, quantityValue: "4", quantityUnit: "voyages" });
    expect(tripsFromHandoff(h)).toBe("4");
  });

  it("normalise matériau et camion avec la logique existante", () => {
    const h = buildHandoff(base);
    expect(h.material).toBe("Terre");
    expect(h.materialKey).toBe("terre");
    expect(h.truckKey).toBe("10_roues");
  });

  it("laisse la clé nulle pour un matériau/camion inconnu", () => {
    const h = buildHandoff({ ...base, materials: ["Je ne suis pas certain"], truckType: "Je ne sais pas" });
    expect(h.materialKey).toBeNull();
    expect(h.truckKey).toBeNull();
  });

  it("n'invente pas de coordonnées quand l'adresse est manuelle", () => {
    const h = buildHandoff({ ...base, lat: null, lng: null });
    expect(h.coords).toBeNull();
    expect(h.address).toBe(base.address);
  });

  it("transmet accès, restrictions, date et délai tels quels", () => {
    const h = buildHandoff(base);
    expect(h.accessHeavyTruck).toBe("Probablement");
    expect(h.accessDetails).toEqual(["Sol mou ou boueux"]);
    expect(h.desiredDate).toBe("2026-09-15");
    expect(h.timeframe).toBe("Cette semaine");
  });

  it("survit à un rechargement via sessionStorage", () => {
    const h = buildHandoff(base);
    saveHandoff(h);
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeTruthy();
    const back = loadHandoff();
    expect(back?.submissionId).toBe(base.submissionId);
    expect(back?.coords).toEqual({ lat: base.lat, lng: base.lng });
    clearHandoff();
    expect(loadHandoff()).toBeNull();
  });
});
