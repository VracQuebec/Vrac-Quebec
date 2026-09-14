// LOT 12 — Tests de qualification des demandes de remblai (lecture seule, aucun écrit).
import { describe, it, expect } from "vitest";
import { interpretChantier, QUEBEC_TERM_AUDIT } from "@/lib/nlu/chantier";
import {
  buildFillProfileFromInterpretation, buildLoadFromInterpretation,
  evaluateMaterialCompatibility, isSizeRelevant, maxAcceptedInches,
} from "@/lib/matching/compatibility";
import {
  ACCEPTANCE_SCOPE_OPTIONS, ACCESS_CONSTRAINTS, CAPACITY_KINDS, CAPACITY_UNITS,
  CONDITION_OPTIONS, ENVIRONMENT_OPTIONS, QUALIFICATION_VERSION, TRUCK_OPTIONS,
  buildConfirmationRecord, buildQualificationProposal, extractExplicitRefusals,
  impactOfConfirmation, impactSentence, isHumanConfirmed, isStrongerSource,
  partialMatchSummary, prioritizeQueue, relevantMaterialKeys, resolveSignals,
  simulateHighConfidenceConfirmation, sizeMattersForLoad, sourceRank, tally, toInches,
  topNeedsReviewCauses,
} from "@/lib/qualification/lot12";
import { FEATURE_FLAGS } from "@/lib/flags";

const prop = (text: string, id = "s1") => buildQualificationProposal({ submissionId: id, text });
const keysOf = (text: string) => interpretChantier(text).materials.map((m) => m.key);

describe("LOT 12 — drapeaux inactifs", () => {
  it("la qualification reste désactivée par défaut", () => {
    expect(FEATURE_FLAGS.material_qualification_v2).toBe(false);
  });
  it("le matching V2 public reste désactivé", () => {
    expect(FEATURE_FLAGS.material_matching_v2).toBe(false);
  });
  it("la version de qualification est stable", () => {
    expect(QUALIFICATION_VERSION).toBe("qualification-v1");
  });
});

describe("LOT 12 — vocabulaire glaise / argile", () => {
  const cases: [string, string][] = [
    ["j'ai de la glaise à sortir", "argile"],
    ["terre glaiseuse", "argile"],
    ["terre argileuse du chantier", "argile"],
    ["sol argileux", "argile"],
    ["materiau argileux", "argile"],
    ["materiel argileux", "argile"],
    ["clay from the site", "argile"],
    ["de la terre glaise", "argile"],
    ["c'est glaiseuse pas mal", "argile"],
    ["une terre argileuse mouillée", "argile"],
  ];
  cases.forEach(([text, key]) => {
    it(`reconnaît « ${text} »`, () => {
      expect(keysOf(text)).toContain(key);
    });
  });
});

describe("LOT 12 — vocabulaire québécois additionnel", () => {
  const cases: [string, string][] = [
    ["du shale", "roche"],
    ["du schiste", "roche"],
    ["pierre des champs", "roche"],
    ["des petites pierres", "pierre"],
    ["de la terre végétale", "terre"],
    ["du top soil", "terre"],
    ["de la criblure", "pierre"],
    ["du screening", "pierre"],
    ["du MG-112", "pierre"],
    ["pierre nette", "pierre"],
    ["de la pierre dynamitée", "roche"],
    ["du roc dynamité", "roche"],
    ["béton armé cassé", "beton"],
    ["du fraisat", "asphalte"],
    ["de l'asphalte recyclé", "asphalte"],
    ["de la matière organique", "organique"],
    ["des débris de construction", "materiel_inconnu"],
    ["du béton concassé", "beton"],
    ["du planage d'asphalte", "asphalte"],
    ["des souches et des racines", "organique"],
  ];
  cases.forEach(([text, key]) => {
    it(`classe « ${text} »`, () => {
      expect(keysOf(text)).toContain(key);
    });
  });
  it("l'audit de vocabulaire couvre plus de 40 termes", () => {
    expect(QUEBEC_TERM_AUDIT.length).toBeGreaterThanOrEqual(40);
  });
  it("« terre de remplissage » est un usage, pas un matériau", () => {
    expect(QUEBEC_TERM_AUDIT.find((t) => t.term === "terre de remplissage")?.classification).toBe("USAGE");
  });
  it("« propre » est une condition déclarée", () => {
    expect(QUEBEC_TERM_AUDIT.find((t) => t.term === "propre")?.classification).toBe("CONDITION");
  });
  it("« tuff » reste inconnu tant qu'un humain n'a pas tranché", () => {
    expect(QUEBEC_TERM_AUDIT.find((t) => t.term === "tuff")?.classification).toBe("UNKNOWN");
  });
});

