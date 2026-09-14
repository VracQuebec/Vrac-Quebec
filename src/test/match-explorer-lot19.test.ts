// ============================================================
// LOT 19 — TESTS DE L'EXPLORATEUR DE MATCHS ET DU JOURNAL SIMULÉ
// Aucune écriture, aucune donnée réelle.
// ============================================================
import { describe, expect, it } from "vitest";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import { buildEnrichedProfile, decomposeLoad } from "@/lib/qualification/lot15";
import { buildQuestions } from "@/lib/qualification/lot16";
import { evaluateQualificationImpact } from "@/lib/matching/impact";
import {
  buildUnlockableMatches, createSimulationJournal, currentCounts, describeDelta, matchInterpretation,
} from "@/lib/matching/explorer";
import { parseMaterialDescription, toLoadComposition } from "@/lib/material-language";

const profileOf = (text: string, id = "r1") =>
  buildEnrichedProfile(buildAcceptanceProfile({
    submissionId: id, reference: `DMP-${id}`, text, available: true, lastConfirmedAt: null,
  }));

const loads = [
  { load: decomposeLoad("terre sablonneuse avec un peu de glaise et quelques petites roches", "l1") },
  { load: decomposeLoad("20 voyages de terre", "l2") },
  { load: decomposeLoad("béton cassé", "l3") },
];

describe("explorateur de matchs débloquables", () => {
  const profile = profileOf("j'accepte de la terre et du sable, pas de béton");

  it("chaque ligne expose matériau, remblai, état, raison et manques", () => {
    const rows = buildUnlockableMatches({ profile, reference: "DMP-1", loads });
    expect(rows).toHaveLength(3);
    const row = rows[0];
    expect(row.requestReference).toBe("DMP-1");
    expect(row.principalMaterial).toBeTruthy();
    expect(row.stateLabel).toBeTruthy();
    expect(row.blockingReason).toBeTruthy();
    expect(Array.isArray(row.missing)).toBe(true);
    expect(row.acceptance.length).toBeGreaterThan(0);
  });

  it("filtre les matchs réellement débloquables", () => {
    const all = buildUnlockableMatches({ profile, loads });
    const only = buildUnlockableMatches({ profile, loads, onlyUnlockable: true });
    expect(only.length).toBeLessThanOrEqual(all.length);
    expect(only.every((r) => r.question !== null)).toBe(true);
  });

  it("un refus explicite reste non compatible", () => {
    const rows = buildUnlockableMatches({ profile, loads });
    const beton = rows.find((r) => r.loadId === "l3")!;
    expect(beton.state).toBe("INCOMPATIBLE");
    expect(beton.unlockable).toBe(false);
  });
});

describe("simulation avant / après", () => {
  const profile = profileOf("terre acceptée", "r2");

  it("compte les états avant la réponse", () => {
    const before = currentCounts(profile, loads);
    expect(Object.values(before).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("une réponse simulée ne modifie que la copie du profil", () => {
    const question = buildQuestions(profile, loads.map((l) => l.load))[0];
    const snapshot = JSON.stringify(profile);
    const impact = evaluateQualificationImpact({ profile, loads, question, answer: "OUI" });
    expect(JSON.stringify(profile)).toBe(snapshot);
    expect(impact.before).toBeDefined();
    expect(impact.after).toBeDefined();
  });

  it("« je ne sais pas » ne change rien", () => {
    const question = buildQuestions(profile, loads.map((l) => l.load))[0];
    const impact = evaluateQualificationImpact({ profile, loads, question, answer: "JE_NE_SAIS_PAS" });
    expect(impact.before).toEqual(impact.after);
  });

  it("le delta est lisible", () => {
    expect(describeDelta(
      { CONFIRMED_COMPATIBLE: 4, PROBABLE_COMPATIBLE: 8, NEEDS_CONFIRMATION: 12, INCOMPATIBLE: 3, INSUFFICIENT_INFORMATION: 0 },
      { CONFIRMED_COMPATIBLE: 11, PROBABLE_COMPATIBLE: 5, NEEDS_CONFIRMATION: 5, INCOMPATIBLE: 6, INSUFFICIENT_INFORMATION: 0 },
    )).toContain("+7 compatible confirmé");
  });
});

describe("journal de simulation", () => {
  const profile = profileOf("terre acceptée", "r3");

  it("enregistre uniquement en mémoire, avec horodatage et changements", () => {
    const journal = createSimulationJournal(() => new Date("2026-01-01T12:00:00Z"));
    const question = buildQuestions(profile, loads.map((l) => l.load))[0];
    const impact = evaluateQualificationImpact({ profile, loads, question, answer: "OUI" });
    const entry = journal.add(impact, "qualification rapide");
    expect(entry.index).toBe(1);
    expect(entry.simulationOnly).toBe(true);
    expect(entry.timestamp).toBe("2026-01-01T12:00:00.000Z");
    expect(entry.source).toBe("qualification rapide");
    expect(journal.entries).toHaveLength(1);
    journal.clear();
    expect(journal.entries).toHaveLength(0);
  });
});

describe("intégration interprétation → matching", () => {
  it("une description libre produit un résumé de matchs simulés", () => {
    const parsed = parseMaterialDescription(
      "20 voyages de semi 2 essieux de sable terreux avec du tuff en dessous de 18 pouces",
    );
    const summary = matchInterpretation({
      load: toLoadComposition(parsed, "interp"),
      requests: [
        { profile: profileOf("j'accepte terre et sable", "a"), reference: "A" },
        { profile: profileOf("pas de roche", "b"), reference: "B" },
        { profile: profileOf("terre seulement", "c"), reference: "C" },
      ],
    });
    expect(summary.total).toBe(3);
    expect(summary.confirmed + summary.probable + summary.needConfirmation
      + summary.incompatible + summary.insufficient).toBe(3);
    expect(summary.rows.every((r) => r.requestReference)).toBe(true);
  });

  it("les questions prioritaires viennent du moteur d'impact", () => {
    const parsed = parseMaterialDescription("400 tonnes de terre avec quelques petites roches");
    const rows = buildUnlockableMatches({
      profile: profileOf("terre acceptée", "d"),
      loads: [{ load: toLoadComposition(parsed, "interp") }],
    });
    expect(rows[0].potentialUnlocked).toBeGreaterThanOrEqual(0);
  });
});
