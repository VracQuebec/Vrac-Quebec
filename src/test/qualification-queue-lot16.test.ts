// LOT 16 — File intelligente de qualification (pure, lecture seule).
import { describe, expect, it } from "vitest";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import { buildEnrichedProfile, decomposeLoad } from "@/lib/qualification/lot15";
import {
  answerImpact, answerToJournalDraft, buildQueue, buildQueueCard, buildQuestions,
  classifyValidationCase, countMatches, nextQuestion, priorityScore, qualityScore,
  queueIndicators, simulateAnswer, QUALIFICATION_QUEUE_VERSION,
} from "@/lib/qualification/lot16";

const profileOf = (text: string, opts: { available?: boolean; lastConfirmedAt?: string | null } = {}) =>
  buildEnrichedProfile(buildAcceptanceProfile({
    submissionId: "s1", reference: "DOMPE-1", text,
    available: opts.available ?? true, lastConfirmedAt: opts.lastConfirmedAt ?? null,
  }));

const loads = [
  decomposeLoad("20 voyages de terre", "l1"),
  decomposeLoad("terre sablonneuse avec un peu de glaise et quelques petites roches", "l2"),
  decomposeLoad("béton cassé", "l3"),
];

describe("LOT 16 — profils de base", () => {
  it("1. terre seulement : la terre n'est pas refusée, les autres restent inconnus", () => {
    const p = profileOf("j'accepte de la terre");
    expect(p.exclusions).toHaveLength(0);
    const q = buildQuestions(p, loads);
    expect(q.some((x) => x.subject === "sable")).toBe(true);
  });

  it("2. terre + sable : les deux matériaux sont connus", () => {
    const p = profileOf("terre et sable acceptés");
    const keys = p.materials.map((m) => m.materialKey);
    expect(keys).toContain("terre");
    expect(keys).toContain("sable");
  });

  it("3. terre + petites pierres : la pierre est reconnue", () => {
    const p = profileOf("terre avec petites pierres");
    expect(p.materials.map((m) => m.materialKey)).toContain("pierre");
  });

  it("4. terre + glaise jamais mentionnée : glaise inconnue, pas refusée", () => {
    const p = profileOf("terre seulement s.v.p.");
    const glaise = p.materials.find((m) => m.materialKey === "argile");
    expect(glaise?.stance ?? "INCONNU").not.toBe("REFUSE_CONFIRME");
    expect(p.exclusions).not.toContain("argile");
  });

  it("5. « sans glaise » : refus confirmé", () => {
    const p = profileOf("terre acceptée mais sans glaise");
    expect(p.exclusions).toContain("argile");
  });

  it("6. roche max 18 po : la limite est retenue", () => {
    const p = profileOf("roche acceptée maximum 18 pouces");
    expect(p.granulometry.maxInches).toBe(18);
  });
});

describe("LOT 16 — absence n'est jamais un refus", () => {
  it("« je ne sais pas » ne change rien et ne refuse rien", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads).find((x) => x.subject === "argile")!;
    const after = simulateAnswer(p, q, "JE_NE_SAIS_PAS");
    expect(after).toBe(p);
    expect(after.exclusions).not.toContain("argile");
  });

  it("« passer » ne produit aucun brouillon de journal", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads)[0];
    expect(answerToJournalDraft({ profile: p, question: q, answer: "PASSER", confirmedBy: "admin" })).toBeNull();
  });

  it("un refus humain explicite crée un refus confirmé", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads).find((x) => x.subject === "beton")!;
    const after = simulateAnswer(p, q, "NON");
    expect(after.exclusions).toContain("beton");
    expect(p.exclusions).not.toContain("beton"); // profil d'origine intact
  });
});

describe("LOT 16 — « ça dépend »", () => {
  it("sans précision : à confirmer, jamais un oui général", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads).find((x) => x.subject === "roche")!;
    const after = simulateAnswer(p, q, "CA_DEPEND");
    expect(after.materials.find((m) => m.materialKey === "roche")?.stance).toBe("A_CONFIRMER");
  });

  it("avec grosseur maximale : acceptation limitée et confirmée", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads).find((x) => x.subject === "roche")!;
    const after = simulateAnswer(p, q, "CA_DEPEND", { maxInches: 12 });
    expect(after.granulometry.maxInches).toBe(12);
    expect(after.materials.find((m) => m.materialKey === "roche")?.humanConfirmed).toBe(true);
  });

  it("béton sans armature : la condition est enregistrée", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads).find((x) => x.subject === "beton")!;
    const after = simulateAnswer(p, q, "CA_DEPEND", { rebar: false });
    expect(after.conditions.join(" ")).toContain("sans armature");
  });
});

describe("LOT 16 — impact avant confirmation", () => {
  it("calcule un avant/après explicable", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads)[0];
    const impact = answerImpact(p, loads, q, "OUI", { maxInches: 24 });
    expect(impact.before.compatible + impact.before.toConfirm + impact.before.incompatible).toBe(loads.length);
    expect(impact.explanation).toContain("compatible");
  });

  it("une réponse « passer » n'apporte aucun gain", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads)[0];
    expect(answerImpact(p, loads, q, "PASSER").gain).toBe(0);
  });
});

