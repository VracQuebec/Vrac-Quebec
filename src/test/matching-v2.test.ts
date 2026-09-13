import { describe, it, expect } from "vitest";
import {
  MATCHING_V2_VERSION,
  evaluateMatchV2,
  matchOfferToDemands,
  matchDemandToOffers,
  matchComposition,
  matchGranulometry,
  matchCapacity,
  distanceProfile,
  truckOptions,
  pickBestTruck,
  planDistributionOptions,
  buildMatchingMatrix,
  matrixSummary,
  hiddenOpportunities,
  recommendedQuestion,
  underusedDemands,
  offersWithoutMatch,
  networkAnalytics,
  type DemandRow,
  type OfferInput,
} from "@/lib/matching/v2";
import type { VehicleProfileLite } from "@/lib/matching/engine";

const vehicles: VehicleProfileLite[] = [
  { configCode: "porteur_10_roues", capacityTonnes: 18, mirrorToMirrorWidthM: 2.9, overallHeightM: 3.9, overallLengthM: 9 },
  { configCode: "porteur_12_roues", capacityTonnes: 25, mirrorToMirrorWidthM: 3.0, overallHeightM: 3.9, overallLengthM: 11 },
  { configCode: "semi_2_essieux", capacityTonnes: 30, mirrorToMirrorWidthM: 3.1, overallHeightM: 4.1, overallLengthM: 20 },
  { configCode: "semi_3_essieux", capacityTonnes: 36, mirrorToMirrorWidthM: 3.1, overallHeightM: 4.1, overallLengthM: 21 },
  { configCode: "semi_4_essieux", capacityTonnes: 40, mirrorToMirrorWidthM: 3.1, overallHeightM: 4.1, overallLengthM: 22 },
];

const demand = (over: Partial<DemandRow> = {}): DemandRow => ({
  id: "d1",
  dompe_number: "D-1",
  availability_status: "available",
  materials: "terre",
  distance_km: 11,
  distance_kind: "GEODESIQUE",
  remaining_capacity: "3000 t",
  accepted_materials: [],
  access: { accepts_semi_trailer: true, accepts_12_roues: true, access_width_m: 6, clear_height_m: 7, max_practical_length_m: 30 },
  ...over,
});

const offer = (over: Partial<OfferInput> = {}): OfferInput => ({
  id: "o1",
  label: "Offre test",
  quantityTonnes: 400,
  materials: [
    { slug: "terre", label: "terre" },
    { slug: "sable", label: "sable" },
    { slug: "glaise", label: "glaise" },
    { slug: "petites-pierres", label: "petites pierres", maxSizeInches: 6, sizeSource: "DECLARE" },
  ],
  ...over,
});

const accept = (...slugs: string[]) =>
  slugs.map((s) => ({ slug: s, name: s, confirmation_status: "accepted" }));