describe("LOT 12 — refus explicites vs formulations ambiguës", () => {
  const certains = [
    "pas de glaise", "sans glaise", "aucune glaise",
    "pas de béton", "sans béton ni asphalte", "pas de souches",
  ];
  certains.forEach((t) => {
    it(`« ${t} » est un refus certain`, () => {
      const r = extractExplicitRefusals(t).filter((x) => x.kind === "MATERIAU");
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((x) => x.certain)).toBe(true);
    });
  });

  const ambigus = [
    "pas trop de glaise", "pas beaucoup de roche", "le moins possible de glaise",
    "sans trop de glaise", "si possible pas de béton",
  ];
  ambigus.forEach((t) => {
    it(`« ${t} » est ambigu et demande une validation humaine`, () => {
      const r = extractExplicitRefusals(t).filter((x) => x.kind === "MATERIAU");
      expect(r.length).toBeGreaterThan(0);
      expect(r.some((x) => !x.certain)).toBe(true);
    });
  });

  it("« pas mal de glaise » n'est jamais un refus", () => {
    const r = extractExplicitRefusals("pas mal de glaise").filter((x) => x.kind === "MATERIAU");
    expect(r).toHaveLength(0);
    expect(keysOf("pas mal de glaise")).toContain("argile");
  });

  it("« presque tout sauf glaise » garde une acceptation large et un refus", () => {
    const i = interpretChantier("j'accepte presque tout sauf de la glaise");
    expect(i.acceptsAlmostEverything).toBe(true);
    expect(i.restrictions.some((r) => r.materialKey === "argile" && !r.ambiguous)).toBe(true);
  });

  it("une restriction ambiguë ne produit pas un statut REFUSED", () => {
    const p = buildFillProfileFromInterpretation(interpretChantier("pas trop de glaise"));
    expect(p.materials.find((m) => m.materialKey === "argile")?.status).not.toBe("REFUSED");
  });

  it("un refus certain produit bien un statut REFUSED", () => {
    const p = buildFillProfileFromInterpretation(interpretChantier("pas de glaise"));
    expect(p.materials.find((m) => m.materialKey === "argile")?.status).toBe("REFUSED");
  });

  it("« rien de contaminé » est une restriction environnementale, pas un matériau", () => {
    const r = extractExplicitRefusals("rien de contaminé");
    expect(r.some((x) => x.kind === "ENVIRONNEMENT")).toBe(true);
    expect(r.some((x) => x.kind === "MATERIAU")).toBe(false);
  });
});

describe("LOT 12 — compatibilité : absence ≠ refus", () => {
  const demande = buildFillProfileFromInterpretation(interpretChantier("j'accepte de la terre et du sable"));

  it("un matériau accepté est compatible", () => {
    const load = buildLoadFromInterpretation(interpretChantier("de la terre d'excavation"));
    expect(evaluateMaterialCompatibility(load, demande).result).not.toBe("INCOMPATIBLE");
  });
  it("un matériau non mentionné reste inconnu, jamais refusé", () => {
    const load = buildLoadFromInterpretation(interpretChantier("du béton concassé"));
    const ev = evaluateMaterialCompatibility(load, demande);
    expect(ev.result).toBe("NEEDS_REVIEW");
    expect(ev.refusedMaterials).toHaveLength(0);
  });
  it("un refus explicite rend incompatible", () => {
    const d = buildFillProfileFromInterpretation(interpretChantier("terre acceptée, pas de béton"));
    const load = buildLoadFromInterpretation(interpretChantier("du béton"));
    expect(evaluateMaterialCompatibility(load, d).result).toBe("INCOMPATIBLE");
  });
  it("une restriction ambiguë donne « à confirmer » et non « incompatible »", () => {
    const d = buildFillProfileFromInterpretation(interpretChantier("terre acceptée mais pas trop de glaise"));
    const load = buildLoadFromInterpretation(interpretChantier("de la glaise"));
    expect(evaluateMaterialCompatibility(load, d).result).toBe("NEEDS_REVIEW");
  });
  it("un chargement vide demande une révision", () => {
    const ev = evaluateMaterialCompatibility({ id: "l", materials: [], conditions: [], originalText: "" }, demande);
    expect(ev.result).toBe("NEEDS_REVIEW");
  });
  it("une acceptation large reste « à confirmer »", () => {
    const d = buildFillProfileFromInterpretation(interpretChantier("j'accepte pas mal n'importe quoi"));
    const load = buildLoadFromInterpretation(interpretChantier("du sable"));
    const ev = evaluateMaterialCompatibility(load, d);
    expect(ev.result).toBe("NEEDS_REVIEW");
    expect(ev.reliesOnBroadAcceptance).toBe(true);
  });
});