describe("LOT 16 — priorité et qualité", () => {
  it("la priorité est explicable", () => {
    const p = profileOf("terre acceptée");
    const r = priorityScore(p, loads);
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("une fiche sans aucun potentiel n'est pas gonflée artificiellement", () => {
    const p = profileOf("terre acceptée");
    const vide = priorityScore(p, []);
    expect(vide.score).toBeLessThan(priorityScore(p, loads).score);
    expect(vide.reasons.join(" ")).toContain("aucun potentiel");
  });

  it("la qualité récompense la capacité à décider, pas le nombre de champs", () => {
    const riche = profileOf("terre et petites pierres acceptées, max 12 pouces, pas de béton, semi-remorque accepté, 100 voyages");
    const pauvre = profileOf("on prend du matériel");
    expect(qualityScore(riche).score).toBeGreaterThan(qualityScore(pauvre).score);
  });

  it("la disponibilité jamais confirmée augmente la priorité", () => {
    const jamais = profileOf("terre acceptée");
    const confirme = profileOf("terre acceptée", { lastConfirmedAt: new Date().toISOString() });
    expect(priorityScore(jamais, loads).score).toBeGreaterThanOrEqual(priorityScore(confirme, loads).score);
  });
});

describe("LOT 16 — file, questions adaptatives et indicateurs", () => {
  it("la question suivante change après une réponse", () => {
    const p = profileOf("terre acceptée");
    const first = nextQuestion(p, loads)!;
    const after = simulateAnswer(p, first, "OUI", { maxInches: 24 });
    const second = nextQuestion(after, loads);
    expect(second?.id).not.toBe(first.id);
  });

  it("une question déjà passée n'est pas reproposée", () => {
    const p = profileOf("terre acceptée");
    const first = nextQuestion(p, loads)!;
    expect(nextQuestion(p, loads, [first.id])?.id).not.toBe(first.id);
  });

  it("ne redemande pas un matériau refusé confirmé", () => {
    const p = profileOf("terre acceptée mais sans glaise");
    expect(buildQuestions(p, loads).some((q) => q.subject === "argile")).toBe(false);
  });

  it("propose des élargissements utiles à partir de la terre", () => {
    const p = profileOf("terre acceptée");
    const subjects = buildQuestions(p, loads).map((q) => q.subject);
    expect(subjects).toContain("sable");
    expect(subjects).toContain("pierre");
  });

  it("construit une carte complète et triée", () => {
    const cards = buildQueue([
      { profile: profileOf("terre acceptée"), loads, reference: "DOMPE-1", city: "Saint-Jérôme" },
      { profile: profileOf("on prend du matériel"), loads, reference: "DOMPE-2", city: "Mirabel" },
    ]);
    expect(cards[0].version).toBe(QUALIFICATION_QUEUE_VERSION);
    expect(cards[0].priority.score).toBeGreaterThanOrEqual(cards[1].priority.score);
    expect(cards[0].counts).toEqual(countMatches(cards[0] && profileOf("terre acceptée"), loads));
  });

  it("calcule les indicateurs administrateur", () => {
    const cards = buildQueue([{ profile: profileOf("terre acceptée"), loads }]);
    const ind = queueIndicators(cards, 0);
    expect(ind.analyzed).toBe(1);
    expect(ind.sufficientlyQualified + ind.toEnrich).toBe(1);
    expect(ind.confirmedToday).toBe(0);
  });

  it("classe les cas à valider en A / B / C", () => {
    const c = classifyValidationCase(profileOf("terre acceptée"));
    expect(["A_ERREUR_INTERPRETATION", "B_INFORMATION_MANQUANTE", "C_CONFIRMATION_CLIENT"]).toContain(c.kind);
    expect(classifyValidationCase(profileOf("on prend du matériel")).kind).toBe("A_ERREUR_INTERPRETATION");
  });

  it("produit un brouillon de journal traçable sans écrire", () => {
    const p = profileOf("terre acceptée");
    const q = buildQuestions(p, loads).find((x) => x.subject === "sable")!;
    const draft = answerToJournalDraft({ profile: p, question: q, answer: "OUI", confirmedBy: "admin@vq" })!;
    expect(draft.submissionId).toBe("s1");
    expect(draft.category).toBe("material");
    expect(draft.decision).toBe("ACCEPTED");
    expect(draft.source).toBe("qualification_queue_v2");
    expect(draft.confirmedAt).toBeTruthy();
    expect(draft.originalText).toBe(p.originalText);
  });

  it("la carte expose la question recommandée et son gain estimé", () => {
    const card = buildQueueCard({ profile: profileOf("terre acceptée"), loads, reference: "DOMPE-3" });
    expect(card.recommended).not.toBeNull();
    expect(card.estimatedGain).toBeGreaterThanOrEqual(0);
    expect(card.quality.breakdown.length).toBeGreaterThan(0);
  });
});
