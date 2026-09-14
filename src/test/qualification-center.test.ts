// LOT 13 — Centre de contrôle intelligent des demandes de remblai (tests purs).
import { describe, expect, it } from "vitest";
import {
  applyFilters, buildAcceptanceProfile, buildUnknownTermsQueue, bulkConfirmEligibility,
  classifyNoRelation, classifyNoRelationBatch, computeCounters, computePriority,
  confidenceOf, corpusStats, detectBroadAcceptance, hasUnknownCue, impactRanking,
  isUsageOnlyTerm, materialMatrix, matchQuality, networkPotential, searchProfiles,
  simulateQuickAction, thirtySecondCard, thirtySecondQueue,
  QUALIFICATION_CENTER_VERSION,
} from "@/lib/qualification/lot13";
import { buildLoadFromInterpretation } from "@/lib/matching/compatibility";
import { interpretChantier } from "@/lib/nlu/chantier";

const profile = (text: string, extra: Partial<Parameters<typeof buildAcceptanceProfile>[0]> = {}) =>
  buildAcceptanceProfile({ submissionId: extra.submissionId ?? "s1", text, ...extra });

const load = (text: string) =>
  buildLoadFromInterpretation(interpretChantier(text, { direction: "EVACUATION" }), { id: text.slice(0, 8) });

const keys = (list: { materialKey: string }[]) => list.map((m) => m.materialKey).sort();

describe("Lot 13 — fondations", () => {
  it("version et texte original conservés", () => {
    const p = profile("Terre et sable seulement");
    expect(p.version).toBe(QUALIFICATION_CENTER_VERSION);
    expect(p.originalText).toBe("Terre et sable seulement");
  });

  it("haute confiance n'est jamais une confirmation", () => {
    expect(confidenceOf("original_text")).toBe("HAUTE");
    expect(confidenceOf("original_text", true)).toBe("CONFIRME");
    expect(confidenceOf("nlu_medium")).toBe("FAIBLE");
    expect(confidenceOf("unknown")).toBe("INCONNU");
    const p = profile("terre et sable");
    expect(p.accepted.every((m) => m.confidence !== "CONFIRME")).toBe(true);
  });

  it("absence n'est jamais un refus", () => {
    const p = profile("terre, sable");
    expect(keys(p.accepted)).toContain("terre");
    expect(p.refused).toHaveLength(0);
  });

  it("« remplissage » est un usage, pas un matériau", () => {
    expect(isUsageOnlyTerm("besoin de remplissage")).toBe(true);
    const p = profile("Remplir un trou sur mon terrain");
    expect(p.accepted).toHaveLength(0);
    expect(p.usageOnly).toBe(true);
  });

  it("« je ne sais pas » reste inconnu mais le reste est analysé", () => {
    expect(hasUnknownCue("je sais pas exactement")).toBe(true);
    const p = profile("je sais pas exactement mais c'est surtout terre et petite roche");
    expect(keys(p.accepted)).toEqual(expect.arrayContaining(["terre"]));
    expect(p.unknownStated).toBe(true);
  });
});

describe("Acceptation large", () => {
  it("détecte les formulations larges", () => {
    expect(detectBroadAcceptance("accepte pas mal de tout").broad).toBe(true);
    expect(detectBroadAcceptance("prend presque n'importe quoi").broad).toBe(true);
    expect(detectBroadAcceptance("tout sauf béton").broad).toBe(true);
    expect(detectBroadAcceptance("terre et sable").broad).toBe(false);
  });

  it("« n'importe quoi sauf glaise » ne contourne pas le refus", () => {
    const p = profile("n'importe quoi sauf glaise");
    expect(p.broadAcceptance).toBe(true);
    expect(keys(p.refused)).toContain("argile");
  });

  it("acceptation large ne devient jamais une confirmation en masse", () => {
    const p = profile("prend presque n'importe quoi");
    expect(bulkConfirmEligibility(p).eligible).toBe(false);
  });
});

