// LOT 20 — offres de matériaux réelles, géolocalisation et branchement matching.
import { describe, it, expect } from "vitest";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import { buildEnrichedProfile } from "@/lib/qualification/lot15";
import { parseMaterialDescription, applyManualCorrection } from "@/lib/material-language";
import {
  geographicDistance, classifyDistance, exceedsExplicitRadius, routeDistance,
  DEFAULT_DISTANCE_THRESHOLDS,
} from "@/lib/offers/distance";
import { geocode, manualCoordinates, manualGeocodingAdapter } from "@/lib/offers/geocoding";
import {
  loadMaterialOfferForMatching, offerMatchContext, offerDraftFromParsed, offerQuality,
  matchOffer, planOfferSplit, operationalScore, type RequestTarget,
} from "@/lib/offers/engine";
import { ENVIRONMENTAL_LABELS, type MaterialOffer } from "@/lib/offers/types";

const QUEBEC = { latitude: 46.8139, longitude: -71.208 };
const MONTREAL = { latitude: 45.5019, longitude: -73.5674 };

const offer = (over: Partial<MaterialOffer> = {}): MaterialOffer => ({
  id: "offer-1",
  created_at: "2026-09-14T00:00:00Z",
  updated_at: "2026-09-14T00:00:00Z",
  source_type: "free_text_parser",
  source_id: null,
  owner_user_id: null,
  status: "parsed",
  qualification_status: "unqualified",
  raw_description: "400 tonnes de terre sablonneuse avec un peu de glaise",
  quantity_value: 400,
  quantity_unit: "tonnes",
  quantity_approximate: true,
  trip_count: null,
  vehicle_type: null,
  principal_material: "terre",
  secondary_materials: ["sable"],
  trace_materials: ["argile"],
  granulometry_min_inches: null,
  granulometry_max_inches: null,
  granulometry_approximate: false,
  declared_clean: true,
  declared_contaminated: null,
  environmental_status: "stated_clean_by_user",
  location_raw: "Beauport",
  address: null,
  sector: null,
  city: "Beauport",
  region: null,
  latitude: QUEBEC.latitude,
  longitude: QUEBEC.longitude,
  geocoding_source: "manual_input",
  availability_start: null,
  availability_end: null,
  max_radius_km: null,
  notes: null,
  parser_confidence: 0.8,
  parser_version: "material-language-v1",
  ...over,
});

const target = (id: string, text: string, over: Partial<RequestTarget> = {}): RequestTarget => ({
  profile: buildEnrichedProfile(
    buildAcceptanceProfile({ submissionId: id, reference: id, text, available: true, lastConfirmedAt: null }),
  ),
  reference: id,
  point: QUEBEC,
  ...over,
});

describe("LOT 20 — distance", () => {
  it("Haversine Québec ↔ Montréal ≈ 233 km", () => {
    const km = geographicDistance(QUEBEC, MONTREAL)!;
    expect(km).toBeGreaterThan(225);
    expect(km).toBeLessThan(245);
  });
  it("distance nulle si coordonnée manquante", () => {
    expect(geographicDistance(QUEBEC, { latitude: null, longitude: null })).toBeNull();
  });
  it("classement de distance configurable", () => {
    expect(classifyDistance(5)).toBe("excellent_distance");
    expect(classifyDistance(200)).toBe("very_far");
    expect(classifyDistance(200, { ...DEFAULT_DISTANCE_THRESHOLDS, farKm: 500 })).toBe("far");
    expect(classifyDistance(null)).toBeNull();
  });
  it("distance routière non disponible dans ce lot", () => {
    expect(routeDistance()).toBeNull();
  });
  it("rayon maximal : contrainte dure seulement s'il est exprimé", () => {
    expect(exceedsExplicitRadius(31, 30)).toBe(true);
    expect(exceedsExplicitRadius(500, null)).toBe(false);
  });
});

describe("LOT 20 — géocodage", () => {
  it("adaptateur manuel : aucune coordonnée inventée", async () => {
    const r = await geocode({ city: "Beauport" });
    expect(r.resolved).toBe(false);
    expect(r.latitude).toBeNull();
    expect(r.city).toBe("Beauport");
    expect(manualGeocodingAdapter.name).toBe("manual");
  });
  it("coordonnées manuelles acceptées avec source explicite", () => {
    const r = manualCoordinates(46.8, -71.2);
    expect(r.resolved).toBe(true);
    expect(r.source).toBe("manual_input");
  });
});

describe("LOT 20 — parser → offre", () => {
  const parsed = parseMaterialDescription(
    "J'ai environ 400 tonnes de terre sablonneuse avec un peu de glaise et quelques petites roches à Beauport.",
  );

  it("brouillon issu du texte libre", () => {
    const draft = offerDraftFromParsed(parsed);
    expect(draft.source_type).toBe("free_text_parser");
    expect(draft.principal_material).toBe("terre");
    expect(draft.quantity_value).toBe(400);
    expect(draft.quantity_unit).toBe("tonnes");
    expect(draft.quantity_approximate).toBe(true);
    expect(draft.raw_description).toContain("400 tonnes");
    expect(draft.parser_version).toBe(parsed.version);
  });

  it("correction manuelle prise en compte", () => {
    const corrected = applyManualCorrection(parsed, { quantity: { value: 350, unit: "tonne" } });
    const draft = offerDraftFromParsed(corrected);
    expect(draft.quantity_value).toBe(350);
  });

  it("déclaration environnementale jamais transformée en preuve", () => {
    const clean = parseMaterialDescription("200 tonnes de terre propre");
    const draft = offerDraftFromParsed(clean);
    expect(draft.environmental_status).toBe("stated_clean_by_user");
    expect(ENVIRONMENTAL_LABELS.stated_clean_by_user).toContain("non vérifié");
  });
});