describe("LOT 12 — calibre pertinent seulement", () => {
  const demande = buildFillProfileFromInterpretation(interpretChantier("pierre acceptée, maximum 12 pouces"));

  it("la pierre est concernée par le calibre", () => {
    expect(isSizeRelevant("pierre")).toBe(true);
  });
  it("la roche est concernée par le calibre", () => {
    expect(isSizeRelevant("roche")).toBe(true);
  });
  it("la terre n'est pas concernée par le calibre", () => {
    expect(isSizeRelevant("terre")).toBe(false);
  });
  it("le sable n'est pas concerné par le calibre", () => {
    expect(isSizeRelevant("sable")).toBe(false);
  });
  it("aucune limite n'est appliquée à la terre", () => {
    expect(maxAcceptedInches(demande, "terre")).toBeNull();
  });
  it("un chargement de terre n'est pas mis « à confirmer » pour un calibre inconnu", () => {
    const load = buildLoadFromInterpretation(interpretChantier("de la terre"));
    const ev = evaluateMaterialCompatibility(load, demande);
    expect(ev.reasons.some((r) => r.code === "SIZE_UNKNOWN")).toBe(false);
  });
  it("un chargement de pierre trop gros est bloqué", () => {
    const d = buildFillProfileFromInterpretation(interpretChantier("pierre acceptée maximum 12 pouces"));
    const load = buildLoadFromInterpretation(interpretChantier("de la pierre de 24 pouces"));
    expect(evaluateMaterialCompatibility(load, d).result).toBe("INCOMPATIBLE");
  });
  it("le calibre compte quand le chargement contient de la pierre", () => {
    expect(sizeMattersForLoad(["terre", "pierre"])).toBe(true);
  });
  it("le calibre ne compte pas pour terre + sable", () => {
    expect(sizeMattersForLoad(["terre", "sable"])).toBe(false);
  });
  it("conversion pieds → pouces", () => expect(toInches(2, "pi")).toBe(24));
  it("conversion mm → pouces", () => expect(toInches(25.4, "mm")).toBeCloseTo(1));
  it("conversion cm → pouces", () => expect(toInches(2.54, "cm")).toBeCloseTo(1));
  it("conversion m → pouces", () => expect(toInches(1, "m")).toBeCloseTo(39.37, 1));
});

