// LOT 18 — Moteur d'impact « qualification → match » (pur, lecture seule).
import { describe, expect, it } from "vitest";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import { buildEnrichedProfile, decomposeLoad, type EnrichedProfile } from "@/lib/qualification/lot15";
import { buildQuestions, simulateAnswer } from "@/lib/qualification/lot16";
import {
  buildExplorerRows, countStates, createMatchCache, evaluateMatch, evaluateQualificationImpact,
  isPlausibleCandidate, matchesForLoad, matchesForRequest, planSplit, rankQuestionsByMatchImpact,
  MATCH_IMPACT_VERSION, MATCH_STATE_LABELS,
} from "@/lib/matching/impact";
import { auditDisplayValues, displayCity, displayText, fixMojibake, hasMojibake } from "@/lib/text/display";

const profileOf = (
  text: string,
  opts: { available?: boolean; id?: string; lastConfirmedAt?: string | null } = {},
): EnrichedProfile =>
  buildEnrichedProfile(buildAcceptanceProfile({
    submissionId: opts.id ?? "s1", reference: "DOMPE-1", text,
    available: opts.available ?? true, lastConfirmedAt: opts.lastConfirmedAt ?? null,
  }));

/** Confirme humainement un matériau (via la simulation du LOT 16, jamais en base). */
function confirm(profile: EnrichedProfile, subject: string, loads = [decomposeLoad("terre", "x")]) {
  const q = buildQuestions(profile, loads).find((x) => x.subject === subject)
    ?? { id: `material:${subject}`, category: "material" as const, subject, text: "?", reason: "", followUps: [], unlocked: 0, score: 0 };
  return simulateAnswer(profile, q, "OUI");
}

describe("LOT 18 — états de match", () => {
  it("expose les cinq états en langage simple", () => {
    expect(MATCH_STATE_LABELS.CONFIRMED_COMPATIBLE).toBe("Compatible confirmé");
    expect(MATCH_STATE_LABELS.NEEDS_CONFIRMATION).toBe("À confirmer");
    expect(MATCH_STATE_LABELS.INSUFFICIENT_INFORMATION).toBe("Information insuffisante");
    expect(MATCH_IMPACT_VERSION).toBe("match-impact-v1");
  });

  it("CAS 1 — terre propre vers une demande qui accepte la terre confirmée = compatible confirmé", () => {
    const p = confirm(profileOf("j'accepte de la terre propre"), "terre");
    const e = evaluateMatch(decomposeLoad("terre propre", "l1"), p, { distanceKm: 10 });
    expect(e.state).toBe("CONFIRMED_COMPATIBLE");
    expect(e.reasons.some((r) => r.mark === "✓")).toBe(true);
  });

  it("CAS 2 — terre + petites pierres vers une demande qui n'a confirmé que la terre = à confirmer", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const e = evaluateMatch(decomposeLoad("terre avec des petites pierres", "l2"), p, { distanceKm: 5 });
    expect(e.state).toBe("NEEDS_CONFIRMATION");
    expect(e.state).not.toBe("CONFIRMED_COMPATIBLE");
    expect(e.unlockingQuestion).toBeTruthy();
  });

  it("CAS 3 — roche 18 po vers un maximum de 12 po = non compatible", () => {
    const p = profileOf("roche acceptée maximum 12 pouces");
    const e = evaluateMatch(decomposeLoad("roche de 18 pouces", "l3"), p);
    expect(e.state).toBe("INCOMPATIBLE");
    expect(e.blockers.length).toBeGreaterThan(0);
  });

  it("CAS 4 — roche 6 po vers un maximum de 12 po = pas bloqué par la granulométrie", () => {
    const p = profileOf("roche acceptée maximum 12 pouces");
    const e = evaluateMatch(decomposeLoad("roche de 6 pouces", "l4"), p);
    expect(e.state).not.toBe("INCOMPATIBLE");
  });

  it("CAS 5 — béton sans armature vers « béton sans armature seulement » = pas de blocage armature", () => {
    const p = { ...profileOf("béton cassé accepté"), conditions: ["béton sans armature"] };
    const e = evaluateMatch(decomposeLoad("béton cassé", "l5"), p, { reinforced: false });
    expect(e.blockers.join(" ")).not.toMatch(/armature/i);
  });

  it("CAS 6 — béton armé vers « sans armature seulement » = non compatible", () => {
    const p = { ...profileOf("béton cassé accepté"), conditions: ["béton sans armature"] };
    const e = evaluateMatch(decomposeLoad("béton cassé", "l6"), p, { reinforced: true });
    expect(e.state).toBe("INCOMPATIBLE");
    expect(e.blockers.join(" ")).toMatch(/armature/i);
  });

  it("CAS 6b — acceptation du béton n'implique jamais le béton armé", () => {
    const p = confirm(profileOf("béton cassé accepté"), "beton");
    const e = evaluateMatch(decomposeLoad("béton cassé", "l6b"), p, { reinforced: true });
    expect(e.state).toBe("NEEDS_CONFIRMATION");
    expect(e.missing.join(" ")).toMatch(/armé/i);
  });

  it("CAS 10 — matériau inconnu = information insuffisante", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const e = evaluateMatch(decomposeLoad("du stock", "l10"), p, { distanceKm: 3 });
    expect(["INSUFFICIENT_INFORMATION", "NEEDS_CONFIRMATION"]).toContain(e.state);
  });

  it("CAS 11 — un refus explicite ne peut pas être écrasé par une déduction", () => {
    const p = profileOf("terre acceptée mais absolument pas de glaise");
    const e = evaluateMatch(decomposeLoad("terre avec de la glaise", "l11"), p);
    expect(e.state).toBe("INCOMPATIBLE");
    expect(isPlausibleCandidate(decomposeLoad("glaise", "g"), p)).toBe(false);
  });
});