describe("LOT 20 — offre persistée → moteur", () => {
  it("conversion vers le modèle de chargement", () => {
    const load = loadMaterialOfferForMatching(offer());
    expect(load.id).toBe("offer-1");
    expect(load.materials.map((m) => m.materialKey)).toEqual(["terre", "sable", "argile"]);
    expect(load.materials[0].role).toBe("PRINCIPAL");
    expect(load.conditions.join(" ")).toContain("non vérifié");
  });

  it("contexte de match : quantité, distance, étiquette", () => {
    const ctx = offerMatchContext(offer(), target("r1", "j'accepte de la terre"));
    expect(ctx.quantity).toEqual({ value: 400, unit: "tonnes" });
    expect(ctx.distanceKm).toBe(0);
    expect(ctx.label).toBe("Beauport");
  });

  it("matière mixte et granulométrie évaluées", () => {
    const rows = matchOffer(
      offer({ granulometry_max_inches: 24 }),
      [target("r1", "j'accepte terre et sable, roches maximum 12 pouces")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].granulometry).toBeTruthy();
    expect(rows[0].reasons.length).toBeGreaterThan(0);
  });

  it("la distance n'annule pas la compatibilité matière", () => {
    const near = matchOffer(offer(), [target("r1", "j'accepte de la terre")])[0];
    const far = matchOffer(offer(), [target("r1", "j'accepte de la terre", { point: MONTREAL })])[0];
    expect(far.state).toBe(near.state);
    expect(far.distanceBand).toBe("very_far");
  });

  it("rayon explicite : le dépassement est signalé", () => {
    const row = matchOffer(offer(), [
      target("r1", "j'accepte de la terre", { point: MONTREAL, maxRadiusKm: 30 }),
    ])[0];
    expect(row.blockedByRadius).toBe(true);
  });

  it("score opérationnel distinct du statut de compatibilité", () => {
    const rows = matchOffer(offer(), [target("r1", "j'accepte de la terre")]);
    expect(rows[0].operational.score).toBeGreaterThanOrEqual(0);
    expect(rows[0].operational.score).toBeLessThanOrEqual(100);
    expect(rows[0].state).toBeDefined();
    expect(Object.keys(rows[0])).toContain("operational");
  });

  it("capacité partielle et répartition multi-remblai", () => {
    const targets = [
      target("a", "j'accepte de la terre, capacité 150 tonnes"),
      target("b", "j'accepte de la terre, capacité 200 tonnes"),
      target("c", "j'accepte de la terre, capacité 100 tonnes"),
    ];
    const plan = planOfferSplit(offer(), targets);
    expect(plan.placed + plan.leftover).toBe(400);
    expect(plan.parts.length).toBeGreaterThan(0);
  });

  it("aucune confirmation réelle n'est produite par le calcul", () => {
    const rows = matchOffer(offer(), [target("r1", "j'accepte de la terre")]);
    expect(JSON.stringify(rows)).not.toContain("confirmed_by");
    expect(rows.every((r) => typeof r.requestId === "string")).toBe(true);
  });
});

describe("LOT 20 — qualité, statuts et minimum requis", () => {
  it("jauge de complétude et champs manquants", () => {
    const q = offerQuality(offer({ availability_start: null, granulometry_max_inches: null }));
    expect(q.percent).toBeGreaterThan(50);
    expect(q.missingOptional).toContain("date de disponibilité");
    expect(q.matchable).toBe(true);
  });

  it("sans matériau principal : non matchable", () => {
    const q = offerQuality(offer({ principal_material: null }));
    expect(q.matchable).toBe(false);
    expect(q.missingRequired).toContain("matériau principal");
  });

  it("statuts et archivage lisibles", () => {
    const archived = offer({ status: "archived" });
    expect(archived.status).toBe("archived");
    const q = offerQuality(archived);
    expect(q.environmentalLabel).toContain("non vérifié");
  });

  it("score opérationnel pénalisé par les informations manquantes", () => {
    const rows = matchOffer(offer({ latitude: null, longitude: null, quantity_value: null }), [
      target("r1", "je sais pas trop"),
    ]);
    const withData = matchOffer(offer(), [target("r2", "j'accepte de la terre")]);
    expect(rows[0].operational.score).toBeLessThanOrEqual(withData[0].operational.score);
  });

  it("operationalScore reste borné", () => {
    const rows = matchOffer(offer(), [target("r1", "j'accepte de la terre")]);
    const s = operationalScore(
      { ...rows[0], capacity: { known: false, partial: false } } as never,
      { openQuestions: 50 },
    );
    expect(s.score).toBeGreaterThanOrEqual(0);
  });
});

describe("LOT 20 — performance", () => {
  it("100 offres × 500 demandes reste sous 20 s", () => {
    const targets = Array.from({ length: 500 }, (_, i) => target(`r${i}`, "j'accepte de la terre et du sable"));
    const offers = Array.from({ length: 100 }, (_, i) => offer({ id: `o${i}` }));
    const t0 = Date.now();
    let total = 0;
    for (const o of offers) total += matchOffer(o, targets).length;
    expect(total).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(20_000);
  }, 30_000);
});