describe("Contradictions", () => {
  it("matériau accepté et refusé", () => {
    const p = profile("accepte béton, pas de béton");
    expect(p.contradictions.some((c) => c.code === "MATERIAL_ACCEPT_AND_REFUSE")).toBe(true);
  });

  it("conflit de dimensions", () => {
    const p = profile("roche maximum 18 pouces, roche 24 pouces acceptée");
    expect(p.contradictions.some((c) => c.code === "SIZE_CONFLICT")).toBe(true);
  });

  it("une contradiction bloque la confirmation rapide", () => {
    const p = profile("accepte béton, pas de béton");
    expect(bulkConfirmEligibility(p).eligible).toBe(false);
    expect(bulkConfirmEligibility(p).blockers).toContain("contradiction détectée");
  });
});

describe("Scores", () => {
  it("qualité globale et qualité pour ce match sont distinctes", () => {
    const p = profile("Accepte terre, sable, pierre et béton");
    const q = matchQuality(p, load("40 tonnes de terre"));
    expect(p.globalScore).toBeGreaterThan(0);
    expect(q.score).toBeGreaterThanOrEqual(80);
  });

  it("une information inutile ne pénalise pas le score du match", () => {
    const p = profile("Accepte terre et sable");
    const q = matchQuality(p, load("terre sèche"));
    expect(q.missing).not.toContain("calibre maximal inconnu");
  });

  it("une limite de roche inconnue pénalise seulement un chargement de roche", () => {
    const p = profile("Accepte terre, sable et pierre");
    expect(matchQuality(p, load("pierre")).missing).toContain("calibre maximal inconnu");
    expect(matchQuality(p, load("terre")).missing).not.toContain("calibre maximal inconnu");
  });
});

describe("Priorité, compteurs, filtres et recherche", () => {
  const profiles = [
    profile("Accepte terre et sable", { submissionId: "a" }),
    profile("pas de béton", { submissionId: "b" }),
    profile("Remplissage", { submissionId: "c" }),
    profile("roche maximum 18 pouces", { submissionId: "d" }),
  ];

  it("priorité dynamique P1-P4", () => {
    const high = computePriority(profiles[0], { potentialMatches: 20, hasLocation: true, recentActivity: true });
    const low = computePriority(profiles[2], { potentialMatches: 0 });
    expect(["P1", "P2"]).toContain(high.level);
    expect(["P3", "P4"]).toContain(low.level);
    expect(high.reasons.length).toBeGreaterThan(0);
  });

  it("compteurs réels", () => {
    const c = computeCounters(profiles);
    expect(c.active).toBe(4);
    expect(c.noMaterial).toBeGreaterThanOrEqual(1);
    expect(c.toRevalidate).toBe(4);
  });

  it("recherche québécoise", () => {
    expect(searchProfiles(profiles, "pas de béton").map((p) => p.submissionId)).toContain("b");
    expect(searchProfiles(profiles, "roche 18 pouces").map((p) => p.submissionId)).toContain("d");
    expect(searchProfiles(profiles, "sans matériau").map((p) => p.submissionId)).toContain("c");
    expect(searchProfiles(profiles, "jamais confirmée")).toHaveLength(4);
  });

  it("filtres", () => {
    expect(applyFilters(profiles, { material: "terre" }).map((p) => p.submissionId)).toEqual(["a"]);
    expect(applyFilters(profiles, { refusedMaterial: "beton" }).map((p) => p.submissionId)).toEqual(["b"]);
    expect(applyFilters(profiles, { capacityKnown: false }).length).toBe(4);
    expect(applyFilters(profiles, { qualificationStatus: "sans_materiau" }).map((p) => p.submissionId)).toContain("c");
  });
});

describe("Demandes sans relation matériau", () => {
  it("classe A à E", () => {
    expect(classifyNoRelation("Terre et sable")).toBe("A");
    expect(classifyNoRelation("Remplissage")).toBe("C");
    expect(classifyNoRelation("Je ne sais pas")).toBe("D");
    expect(classifyNoRelation("")).toBe("E");
  });

  it("comptage par lot", () => {
    const r = classifyNoRelationBatch([
      { id: "1", text: "Terre propre" }, { id: "2", text: "Remplissage" },
      { id: "3", text: "je sais pas" }, { id: "4", text: "" },
    ]);
    expect(r.counts.C).toBe(1);
    expect(r.counts.D).toBe(1);
    expect(r.counts.E).toBe(1);
    expect(r.items).toHaveLength(4);
  });
});