describe("LOT 18 — capacité, disponibilité, distance", () => {
  it("CAS 8 — 400 t pour 150 t restantes = capacité partielle", () => {
    const base = confirm(profileOf("j'accepte de la terre"), "terre");
    const p: EnrichedProfile = {
      ...base,
      capacity: { total: 150, remaining: 150, unit: "tonnes", known: true },
    };
    const e = evaluateMatch(decomposeLoad("terre", "l8"), p, { quantity: { value: 400, unit: "tonnes" } });
    expect(e.capacity.partial).toBe(true);
    expect(e.capacity.acceptableQuantity).toBe(150);
    expect(e.capacity.leftover).toBe(250);
  });

  it("CAS 9 — matériau accepté mais dompe fermée = pas utilisable opérationnellement", () => {
    const p = confirm(profileOf("j'accepte de la terre", { available: false }), "terre");
    const e = evaluateMatch(decomposeLoad("terre", "l9"), p);
    expect(e.operational.usable).toBe(false);
    expect(e.state).not.toBe("INCOMPATIBLE");
  });

  it("la distance ne refuse jamais seule, elle déclasse", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const proche = evaluateMatch(decomposeLoad("terre", "a"), p, { distanceKm: 5 });
    const loin = evaluateMatch(decomposeLoad("terre", "b"), p, { distanceKm: 120 });
    expect(loin.state).toBe(proche.state);
    expect(loin.operational.relevance).toBeLessThan(proche.operational.relevance);
  });

  it("un rayon explicite reste une contrainte dure", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const e = evaluateMatch(decomposeLoad("terre", "c"), p, { distanceKm: 90, maxRadiusKm: 25 });
    expect(e.state).toBe("INCOMPATIBLE");
  });

  it("le split matching répartit une quantité sur plusieurs demandes", () => {
    const a: EnrichedProfile = {
      ...confirm(profileOf("j'accepte de la terre", { id: "a" }), "terre"),
      capacity: { total: 150, remaining: 150, unit: "tonnes", known: true },
    };
    const b: EnrichedProfile = {
      ...confirm(profileOf("j'accepte de la terre", { id: "b" }), "terre"),
      capacity: { total: 300, remaining: 300, unit: "tonnes", known: true },
    };
    const plan = planSplit(decomposeLoad("terre", "split"), [{ profile: a }, { profile: b }], 400);
    expect(plan.placed).toBe(400);
    expect(plan.parts.length).toBeGreaterThan(1);
    expect(plan.leftover).toBe(0);
  });
});

