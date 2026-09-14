// LOT 17 — Mode test sûr, lisibilité opérationnelle, valeur de l'information,
// sémantique des matériaux, langage de chantier québécois, performance et contrat LOT 18.
import { describe, expect, it } from "vitest";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import { buildEnrichedProfile, decomposeLoad } from "@/lib/qualification/lot15";
import { buildQueue, buildQueueCard, buildQuestions, nextQuestion, simulateAnswer } from "@/lib/qualification/lot16";
import {
  TEST_MODE_BADGE, buildOperatorCard, callWorthwhile, createReadOnlyBoundary,
  guardMutation, recordSessionAnswer, toNormalizedConstraint, MATERIAL_FAMILY,
} from "@/lib/qualification/lot17";

const profileOf = (text: string, opts: { id?: string; available?: boolean; lastConfirmedAt?: string | null } = {}) =>
  buildEnrichedProfile(buildAcceptanceProfile({
    submissionId: opts.id ?? "s1", reference: "DOMPE-1", text,
    available: opts.available ?? true, lastConfirmedAt: opts.lastConfirmedAt ?? null,
  }));

const loads = [
  decomposeLoad("20 voyages de terre", "l1"),
  decomposeLoad("terre sablonneuse avec un peu de glaise et des petites roches", "l2"),
  decomposeLoad("béton cassé", "l3"),
];

const cardOf = (text: string, city = "Québec") => {
  const p = profileOf(text);
  return { profile: p, card: buildQueueCard({ profile: p, loads, reference: "DOMPE-1", city }) };
};

// ---------------- Phase 2 — mode test sûr ----------------

describe("LOT 17 — mode test sûr", () => {
  it("refuse toute action mutante en mode test", () => {
    for (const action of ["confirmation", "statut_crm", "disponibilite", "suppression", "reactivation", "courriel", "sms"] as const) {
      const verdict = guardMutation(action, true);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toContain(TEST_MODE_BADGE);
    }
  });

  it("refuse aussi hors mode test tant que le LOT 18 n'est pas autorisé", () => {
    expect(guardMutation("confirmation", false).allowed).toBe(false);
  });

  it("les réponses saisies restent en session et marquées simulées", () => {
    const answers = recordSessionAnswer([], "q1", "OUI");
    expect(answers).toHaveLength(1);
    expect(answers[0].simulated).toBe(true);
  });

  it("la frontière par défaut n'écrit rien et ne recalcule rien", async () => {
    const boundary = createReadOnlyBoundary();
    const { profile, card } = cardOf("terre propre acceptée");
    const constraint = boundary.normalize({ profile, question: card.questions[0], answer: "OUI" });
    expect((await boundary.persist(constraint)).allowed).toBe(false);
    expect((await boundary.recomputeMatches(constraint)).recomputed).toBe(false);
  });
});

// ---------------- Phase 3 — lisibilité opérationnelle ----------------

describe("LOT 17 — carte pour un employé des opérations", () => {
  it("répond aux 8 questions de l'employé", () => {
    const { profile, card } = cardOf("j'accepte de la terre mais pas de grosse roche");
    const op = buildOperatorCard(card, profile);
    expect(op.sector).toBe("Québec");
    expect(op.availabilityLabel).toBe("Ouverte pour recevoir");
    expect(op.freshnessLabel).toContain("Jamais confirmée");
    expect(op.capacityLabel).toBeTruthy();
    expect(op.missingInformation.length).toBeGreaterThan(0);
    expect(typeof op.probableMatches).toBe("number");
    expect(typeof op.blockedMatches).toBe("number");
    expect(op.priority).toBe(card.priority.score);
    expect(["Information solide", "Information partielle", "Information faible"]).toContain(op.confidenceLabel);
  });

  it("sépare certain, possible et refusé", () => {
    const { profile, card } = cardOf("terre acceptée, pas de béton");
    const op = buildOperatorCard(card, profile);
    expect(op.refusedMaterials.join(" ")).toContain("béton");
    expect(op.confirmedMaterials).not.toContain("béton");
  });

  it("n'utilise pas de vocabulaire technique de base de données", () => {
    const { profile, card } = cardOf("terre d'excavation avec roche");
    const op = buildOperatorCard(card, profile);
    const blob = JSON.stringify(op).toLowerCase();
    for (const jargon of ["submission", "rls", "uuid", "select", "stance", "null"]) {
      expect(blob.includes(jargon)).toBe(false);
    }
  });

  it("une demande fermée sans potentiel ne vaut pas un appel", () => {
    const p = profileOf("terre", { available: false });
    const card = buildQueueCard({ profile: p, loads: [], reference: "D", city: "Lévis" });
    expect(callWorthwhile(card)).toBe(false);
  });
});

