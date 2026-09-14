import { describe, it, expect } from "vitest";
import {
  runMatchingPipeline,
  simulateSplit,
  haversineKm,
  buildLoad,
  isAdmissible,
  DEFAULT_WEIGHTS,
  type PipelineCandidate,
} from "@/lib/matching/pipeline";

const mat = (name: string, stance: "accepted" | "refused" | "unknown" = "accepted") => ({
  slug: name, name, stance, source: "historical", confidence: "medium", confirmation_status: "inherited",
});

const base = (over: Partial<PipelineCandidate> & { id: string }): PipelineCandidate => ({
  status: "en attente de livraison",
  availability_status: "available",
  latitude: 46.8, longitude: -71.2,
  accepted_materials: [],
  ...over,
});

// Jeu de demandes de simulation (aucune donnée réelle modifiée).
const CANDIDATES: PipelineCandidate[] = [
  base({ id: "A", city: "Québec", dompe_number: "A", accepted_materials: [mat("terre"), mat("sable"), mat("pierre")], remaining_trips: 30, truck_types_allowed: ["semi_remorque"], availability_confirmed_at: new Date().toISOString() }),
  base({ id: "B", city: "Lévis", dompe_number: "B", accepted_materials: [mat("terre"), mat("beton", "refused")], remaining_trips: 5, latitude: 46.78, longitude: -71.18 }),
  base({ id: "C", city: "Loin", dompe_number: "C", accepted_materials: [mat("terre"), mat("sable"), mat("roche")], remaining_trips: 50, max_inches: 18, latitude: 47.5, longitude: -71.9 }),
  base({ id: "D", city: "Perdue", dompe_number: "D", status: "perdu", accepted_materials: [mat("terre")] }),
  base({ id: "E", city: "Archivée", dompe_number: "E", status: "archivé", accepted_materials: [mat("terre")] }),
  base({ id: "F", city: "Sèche", dompe_number: "F", accepted_materials: [mat("terre")], conditions: ["sec"] }),
  base({ id: "G", city: "Env", dompe_number: "G", accepted_materials: [mat("terre")], environment_requirement: "CHARACTERIZATION_REQUIRED" }),
];

const origin = { lat: 46.81, lng: -71.21 };
const run = (text: string, extra: Record<string, unknown> = {}) =>
  runMatchingPipeline({ text, origin, ...extra }, CANDIDATES);

describe("LOT 11 — admissibilité et protections", () => {
  it("exclut les demandes perdues et archivées", () => {
    const r = run("terre");
    expect(r.results.find((x) => x.requestId === "D")).toBeUndefined();
    expect(r.results.find((x) => x.requestId === "E")).toBeUndefined();
    expect(r.excluded).toBeGreaterThanOrEqual(2);
  });

  it("isAdmissible refuse une disponibilité non available", () => {
    expect(isAdmissible(base({ id: "x", availability_status: "lost" })).ok).toBe(false);
  });
});