describe("LOT 12 — hiérarchie des sources", () => {
  it("humain récent bat humain historique", () => expect(isStrongerSource("human_recent", "human_historical")).toBe(true));
  it("humain historique bat le texte original", () => expect(isStrongerSource("human_historical", "original_text")).toBe(true));
  it("texte original bat les données structurées historiques", () => expect(isStrongerSource("original_text", "structured_historical")).toBe(true));
  it("structuré historique bat le NLU", () => expect(isStrongerSource("structured_historical", "nlu_high")).toBe(true));
  it("NLU élevé bat NLU moyen", () => expect(isStrongerSource("nlu_high", "nlu_medium")).toBe(true));
  it("inconnu est le rang le plus faible", () => expect(sourceRank("unknown")).toBeGreaterThan(sourceRank("nlu_medium")));
  it("une source faible n'écrase pas une source forte", () => {
    const r = resolveSignals([
      { materialKey: "argile", status: "REFUSED", source: "human_recent" },
      { materialKey: "argile", status: "ACCEPTED", source: "nlu_medium" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("REFUSED");
  });
  it("une source forte remplace une source faible", () => {
    const r = resolveSignals([
      { materialKey: "terre", status: "UNKNOWN", source: "nlu_medium" },
      { materialKey: "terre", status: "ACCEPTED", source: "human_recent" },
    ]);
    expect(r[0].status).toBe("ACCEPTED");
  });
  it("les matériaux distincts sont conservés", () => {
    const r = resolveSignals([
      { materialKey: "terre", status: "ACCEPTED", source: "nlu_high" },
      { materialKey: "sable", status: "ACCEPTED", source: "nlu_high" },
    ]);
    expect(r).toHaveLength(2);
  });
});

describe("LOT 12 — confirmation humaine traçable", () => {
  it("une confirmation admin est humaine", () => {
    const r = buildConfirmationRecord({ submissionId: "s", materialKey: "terre", stance: "ACCEPTED", source: "admin_manual", userId: "u1" });
    expect(isHumanConfirmed(r)).toBe(true);
  });
  it("une confirmation propriétaire est humaine", () => {
    const r = buildConfirmationRecord({ submissionId: "s", materialKey: "terre", stance: "ACCEPTED", source: "owner_confirmation", userId: "u2" });
    expect(r.confirmed_by).toBe("u2");
  });
  it("une proposition automatique n'est jamais une confirmation", () => {
    const r = buildConfirmationRecord({ submissionId: "s", materialKey: "terre", stance: "ACCEPTED", source: "nlu_proposal" });
    expect(isHumanConfirmed(r)).toBe(false);
    expect(r.confirmed_at).toBeNull();
  });
  it("une donnée historique explicite n'est pas une confirmation humaine récente", () => {
    const r = buildConfirmationRecord({ submissionId: "s", materialKey: "terre", stance: "ACCEPTED", source: "historical_explicit" });
    expect(isHumanConfirmed(r)).toBe(false);
  });
  it("le texte original est conservé dans la trace", () => {
    const r = buildConfirmationRecord({ submissionId: "s", materialKey: "argile", stance: "REFUSED", source: "admin_manual", originalText: "pas de glaise", userId: "u" });
    expect(r.original_text).toBe("pas de glaise");
  });
});

describe("LOT 12 — propositions de qualification", () => {
  it("conserve le texte original intact", () => {
    const t = "J'ai de la Terre PROPRE, pas de glaise!";
    expect(prop(t).originalText).toBe(t);
  });
  it("propose les matériaux détectés", () => {
    expect(prop("terre et sable").detected.map((d) => d.materialKey)).toEqual(expect.arrayContaining(["terre", "sable"]));
  });
  it("marque une portée large", () => {
    expect(prop("j'accepte pas mal n'importe quoi").scope).toBe("broad");
  });
  it("marque une portée explicite", () => {
    expect(prop("terre seulement").scope).toBe("explicit");
  });
  it("marque une portée inconnue quand le texte est vide", () => {
    expect(prop("").scope).toBe("unknown");
  });
  it("un texte vide est de faible confiance", () => {
    expect(prop("").confidence).toBe("low");
  });
  it("un texte vide n'est pas confirmable en groupe", () => {
    expect(prop("").groupConfirmable).toBe(false);
  });
  it("un texte clair est confirmable en groupe", () => {
    expect(prop("terre et sable").groupConfirmable).toBe(true);
  });
  it("« je ne suis pas certain » réduit la confiance", () => {
    expect(prop("je ne suis pas certain, peut-être de la terre").confidence).toBe("low");
  });
  it("l'environnement n'est jamais déduit", () => {
    expect(prop("terre propre et sèche").environmentStatus).toBe("UNKNOWN");
  });
  it("« propre » reste une condition déclarée", () => {
    expect(prop("terre propre").conditions.join(" ")).toMatch(/propre/i);
  });
  it("les refus apparaissent séparément", () => {
    expect(prop("terre acceptée, pas de béton").refusals.some((r) => r.materialKey === "beton")).toBe(true);
  });
  it("une ambiguïté est expliquée", () => {
    expect(prop("pas trop de glaise").ambiguityReasons.length).toBeGreaterThan(0);
  });
  it("les voyages déclarés deviennent une capacité approximative", () => {
    expect(prop("environ 10 voyages de terre").capacity.unit).toBe("voyages");
  });
  it("sans quantité, la capacité reste inconnue", () => {
    expect(prop("de la terre").capacity.kind).toBe("unknown");
  });
  it("la capacité fournie par l'administrateur est connue", () => {
    const p = buildQualificationProposal({ submissionId: "s", text: "terre", trips: 5 });
    expect(p.capacity).toMatchObject({ kind: "known", value: 5 });
  });
  it("les relations historiques sont conservées comme source structurée", () => {
    const p = buildQualificationProposal({ submissionId: "s", text: "", historicalMaterials: ["terre"] });
    expect(p.detected[0].source).toBe("structured_historical");
  });
  it("les relations historiques ne sont pas dupliquées", () => {
    const p = buildQualificationProposal({ submissionId: "s", text: "de la terre", historicalMaterials: ["terre"] });
    expect(p.detected.filter((d) => d.materialKey === "terre")).toHaveLength(1);
  });
  it("n'affiche que les matériaux pertinents, jamais tout le catalogue", () => {
    expect(relevantMaterialKeys(prop("terre et sable, pas de béton")).length).toBeLessThanOrEqual(5);
  });
  it("le calibre est séparé du matériau", () => {
    expect(prop("pierre 0-3/4").granulometries.length).toBeGreaterThan(0);
  });
  it("la simulation de confirmation n'écrit rien et retourne un nouveau profil", () => {
    const p = prop("terre et sable");
    const before = p.profile.materials.length;
    const after = simulateHighConfidenceConfirmation(p.profile, p);
    expect(after).not.toBe(p.profile);
    expect(after.materials.length).toBeGreaterThanOrEqual(before);
  });
});

describe("LOT 12 — file de validation priorisée", () => {
  const base = { usable: true, available: true, acceptedCount: 1, unknownCount: 1, potentialMatches: 1, lastConfirmationDays: null, missingFields: 0 };
  it("priorise les demandes utilisables", () => {
    const [first] = prioritizeQueue([
      { ...base, submissionId: "b", usable: false },
      { ...base, submissionId: "a" },
    ]);
    expect(first.submissionId).toBe("a");
  });
  it("priorise le plus grand potentiel de correspondances", () => {
    const [first] = prioritizeQueue([
      { ...base, submissionId: "x", potentialMatches: 1 },
      { ...base, submissionId: "y", potentialMatches: 25 },
    ]);
    expect(first.submissionId).toBe("y");
  });
  it("explique toujours la priorité", () => {
    expect(prioritizeQueue([{ ...base, submissionId: "a" }])[0].reasons.length).toBeGreaterThan(0);
  });
  it("signale les demandes jamais confirmées", () => {
    expect(prioritizeQueue([{ ...base, submissionId: "a" }])[0].reasons.join(" ")).toMatch(/revalider/);
  });
  it("l'ordre est déterministe à égalité", () => {
    const r = prioritizeQueue([{ ...base, submissionId: "b" }, { ...base, submissionId: "a" }]);
    expect(r.map((x) => x.submissionId)).toEqual(["a", "b"]);
  });
});

describe("LOT 12 — impact potentiel réel", () => {
  const loads = [
    { id: "1", materialKeys: ["terre" as const] },
    { id: "2", materialKeys: ["terre" as const, "pierre" as const] },
    { id: "3", materialKeys: ["beton" as const] },
  ];
  it("compte les chargements réels", () => expect(impactOfConfirmation("terre", loads)).toBe(2));
  it("ne compte jamais un impact inventé", () => expect(impactOfConfirmation("sable", loads)).toBe(0));
  it("aucune phrase d'impact sans correspondance", () => expect(impactSentence("sable", loads)).toBeNull());
  it("la phrase d'impact reste au conditionnel", () => expect(impactSentence("terre", loads)).toMatch(/pourrait/));
});

describe("LOT 12 — match partiel lisible", () => {
  const d = buildFillProfileFromInterpretation(interpretChantier("j'accepte de la terre, pas de béton"));
  it("affiche le ratio de compatibilité", () => {
    const load = buildLoadFromInterpretation(interpretChantier("terre avec un peu de sable"));
    expect(partialMatchSummary(evaluateMaterialCompatibility(load, d)).detail).toMatch(/matériaux compatibles/);
  });
  it("étiquette un match potentiel élevé", () => {
    const load = buildLoadFromInterpretation(interpretChantier("de la terre"));
    expect(partialMatchSummary(evaluateMaterialCompatibility(load, d)).label).toBe("MATCH POTENTIEL ÉLEVÉ");
  });
  it("étiquette une incompatibilité", () => {
    const load = buildLoadFromInterpretation(interpretChantier("du béton"));
    expect(partialMatchSummary(evaluateMaterialCompatibility(load, d)).label).toBe("INCOMPATIBLE");
  });
  it("compte les matériaux à confirmer", () => {
    const load = buildLoadFromInterpretation(interpretChantier("de la terre et du sable"));
    expect(partialMatchSummary(evaluateMaterialCompatibility(load, d)).toConfirm).toBeGreaterThan(0);
  });
});

describe("LOT 12 — causes de « à confirmer » et scénarios", () => {
  const d = buildFillProfileFromInterpretation(interpretChantier("terre acceptée"));
  const evals = ["du sable", "du sable", "du béton concassé"].map((t, idx) => ({
    submissionId: `s${idx}`,
    evaluation: evaluateMaterialCompatibility(buildLoadFromInterpretation(interpretChantier(t)), d),
  }));

  it("regroupe les causes principales", () => {
    expect(topNeedsReviewCauses(evals).length).toBeGreaterThan(0);
  });
  it("compte les demandes par cause", () => {
    expect(topNeedsReviewCauses(evals)[0].requests).toBeGreaterThan(0);
  });
  it("limite le nombre de causes retournées", () => {
    expect(topNeedsReviewCauses(evals, 1)).toHaveLength(1);
  });
  it("ignore les évaluations compatibles", () => {
    const ok = [{ submissionId: "z", evaluation: evaluateMaterialCompatibility(buildLoadFromInterpretation(interpretChantier("de la terre")), d) }];
    expect(topNeedsReviewCauses(ok)).toHaveLength(0);
  });
  it("scénario A — état actuel", () => {
    const t = tally(evals.map((e) => e.evaluation));
    expect(t.needsReview).toBe(3);
  });
  it("scénario B — confirmations à haute confiance", () => {
    const p = prop("terre et sable");
    const profile = simulateHighConfidenceConfirmation(d, p);
    const load = buildLoadFromInterpretation(interpretChantier("du sable"));
    expect(evaluateMaterialCompatibility(load, profile).result).toBe("COMPATIBLE");
  });
  it("scénario C — tout confirmé ne crée aucune incompatibilité nouvelle", () => {
    const p = prop("terre et sable et pierre");
    const profile = simulateHighConfidenceConfirmation(d, p);
    const t = tally(["du sable", "de la terre"].map((x) =>
      evaluateMaterialCompatibility(buildLoadFromInterpretation(interpretChantier(x)), profile)));
    expect(t.incompatible).toBe(0);
  });
  it("le compte total des scénarios est conservé", () => {
    const t = tally(evals.map((e) => e.evaluation));
    expect(t.compatible + t.needsReview + t.incompatible).toBe(3);
  });
});

describe("LOT 12 — référentiels d'interface", () => {
  it("les unités de capacité sont disponibles", () => expect(CAPACITY_UNITS.length).toBe(4));
  it("les types de capacité sont disponibles", () => expect(CAPACITY_KINDS.length).toBe(4));
  it("l'option « illimitée » existe", () => expect(CAPACITY_KINDS.some((c) => c.value === "unlimited")).toBe(true));
  it("les conditions incluent gelé", () => expect(CONDITION_OPTIONS.some((c) => c.key === "gele")).toBe(true));
  it("« propre » est étiqueté comme déclaration non vérifiée", () => {
    expect(CONDITION_OPTIONS.find((c) => c.key === "propre")?.label).toMatch(/non vérifiée/);
  });
  it("l'environnement par défaut est inconnu", () => expect(ENVIRONMENT_OPTIONS[0].value).toBe("UNKNOWN"));
  it("les camions incluent le semi-dompeur", () => expect(TRUCK_OPTIONS.some((t) => t.code === "semi_dompeur")).toBe(true));
  it("les camions incluent « inconnu »", () => expect(TRUCK_OPTIONS.some((t) => t.code === "inconnu")).toBe(true));
  it("les contraintes d'accès incluent les fils bas", () => expect(ACCESS_CONSTRAINTS).toContain("fils bas"));
  it("la portée d'acceptation propose trois options", () => expect(ACCEPTANCE_SCOPE_OPTIONS).toHaveLength(3));
});