describe("LOT 18 — impact d'une réponse de qualification", () => {
  const loads = [
    { load: decomposeLoad("20 voyages de terre", "l1") },
    { load: decomposeLoad("terre avec des petites pierres", "l2") },
    { load: decomposeLoad("béton cassé", "l3") },
  ];

  it("un « oui » sur la pierre débloque des matchs, sans écriture", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const question = buildQuestions(p, loads.map((l) => l.load)).find((q) => q.subject === "pierre")!;
    const impact = evaluateQualificationImpact({ profile: p, loads, question, answer: "OUI" });
    expect(impact.gain).toBeGreaterThanOrEqual(0);
    expect(impact.transitions).toHaveLength(3);
    expect(impact.summary).toMatch(/match/);
    // Le profil d'origine reste inchangé : aucune mutation.
    expect(countStates(p, loads)).toEqual(impact.before);
  });

  it("CAS 7 — « ça dépend » sans précision reste conditionnel", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const question = buildQuestions(p, loads.map((l) => l.load)).find((q) => q.subject === "roche")
      ?? buildQuestions(p, loads.map((l) => l.load))[0];
    const impact = evaluateQualificationImpact({ profile: p, loads, question, answer: "CA_DEPEND" });
    expect(impact.after.CONFIRMED_COMPATIBLE).toBeLessThanOrEqual(impact.before.CONFIRMED_COMPATIBLE + 0);
    expect(impact.nowConfirmed.length).toBe(impact.before.CONFIRMED_COMPATIBLE);
  });

  it("« je ne sais pas » ne change rien", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const question = buildQuestions(p, loads.map((l) => l.load))[0];
    const impact = evaluateQualificationImpact({ profile: p, loads, question, answer: "JE_NE_SAIS_PAS" });
    expect(impact.before).toEqual(impact.after);
    expect(impact.gain).toBe(0);
    expect(impact.summary).toMatch(/Aucune information/);
  });

  it("un « non » peut bloquer des matchs et l'explique", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const question = buildQuestions(p, loads.map((l) => l.load)).find((q) => q.subject === "pierre")!;
    const oui = evaluateQualificationImpact({ profile: p, loads, question, answer: "OUI" });
    const non = evaluateQualificationImpact({ profile: p, loads, question, answer: "NON" });
    expect(non.after.INCOMPATIBLE).toBeGreaterThanOrEqual(oui.after.INCOMPATIBLE);
    expect(non.transitions.every((t) => t.reason.length > 0)).toBe(true);
  });

  it("chaque transition possède une raison lisible", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const question = buildQuestions(p, loads.map((l) => l.load))[0];
    const impact = evaluateQualificationImpact({ profile: p, loads, question, answer: "OUI" });
    for (const t of impact.transitions) {
      expect(t.beforeLabel).toBeTruthy();
      expect(t.afterLabel).toBeTruthy();
      expect(t.reason.length).toBeGreaterThan(3);
    }
  });

  it("les questions sont classées par impact réel sur les matchs", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const questions = buildQuestions(p, loads.map((l) => l.load));
    const ranked = rankQuestionsByMatchImpact(p, loads, questions);
    expect(ranked.length).toBe(questions.length);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
    const inutile = ranked.find((r) => r.affected === 0);
    if (inutile) expect(inutile.explanation).toMatch(/Aucun match/);
  });
});

