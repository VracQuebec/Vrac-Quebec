import { describe, it, expect } from "vitest";
import {
  matchMaterial,
  evaluateAccess,
  evaluateCandidate,
  rankCandidates,
  planAllocation,
  computeQuantity,
  availabilityState,
  parseCapacityTonnes,
  MATCHING_ALGORITHM_VERSION,
  type CandidateRow,
  type VehicleProfileLite,
} from "@/lib/matching/engine";

const base = (over: Partial<CandidateRow> = {}): CandidateRow => ({
  id: "s1",
  dompe_number: "D-1",
  availability_status: "available",
  materials: "terre",
  accepted_materials: [],
  distance_km: 8,
  distance_kind: "GEODESIQUE",
  ...over,
});

const truck12: VehicleProfileLite = {
  configCode: "porteur_12_roues",
  capacityTonnes: 28,
  overallLengthM: 11,
  mirrorToMirrorWidthM: 3.0,
  overallHeightM: 3.9,
};

describe("matching interne v1 — matériau", () => {
  it("1. match exact confirmé", () => {
    const m = matchMaterial({ materialSlug: "terre-brune" }, base({
      accepted_materials: [{ slug: "terre-brune", name: "Terre brune", confirmation_status: "accepted" }],
    }));
    expect(m.kind).toBe("MATCH_EXACT");
    expect(m.compatibility).toBe("COMPATIBLE_CONFIRME");
  });

  it("2. match par famille", () => {
    const m = matchMaterial({ materialSlug: "terre-noire", materialFamilyId: "f1" }, base({
      accepted_materials: [{ slug: "terre-brune", family_id: "f1", family: "Terre" }],
    }));
    expect(m.kind).toBe("MATCH_FAMILLE");
    expect(m.compatibility).toBe("COMPATIBLE_PROBABLE");
  });

  it("3. match historique (valeur d'origine)", () => {
    const m = matchMaterial({ materialLabel: "Terre Brune" }, base({
      accepted_materials: [{ slug: "terre", original_value: "terre brune" }],
    }));
    expect(m.kind).toBe("MATCH_HISTORIQUE");
  });

  it("4. matériau ambigu → à valider, jamais supprimé", () => {
    const m = matchMaterial({ materialLabel: "terre" }, base({ materials: "terre et sable", accepted_materials: [] }));
    expect(m.kind).toBe("MATCH_PROBABLE");
    expect(m.compatibility).toBe("A_VALIDER");
  });

  it("5. matériau inconnu côté demande → à valider", () => {
    const m = matchMaterial({ materialSlug: "gravier" }, base({ materials: null, accepted_materials: [] }));
    expect(m.compatibility).toBe("A_VALIDER");
  });

  it("refus explicite → incompatible", () => {
    const m = matchMaterial({ materialSlug: "beton" }, base({
      accepted_materials: [{ slug: "beton", stance: "refused" }],
    }));
    expect(m.compatibility).toBe("INCOMPATIBLE");
  });
});

describe("matching interne v1 — distance, camion, accessibilité", () => {
  it("6/7. le proche marque plus que l'éloigné", () => {
    const q = { materialSlug: "terre" };
    const near = evaluateCandidate(q, base({ distance_km: 5, accepted_materials: [{ slug: "terre" }] }), truck12);
    const far = evaluateCandidate(q, base({ id: "s2", distance_km: 120, accepted_materials: [{ slug: "terre" }] }), truck12);
    expect(near.score).toBeGreaterThan(far.score);
  });

  it("8/9. capacité connue vs inconnue", () => {
    expect(parseCapacityTonnes("800 t")).toBe(800);
    const unknown = evaluateCandidate({ materialSlug: "terre" }, base({ accepted_materials: [{ slug: "terre" }] }), truck12);
    expect(unknown.missingData).toContain("capacité restante inconnue");
  });

  it("10. camion accepté → accessible", () => {
    const a = evaluateAccess(truck12, {
      accepts_12_roues: true, access_width_m: 5, clear_height_m: 6, max_practical_length_m: 20,
    });
    expect(a.verdict).toBe("ACCESSIBLE");
  });

  it("11. camion refusé → non accessible", () => {
    const a = evaluateAccess(truck12, { accepts_12_roues: false });
    expect(a.verdict).toBe("NON_ACCESSIBLE");
  });

  it("12. accessibilité inconnue → à valider, jamais NON", () => {
    const a = evaluateAccess(truck12, null);
    expect(a.verdict).toBe("A_VALIDER");
    const b = evaluateAccess(truck12, { access_width_m: null });
    expect(b.verdict).not.toBe("NON_ACCESSIBLE");
  });
});

describe("matching interne v1 — quantités et répartition", () => {
  it("14/15. conversion estimée et nombre de voyages arrondi vers le haut", () => {
    const q = computeQuantity({ quantity: 400, unit: "tonnes", truckCapacityTonnes: 28 });
    expect(q.trips).toBe(15);
    const est = computeQuantity({ quantity: 100, unit: "m3", density: { avgKgPerM3: 1600, isEstimate: true }, truckCapacityTonnes: 28 });
    expect(est.isEstimate).toBe(true);
    expect(est.tonnes).toBeCloseTo(160, 5);
  });

  it("13. répartition multi-remblais sans réservation", () => {
    const q = { materialSlug: "terre" };
    const cands = [
      base({ id: "A", remaining_capacity: "800 t", accepted_materials: [{ slug: "terre" }], distance_km: 4 }),
      base({ id: "B", remaining_capacity: "700 t", accepted_materials: [{ slug: "terre" }], distance_km: 9 }),
      base({ id: "C", remaining_capacity: "500 t", accepted_materials: [{ slug: "terre" }], distance_km: 15 }),
    ];
    const plan = planAllocation(2000, rankCandidates(q, cands, truck12), 28);
    expect(plan.allocated).toBe(2000);
    expect(plan.lines).toHaveLength(3);
    expect(plan.note).toMatch(/aucune réservation/i);
  });
});

describe("matching interne v1 — score, confiance, données manquantes", () => {
  it("16. le score est explicable", () => {
    const r = evaluateCandidate({ materialSlug: "terre" }, base({ accepted_materials: [{ slug: "terre", confirmation_status: "accepted" }] }), truck12);
    expect(r.factors.length).toBeGreaterThan(3);
    expect(r.factors.reduce((s, f) => s + f.points, 0)).toBeGreaterThan(0);
    expect(MATCHING_ALGORITHM_VERSION).toBe("v1");
  });

  it("niveau de confiance et données manquantes", () => {
    const r = evaluateCandidate({ materialSlug: "terre" }, base({ availability_status: null, accepted_materials: [] }), truck12);
    expect(["A_VALIDER", "MOYENNE", "FAIBLE"]).toContain(r.confidence);
    expect(r.missingData.length).toBeGreaterThan(0);
    expect(availabilityState({ id: "x" }).state).toBe("INCONNU");
  });

  it("une demande perdue/archivée n'est jamais proposée", () => {
    const out = rankCandidates({ materialSlug: "terre" }, [base({ availability_status: "lost", accepted_materials: [{ slug: "terre" }] })], truck12);
    expect(out).toHaveLength(0);
  });
});