// ---------------- Phase 4 — appel guidé ----------------

describe("LOT 17 — qualification rapide", () => {
  it("pose une seule question à la fois et n'en repose pas une passée", () => {
    const p = profileOf("terre");
    const q1 = nextQuestion(p, loads, []);
    expect(q1).not.toBeNull();
    const q2 = nextQuestion(p, loads, [q1!.id]);
    expect(q2?.id).not.toBe(q1!.id);
  });

  it("« ça dépend » ne devient jamais une acceptation générale", () => {
    const p = profileOf("terre");
    const q = buildQuestions(p, loads).find((x) => x.subject === "pierre")!;
    const after = simulateAnswer(p, q, "CA_DEPEND", { maxInches: 12 });
    const pierre = after.materials.find((m) => m.materialKey === "pierre");
    expect(pierre?.stance).not.toBe("ACCEPTE_CONFIRME");
  });

  it("le béton distingue avec et sans armature", () => {
    const { profile, card } = cardOf("béton cassé accepté");
    const q = card.questions.find((x) => x.subject === "beton") ?? card.questions[0];
    const sans = toNormalizedConstraint({ profile, question: q, answer: "OUI", detail: { rebar: false } });
    const avec = toNormalizedConstraint({ profile, question: q, answer: "OUI", detail: { rebar: true } });
    expect(sans.reinforcement).toBe("WITHOUT");
    expect(avec.reinforcement).toBe("WITH");
  });

  it("ne pose pas de question sans valeur pour le matching", () => {
    const p = profileOf("terre, sable, glaise, pierre, roche acceptés, morceaux max 12 pouces");
    const useless = buildQuestions(p, []).filter((q) => q.unlocked > 0);
    expect(useless).toHaveLength(0);
  });
});

// ---------------- Phase 5 — valeur de l'information ----------------

describe("LOT 17 — priorité basée sur la valeur, pas sur les champs vides", () => {
  it("une demande avec peu de champs manquants mais beaucoup de matchs bloqués passe en premier", () => {
    const manyLoads = Array.from({ length: 30 }, (_, i) =>
      decomposeLoad("terre sablonneuse avec un peu de glaise", `b${i}`));
    const dompeA = profileOf("matériel", { id: "A" });          // beaucoup d'inconnu, aucun chargement
    const dompeB = profileOf("terre acceptée", { id: "B" });     // presque tout connu, beaucoup à débloquer
    const queue = buildQueue([
      { profile: dompeA, loads: [], reference: "A" },
      { profile: dompeB, loads: manyLoads, reference: "B" },
    ]);
    expect(queue[0].reference).toBe("B");
  });
});

// ---------------- Phase 6 — sémantique des matériaux ----------------

describe("LOT 17 — sémantique des matériaux", () => {
  it("« terre » n'accepte pas automatiquement sable, glaise ni grosses roches", () => {
    const p = profileOf("j'accepte de la terre");
    for (const key of ["sable", "argile", "roche"] as const) {
      const m = p.materials.find((x) => x.materialKey === key);
      expect(m?.stance ?? "INCONNU").not.toBe("ACCEPTE_CONFIRME");
    }
  });

  it("mais les propose comme occasions de qualification", () => {
    const p = profileOf("j'accepte de la terre");
    const subjects = buildQuestions(p, loads).map((q) => q.subject);
    expect(subjects).toContain("sable");
  });

  it("les familles restent distinctes", () => {
    expect(MATERIAL_FAMILY.beton).not.toBe(MATERIAL_FAMILY.asphalte);
    expect(MATERIAL_FAMILY.argile).not.toBe(MATERIAL_FAMILY.terre);
    expect(MATERIAL_FAMILY.terre_excavation).toBe("terre");
  });

  it("les quatre états fondamentaux sont exprimables", () => {
    const { profile, card } = cardOf("terre acceptée");
    const q = card.questions[0];
    const states = (["OUI", "CA_DEPEND", "NON", "JE_NE_SAIS_PAS"] as const)
      .map((a) => toNormalizedConstraint({ profile, question: q, answer: a }).acceptance_state);
    expect(states).toEqual(["CONFIRMED", "POSSIBLE", "REJECTED", "UNKNOWN"]);
  });
});