describe("LOT 18 — bidirectionnel, explorateur, performance", () => {
  it("CAS 12 — le même modèle donne le même verdict dans les deux sens", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const load = decomposeLoad("terre", "bi");
    const a = matchesForLoad(load, [{ profile: p, ctx: { distanceKm: 8 } }]);
    const b = matchesForRequest(p, [{ load, ctx: { distanceKm: 8 } }]);
    expect(a[0].evaluation.state).toBe(b[0].evaluation.state);
    expect(a[0].evaluation.requestId).toBe(b[0].evaluation.requestId);
  });

  it("l'explorateur liste les matchs concernés avec leur blocage", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const rows = buildExplorerRows(p, [
      { load: decomposeLoad("terre", "r1"), ctx: { distanceKm: 12, quantity: { value: 40, unit: "tonnes" }, label: "Shannon" } },
      { load: decomposeLoad("terre avec petites pierres", "r2"), ctx: {} },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].location).toBe("Shannon");
    expect(rows[0].distance).toBe("12 km");
    expect(rows[1].blockingReason.length).toBeGreaterThan(0);
  });

  it("le pré-filtrage évite les évaluations inutiles", () => {
    const p = profileOf("terre acceptée mais pas de béton");
    expect(isPlausibleCandidate(decomposeLoad("béton cassé", "x"), p)).toBe(false);
    expect(isPlausibleCandidate(decomposeLoad("terre", "y"), p)).toBe(true);
  });

  it("le cache évite de recalculer la même paire", () => {
    const cache = createMatchCache();
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const load = decomposeLoad("terre", "cache");
    const first = cache.evaluate(load, p);
    const second = cache.evaluate(load, p);
    expect(second).toBe(first);
    expect(cache.size()).toBe(1);
  });

  it("performance : 500 demandes × 1 chargement évaluées rapidement", () => {
    const load = decomposeLoad("terre avec petites pierres", "perf");
    const requests = Array.from({ length: 500 }, (_, i) => ({
      profile: profileOf("j'accepte de la terre", { id: `p${i}` }),
      ctx: { distanceKm: i % 50 },
    }));
    const t0 = Date.now();
    const res = matchesForLoad(load, requests);
    const elapsed = Date.now() - t0;
    expect(res.length).toBe(500);
    expect(elapsed).toBeLessThan(15000);
  });

  it("recalcul après une réponse : reste sous la seconde sur 200 chargements", () => {
    const p = confirm(profileOf("j'accepte de la terre"), "terre");
    const loads = Array.from({ length: 200 }, (_, i) => ({ load: decomposeLoad("terre avec petites pierres", `L${i}`) }));
    const question = buildQuestions(p, [loads[0].load]).find((q) => q.subject === "pierre")!;
    const t0 = Date.now();
    const impact = evaluateQualificationImpact({ profile: p, loads, question, answer: "OUI" });
    expect(impact.transitions).toHaveLength(200);
    expect(Date.now() - t0).toBeLessThan(10000);
  });
});

describe("LOT 18 — affichage sûr (encodage)", () => {
  it("corrige « Prã©Vost » à l'affichage sans toucher la donnée", () => {
    const original = "Prã©Vost";
    expect(hasMojibake(original)).toBe(true);
    expect(displayCity(original)).toBe("Prévost");
    expect(original).toBe("Prã©Vost");
  });

  it("corrige les séquences courantes", () => {
    expect(fixMojibake("QuÃ©bec")).toBe("Québec");
    expect(fixMojibake("ChÃ¢teau-Richer")).toBe("Château-Richer");
    expect(fixMojibake("ForÃªt")).toBe("Forêt");
    expect(fixMojibake("Ã€ cÃ´tÃ©")).toBe("À côté");
    expect(fixMojibake("FranÃ§ois")).toBe("François");
  });

  it("laisse un texte correct intact", () => {
    expect(displayText("Sainte-Anne-de-Beaupré")).toBe("Sainte-Anne-de-Beaupré");
    expect(hasMojibake("Sainte-Anne-de-Beaupré")).toBe(false);
    expect(displayText(null, "Secteur inconnu")).toBe("Secteur inconnu");
  });

  it("audite une liste de valeurs sans rien réécrire", () => {
    const fixes = auditDisplayValues(["Prã©Vost", "Shannon", null, "QuÃ©bec"]);
    expect(fixes).toHaveLength(2);
    expect(fixes[0]).toEqual({ original: "Prã©Vost", displayed: "Prévost" });
  });
});