describe("Mode 30 secondes et actions", () => {
  it("fiche compacte", () => {
    const c = thirtySecondCard(profile("terre, sable, pas de béton, roche maximum 18 pouces"));
    expect(c.simulationOnly).toBe(true);
    expect(c.actions).toEqual(["CONFIRMER", "CORRIGER", "PLUS_TARD", "IMPOSSIBLE"]);
    expect(c.lines.some((l) => l.symbol === "✕")).toBe(true);
  });

  it("aucune action n'écrit", () => {
    const a = simulateQuickAction(profile("terre"), "CONFIRMER");
    expect(a.wouldWrite).toBe(false);
  });

  it("file triée", () => {
    const list = thirtySecondQueue([profile("Remplissage", { submissionId: "x" }), profile("terre et sable", { submissionId: "y" })]);
    expect(list[0].submissionId).toBe("y");
  });
});

describe("Impact, matrice et potentiel réseau", () => {
  const profiles = [profile("terre, sable, pas trop de glaise", { submissionId: "p1" })];
  const loads = [load("terre avec glaise"), load("sable")];

  it("impact réel mesuré", () => {
    const ranked = impactRanking(profiles, loads);
    expect(ranked.every((r) => r.impact > 0)).toBe(true);
  });

  it("matrice révèle les trous", () => {
    const m = materialMatrix(profiles);
    const beton = m.find((r) => r.materialKey === "beton")!;
    expect(beton.unknown).toBe(1);
  });

  it("potentiel du réseau", () => {
    const n = networkPotential(profiles, loads);
    expect(n.certain + n.blockedByUncertainty + n.incompatible).toBe(2);
  });

  it("statistiques du corpus", () => {
    const s = corpusStats(profiles);
    expect(s.total).toBe(1);
    expect(s.atLeastOne).toBe(1);
  });

  it("file des termes non reconnus sans alias automatique", () => {
    const q = buildUnknownTermsQueue([profile("du miron pis du garnotte bizarre", { submissionId: "u1" })]);
    expect(Array.isArray(q)).toBe(true);
    q.forEach((t) => expect(t.frequency).toBeGreaterThan(0));
  });
});

describe("Exemples métier A-J", () => {
  const cases: [string, string][] = [
    ["A", "400 tonnes de terre sablonneuse avec un peu de glaise et des petits cailloux"],
    ["B", "20 voyages de semi 2 essieux avec sable terreux mélangé avec du tuff moins de 18 pouces"],
    ["C", "terre propre"],
    ["D", "accepte terre mais pas de glaise"],
    ["E", "pas mal de glaise"],
    ["F", "tout sauf béton et asphalte"],
    ["G", "prend presque n'importe quoi sauf souches"],
    ["H", "roche maximum 18 pouces"],
    ["I", "terre avec petite pierre"],
    ["J", "je sais pas exactement, probablement terre/sable"],
  ];

  it.each(cases)("exemple %s produit un profil complet", (_id, text) => {
    const p = profile(text);
    expect(p.originalText).toBe(text);
    expect(p.summary.length).toBeGreaterThan(10);
    expect(Array.isArray(p.accepted)).toBe(true);
    expect(Array.isArray(p.refused)).toBe(true);
    expect(Array.isArray(p.unknown)).toBe(true);
  });

  it("D : refus explicite de la glaise", () => {
    expect(keys(profile("accepte terre mais pas de glaise").refused)).toContain("argile");
  });

  it("E : « pas mal de glaise » n'est pas un refus", () => {
    const p = profile("pas mal de glaise");
    expect(keys(p.refused)).not.toContain("argile");
  });

  it("F : tout sauf béton et asphalte", () => {
    const p = profile("tout sauf béton et asphalte");
    expect(p.broadAcceptance).toBe(true);
    expect(keys(p.refused)).toEqual(expect.arrayContaining(["asphalte", "beton"]));
  });

  it("C : « terre propre » reste une déclaration", () => {
    const p = profile("terre propre");
    expect(p.environmental.status).toBe("UNKNOWN");
    expect(p.environmental.inferred).toBe(false);
  });

  it("H : limite de 18 pouces lue", () => {
    expect(profile("roche maximum 18 pouces").dimensions.maxInches).toBe(18);
  });
});