// ---------------- Phase 7 — langage de chantier québécois ----------------

describe("LOT 17 — langage de chantier réel", () => {
  const phrases = [
    "J'ai de la belle terre propre.",
    "J'ai environ 400 tonnes de terre sablonneuse avec un peu de glaise et des petites roches.",
    "20 voyages de semi 2 essieux, sable terreux mélangé avec du tuff, morceaux en bas de 18 pouces.",
    "Terre d'excavation avec roche.",
    "Béton cassé pas d'armature.",
    "Béton avec un peu de fer dedans.",
    "Je prends de la terre mais pas de grosse roche.",
    "Ça dépend de la grosseur.",
  ];

  it.each(phrases)("interprète sans planter : %s", (text) => {
    const { profile, card } = cardOf(text);
    expect(profile.originalText).toBe(text);
    const op = buildOperatorCard(card, profile);
    expect(op.reference).toBe("DOMPE-1");
  });

  it("« ça dépend de la grosseur » reste incertain", () => {
    const p = profileOf("Ça dépend de la grosseur.");
    expect(p.materials.every((m) => m.stance !== "ACCEPTE_CONFIRME")).toBe(true);
    expect(p.granulometry.confirmed).toBe(false);
  });

  it("« pas de grosse roche » documente un refus, pas un inconnu", () => {
    const { profile, card } = cardOf("Je prends de la terre mais pas de grosse roche.");
    const op = buildOperatorCard(card, profile);
    expect(op.refusedMaterials.length + profile.exclusions.length).toBeGreaterThan(0);
  });

  it("« terre propre » reste une déclaration non vérifiée", () => {
    const p = profileOf("J'ai de la belle terre propre.");
    expect(p.environment.humanConfirmed).toBe(false);
  });
});

// ---------------- Phase 8 — performance ----------------

describe("LOT 17 — performance de la file", () => {
  it("construit 300 cartes en moins de 3 secondes", () => {
    const inputs = Array.from({ length: 300 }, (_, i) => ({
      profile: profileOf("terre sablonneuse avec un peu de glaise et des petites roches", { id: `s${i}` }),
      loads,
      reference: `D-${i}`,
      city: "Québec",
    }));
    const t0 = performance.now();
    const queue = buildQueue(inputs);
    const ms = performance.now() - t0;
    expect(queue).toHaveLength(300);
    expect(ms).toBeLessThan(3000);
  });
});

// ---------------- Phase 10 — contrat LOT 18 ----------------

describe("LOT 17 — contrat normalisé pour le LOT 18", () => {
  it("expose tous les champs attendus", () => {
    const { profile, card } = cardOf("terre avec petites pierres");
    const c = toNormalizedConstraint({ profile, question: card.questions[0], answer: "OUI" });
    for (const field of [
      "request_id", "material", "material_family", "mixture_components", "granulometry",
      "reinforcement", "acceptance_state", "confidence", "source", "confirmed_by", "confirmed_at",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(c, field)).toBe(true);
    }
    expect(c.request_id).toBe(profile.submissionId);
  });

  it("en mode test, aucune confirmation humaine n'est revendiquée", () => {
    const { profile, card } = cardOf("terre acceptée");
    const c = toNormalizedConstraint({
      profile, question: card.questions[0], answer: "OUI", confirmedBy: "admin", testMode: true,
    });
    expect(c.confirmed_by).toBeNull();
    expect(c.confirmed_at).toBeNull();
    expect(c.source).toBe("qualification_test_mode");
    expect(c.confidence).toBe("MOYENNE");
  });
});