describe("LOT 11 — 15 cas terrain", () => {
  it("CAS 1 — 400 tonnes terre sablonneuse avec glaise et cailloux", () => {
    const r = run("400 tonnes de terre sablonneuse avec un peu de glaise et des petits cailloux");
    expect(r.evaluated).toBeGreaterThan(0);
    expect(r.load.composition.materials.length).toBeGreaterThanOrEqual(3);
    expect(r.summary.compatible + r.summary.possible).toBeGreaterThan(0);
  });

  it("CAS 2 — 20 voyages semi 2 essieux sable terreux + tuff < 18 po", () => {
    const r = run("20 voyages de semi 2 essieux avec du sable terreux mélangé avec du tuff de moins de 18 pouces");
    expect(r.load.trips).toBe(20);
    expect(r.load.maxInches).toBe(18);
    const a = r.results.find((x) => x.requestId === "A")!;
    expect(a.capacityMatch).toBe("TOTAL");
  });

  it("CAS 3 — 10 voyages de terre : capacité partielle sur B", () => {
    const r = run("10 voyages de terre");
    const b = r.results.find((x) => x.requestId === "B")!;
    expect(b.capacityMatch).toBe("PARTIEL");
    expect(b.usableTrips).toBe(5);
    expect(b.remainingTripsAfter).toBe(5);
  });

  it("CAS 4 — terre avec béton : refus explicite prioritaire", () => {
    const r = run("terre avec beton");
    const b = r.results.find((x) => x.requestId === "B")!;
    expect(b.compatibility).toBe("INCOMPATIBLE");
    expect(b.blockingReasons.join(" ")).toMatch(/refus/i);
  });

  it("CAS 5 — béton cassé sans armature", () => {
    const r = run("beton casse sans armature");
    expect(r.results.every((x) => x.compatibility !== "COMPATIBLE" || x.requestId !== "B")).toBe(true);
  });

  it("CAS 6 — béton avec armature reste au minimum à confirmer", () => {
    const r = run("beton avec armature");
    const a = r.results.find((x) => x.requestId === "A")!;
    expect(["POSSIBLE", "INCOMPATIBLE"]).toContain(a.compatibility);
  });

  it("CAS 7 — asphalte : jamais compatible certain sans acceptation", () => {
    const r = run("asphalte");
    expect(r.results.some((x) => x.compatibility === "COMPATIBLE")).toBe(false);
  });

  it("CAS 8 — roche 12 pouces sous la limite de 18 po", () => {
    const r = run("roche de 12 pouces");
    const c = r.results.find((x) => x.requestId === "C")!;
    expect(c.blockingReasons.some((b) => /dépasse/.test(b))).toBe(false);
  });

  it("CAS 9 — roche 24 pouces dépasse la limite de 18 po", () => {
    const r = run("roche de 24 pouces");
    const c = r.results.find((x) => x.requestId === "C")!;
    expect(c.compatibility).toBe("INCOMPATIBLE");
  });

  it("CAS 10 — terre mouillée vs demande « sec seulement »", () => {
    const r = run("terre mouillee");
    const f = r.results.find((x) => x.requestId === "F")!;
    expect(f.compatibility).toBe("INCOMPATIBLE");
  });

  it("CAS 11 — terre propre n'est pas une certification environnementale", () => {
    const r = run("terre propre");
    const g = r.results.find((x) => x.requestId === "G")!;
    expect(g.compatibility).toBe("POSSIBLE");
    expect(g.needsConfirmation.join(" ")).toMatch(/environnemental/i);
  });

  it("CAS 12 — incertitude : terre avec petite pierre", () => {
    const r = run("je sais pas exactement, c'est de la terre avec de la petite pierre dedans");
    expect(r.results.some((x) => x.compatibility !== "INCOMPATIBLE")).toBe(true);
  });

  it("CAS 13 — chargement plus grand qu'une seule demande → split simulé", () => {
    // 90 voyages dépassent la capacité de n'importe quelle demande du jeu d'essai.
    const r = run("90 voyages de terre");
    const split = simulateSplit(r, 90);
    expect(split.lines.length).toBeGreaterThan(1);
    expect(split.lines.reduce((s, l) => s + l.trips, 0)).toBeLessThanOrEqual(90);
  });

  it("CAS 14 — chargement compatible avec plusieurs demandes", () => {
    const r = run("10 voyages de terre et de sable");
    expect(r.summary.compatible + r.summary.possible).toBeGreaterThanOrEqual(2);
  });

  it("CAS 15 — proche incompatible vs plus loin compatible", () => {
    const r = run("terre avec beton");
    const b = r.results.find((x) => x.requestId === "B")!; // proche mais refus béton
    expect(b.compatibility).toBe("INCOMPATIBLE");
    expect(r.results[0].compatibility).not.toBe("INCOMPATIBLE");
  });
});

describe("LOT 11 — distance, score, fraîcheur", () => {
  it("distance approximative calculée et jamais routière", () => {
    const r = run("terre");
    const a = r.results.find((x) => x.requestId === "A")!;
    expect(a.distanceKind).toBe("APPROXIMATIVE");
    expect(a.distanceKm).not.toBeNull();
  });

  it("haversine cohérent", () => {
    expect(haversineKm({ lat: 46.8, lng: -71.2 }, { lat: 46.8, lng: -71.2 })).toBe(0);
    expect(haversineKm({ lat: 46.8, lng: -71.2 }, { lat: 46.9, lng: -71.2 })).toBeGreaterThan(10);
  });

  it("une demande jamais confirmée est marquée à revalider", () => {
    const r = run("terre");
    const c = r.results.find((x) => x.requestId === "C")!;
    expect(c.freshness).toBe("A_REVALIDER");
    expect(c.warnings.join(" ")).toMatch(/revalider/i);
  });

  it("score borné 0..100 et nul si incompatible", () => {
    const r = run("terre avec beton");
    for (const x of r.results) {
      expect(x.score).toBeGreaterThanOrEqual(0);
      expect(x.score).toBeLessThanOrEqual(100);
      if (x.compatibility === "INCOMPATIBLE") expect(x.score).toBe(0);
    }
  });

  it("les pondérations sont centralisées", () => {
    expect(Object.values(DEFAULT_WEIGHTS).every((w) => w > 0)).toBe(true);
  });

  it("filtre rayon maximum appliqué", () => {
    const r = runMatchingPipeline({ text: "terre", origin }, CANDIDATES, { filters: { maxDistanceKm: 20 } });
    expect(r.results.every((x) => (x.distanceKm ?? 0) <= 20)).toBe(true);
  });

  it("performance : 5 000 demandes évaluées rapidement", () => {
    const many = Array.from({ length: 5000 }, (_, i) => base({ id: `m${i}`, accepted_materials: [mat("terre")] }));
    const t0 = Date.now();
    const r = runMatchingPipeline({ text: "terre", origin }, many);
    expect(r.evaluated).toBe(5000);
    expect(Date.now() - t0).toBeLessThan(15000);
  });

  it("buildLoad conserve le texte original", () => {
    const l = buildLoad({ text: "Terre sablonneuse AVEC tuff" });
    expect(l.originalText).toBe("Terre sablonneuse AVEC tuff");
  });
});