describe("Lot 8 — matching bidirectionnel V2", () => {
  it("400 t terre+sable+glaise+petites pierres → demande acceptant tout", () => {
    const d = demand({ accepted_materials: accept("terre", "sable", "glaise", "petites-pierres"), max_size_inches: 18 });
    const r = evaluateMatchV2(offer(), d, vehicles);
    expect(r.composition.state).toBe("CONFIRME");
    expect(["EXCELLENT", "TRES_BON"]).toContain(r.category);
    expect(r.algorithmVersion).toBe(MATCHING_V2_VERSION);
  });

  it("glaise inconnue → match possible / à confirmer, jamais supprimé", () => {
    const d = demand({ accepted_materials: accept("terre", "sable", "petites-pierres"), max_size_inches: 18 });
    const r = evaluateMatchV2(offer(), d, vehicles);
    expect(r.composition.state).toBe("A_CONFIRMER");
    expect(r.category).not.toBe("INCOMPATIBLE");
    const res = matchOfferToDemands(offer(), [d], vehicles);
    expect(res).toHaveLength(1);
  });

  it("refus explicite du béton → incompatible", () => {
    const d = demand({
      accepted_materials: [...accept("terre"), { slug: "beton", name: "béton", stance: "refused" }],
    });
    const o = offer({ materials: [{ slug: "terre" }, { slug: "beton", label: "béton" }] });
    const c = matchComposition(o, d);
    expect(c.state).toBe("INCOMPATIBLE");
    expect(c.explicitRefusal).toBe("béton");
    expect(evaluateMatchV2(o, d, vehicles).category).toBe("INCOMPATIBLE");
  });

  it("béton inconnu → à confirmer, jamais NON", () => {
    const d = demand({ accepted_materials: accept("terre") });
    const c = matchComposition(offer({ materials: [{ slug: "terre" }, { slug: "beton", label: "béton" }] }), d);
    expect(c.state).toBe("A_CONFIRMER");
    expect(c.incompatible).toBe(0);
  });

  it("granulométrie : 18 po offerts vs 12 po acceptés → incompatible", () => {
    const g = matchGranulometry(offer({ maxSizeInches: 18, sizeSource: "MESURE" }), demand({ max_size_inches: 12 }));
    expect(g.state).toBe("INCOMPATIBLE");
    expect(g.offerSource).toBe("MESURE");
  });

  it("granulométrie inconnue → à confirmer", () => {
    expect(matchGranulometry(offer({ materials: [{ slug: "terre" }] }), demand()).state).toBe("A_CONFIRMER");
    const ok = matchGranulometry(offer({ maxSizeInches: 4 }), demand({ max_size_inches: 18 }));
    expect(ok.state).toBe("CONFIRME");
  });

  it("capacité : 400 t disponibles vs 3000 t recherchées → compatible", () => {
    const c = matchCapacity(offer(), demand());
    expect(c.state).toBe("CONFIRME");
    expect(c.partial).toBe(false);
  });

  it("capacité inconnue → jamais exclue, « capacité à confirmer »", () => {
    const c = matchCapacity(offer(), demand({ remaining_capacity: null }));
    expect(c.state).toBe("A_CONFIRMER");
    expect(c.reason).toMatch(/à confirmer/);
  });

  it("partial match : 2000 t réparties sur 3 demandes", () => {
    const demands = [
      demand({ id: "A", dompe_number: "A", remaining_capacity: "800 t", accepted_materials: accept("terre"), distance_km: 4 }),
      demand({ id: "B", dompe_number: "B", remaining_capacity: "700 t", accepted_materials: accept("terre"), distance_km: 9 }),
      demand({ id: "C", dompe_number: "C", remaining_capacity: "500 t", accepted_materials: accept("terre"), distance_km: 15 }),
    ];
    const o = offer({ quantityTonnes: 2000, materials: [{ slug: "terre" }] });
    const results = matchOfferToDemands(o, demands, vehicles);
    const options = planDistributionOptions(2000, results, 25);
    expect(options.map((x) => x.sites)).toEqual([1, 2, 3]);
    expect(options[2].allocated).toBe(2000);
    expect(options[0].unallocated).toBeGreaterThan(0);
    expect(options[2].note).toMatch(/aucune réservation/i);
  });

  it("camion incompatible → non accessible", () => {
    const d = demand({ access: { accepts_12_roues: false, access_width_m: 2.5, clear_height_m: 3.0 }, accepted_materials: accept("terre") });
    const opts = truckOptions(d, [vehicles[1]], 400);
    expect(opts[0].compatible).toBe(false);
    expect(pickBestTruck(opts)).toBeNull();
  });

  it("semi inconnu → à valider, jamais non accessible", () => {
    const d = demand({ access: { access_width_m: null }, accepted_materials: accept("terre") });
    const opts = truckOptions(d, [vehicles[3]], 400);
    expect(opts[0].access.verdict).not.toBe("NON_ACCESSIBLE");
    expect(opts[0].compatible).toBe(true);
  });

  it("choix du camion en simulation + nombre de voyages arrondi vers le haut", () => {
    const d = demand({ accepted_materials: accept("terre") });
    const opts = truckOptions(d, vehicles, 400);
    expect(opts.find((o) => o.configCode === "porteur_12_roues")?.trips).toBe(16);
    expect(opts.find((o) => o.configCode === "semi_3_essieux")?.trips).toBe(12);
    expect(pickBestTruck(opts)).not.toBeNull();
  });

  it("20 voyages semi 2 essieux — sable terreux + tuff < 18 po", () => {
    const d = demand({ accepted_materials: accept("sable-terreux", "tuff"), max_size_inches: 18 });
    const o = offer({
      quantityTonnes: 600,
      configCode: "semi_2_essieux",
      maxSizeInches: 17,
      materials: [{ slug: "sable-terreux", label: "sable terreux" }, { slug: "tuff", label: "tuff" }],
    });
    const r = evaluateMatchV2(o, d, vehicles);
    expect(r.bestTruck?.configCode).toBe("semi_2_essieux");
    expect(r.bestTruck?.trips).toBe(20);
    expect(r.granulometry.state).toBe("CONFIRME");
  });

  it("distance : aller / retour / cycle et approximation géodésique", () => {
    const p = distanceProfile(demand({ distance_km: 30, distance_kind: "GEODESIQUE" }));
    expect(p.allerKm).toBe(30);
    expect(p.cycleKm).toBe(60);
    expect(p.isApproximation).toBe(true);
    const road = distanceProfile(demand({ distance_km: 30, distance_kind: "ROUTIERE" }));
    expect(road.isApproximation).toBe(false);
    expect(road.cycleMinutes).toBeGreaterThan(road.allerMinutes ?? 0);
  });

  it("distance proche mais mauvais matériau < distance élevée mais excellent matériau", () => {
    const o = offer({ materials: [{ slug: "terre" }], quantityTonnes: 100 });
    const proche = demand({ id: "proche", distance_km: 3, materials: "asphalte", accepted_materials: accept("asphalte") });
    const loin = demand({ id: "loin", distance_km: 60, accepted_materials: accept("terre") });
    const ranked = matchOfferToDemands(o, [proche, loin], vehicles);
    expect(ranked[0].demandId).toBe("loin");
  });

  it("score explicable et décomposable, aucun code technique affiché", () => {
    const d = demand({ accepted_materials: accept("terre", "sable", "glaise", "petites-pierres"), max_size_inches: 18 });
    const r = evaluateMatchV2(offer(), d, vehicles);
    expect(Object.keys(r.subScores)).toEqual([
      "material_score", "distance_score", "capacity_score", "truck_score",
      "access_score", "availability_score", "data_confidence_score",
    ]);
    expect(r.explanations.length).toBeGreaterThan(4);
    expect(r.explanations.every((e) => !/_/.test(e.text.replace(/ /g, "")))).toBe(true);
  });

  it("demande → offres : même moteur dans l'autre direction", () => {
    const d = demand({ accepted_materials: accept("terre") });
    const res = matchDemandToOffers(d, [offer({ id: "o1", materials: [{ slug: "terre" }] }), offer({ id: "o2", materials: [{ slug: "asphalte" }] })], vehicles);
    expect(res).toHaveLength(2);
    expect(res[0].offerId).toBe("o1");
  });

  it("matrice, opportunités cachées et valeur de la donnée manquante", () => {
    const demands = [
      demand({ id: "d1", accepted_materials: accept("terre"), remaining_capacity: null }),
      demand({ id: "d2", accepted_materials: accept("terre", "sable"), remaining_capacity: null }),
    ];
    const cells = buildMatchingMatrix([offer()], demands, vehicles);
    expect(cells).toHaveLength(2);
    const sum = matrixSummary(cells);
    expect(sum.EXCELLENT + sum.TRES_BON + sum.POSSIBLE + sum.A_CONFIRMER + sum.INCOMPATIBLE).toBe(2);
    const opp = hiddenOpportunities(cells);
    expect(opp.length).toBeGreaterThan(0);
    expect(opp[0].value).toBeGreaterThan(0);
    const q = recommendedQuestion(cells.map((c) => c.result), "d1");
    expect(q?.question).toBeTruthy();
  });

  it("demandes sous-exploitées : potentiel d'élargissement sans modification", () => {
    const rows = underusedDemands([
      demand({ id: "u1", materials: "terre sablonneuse avec glaise", accepted_materials: accept("terre") }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].potentialMaterials.length).toBeGreaterThan(0);
    expect(rows[0].note).toMatch(/aucune modification automatique/i);
  });

  it("offres sans match et analytics réseau", () => {
    const d = demand({ max_size_inches: 12, accepted_materials: accept("terre") });
    const big = offer({ id: "roche", label: "roche > 18 po", maxSizeInches: 24, materials: [{ slug: "roche" }] });
    const cells = buildMatchingMatrix([big], [d], vehicles);
    const none = offersWithoutMatch([big], cells);
    expect(none).toHaveLength(1);
    expect(none[0].blockedBy.join(" ")).toMatch(/grosseur/);
    const stats = networkAnalytics([big], [d], cells);
    expect(stats.offersWithoutSolution).toBe(1);
    expect(stats.disclaimer).toMatch(/pas des mesures exactes/);
  });

  it("une demande indisponible n'est jamais proposée", () => {
    const d = demand({ availability_status: "lost", accepted_materials: accept("terre") });
    expect(matchOfferToDemands(offer(), [d], vehicles)).toHaveLength(0);
  });
});
