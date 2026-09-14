// ============================================================
// LOT 14 — Confirmation humaine, journal immuable, profil courant.
// Tests PURS sur des fixtures : aucune demande réelle n'est utilisée,
// aucune écriture n'est effectuée.
// ============================================================
import { describe, expect, it } from "vitest";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import {
  buildAliasFromDecision, buildBroadAcceptance, buildBulkConfirmation, buildCorrectionEntry,
  buildDecisionEntry, buildQualifiedProfile, buildRequestConfirmation, buildRollbackEntry,
  buildTermProposal, completeness, fastTrack, historyOf, latestBySubject, matchingDelta,
  matchingSnapshot, normalizeTerm, originRank, toFillProfile,
  QUALIFICATION_JOURNAL_VERSION, type JournalDraft, type JournalEntry,
} from "@/lib/qualification/lot14";
import { buildLoadFromInterpretation } from "@/lib/matching/compatibility";
import { interpretChantier } from "@/lib/nlu/chantier";
import { FEATURE_FLAGS } from "@/lib/flags";

// ---- fixtures ----
const FIXTURE_ID = "fixture-dompe-1";
const author = (who = "admin-1", iso = "2026-09-14T10:00:00.000Z") =>
  ({ confirmedBy: who, now: new Date(iso) });

const profileOf = (text: string, id = FIXTURE_ID) =>
  buildAcceptanceProfile({ submissionId: id, reference: "FIXTURE-1", text });

let seq = 0;
const commit = (drafts: JournalDraft[] | JournalDraft): JournalEntry[] => {
  const list = Array.isArray(drafts) ? drafts : [drafts];
  return list.map((d) => ({
    ...d,
    id: d.id ?? `j${++seq}`,
    createdAt: d.createdAt ?? d.confirmedAt,
  }));
};

const load = (text: string) =>
  buildLoadFromInterpretation(interpretChantier(text, { direction: "EVACUATION" }), { id: text.slice(0, 8) });

describe("Lot 14 — journal", () => {
  it("version et entrée complète", () => {
    const e = commit(buildDecisionEntry({
      submissionId: FIXTURE_ID, category: "material", subject: "argile",
      decision: "ACCEPTED", proposedValue: "UNKNOWN", confirmedValue: "ACCEPTED",
      confidenceBefore: "INCONNU", originalText: "texte original", author: author(),
    }))[0];
    expect(QUALIFICATION_JOURNAL_VERSION).toBe("qualification-journal-v1");
    expect(e.decision).toBe("ACCEPTED");
    expect(e.originalText).toBe("texte original");
    expect(e.confirmedBy).toBe("admin-1");
  });

  it("une proposition IA n'est jamais une confirmation humaine", () => {
    const p = profileOf("terre et sable");
    const q = buildQualifiedProfile(p, []);
    expect(q.materials.every((m) => !m.humanConfirmed)).toBe(true);
  });

  it("dernière décision valide gagne, l'ancienne reste au journal", () => {
    const first = commit(buildDecisionEntry({
      submissionId: FIXTURE_ID, category: "material", subject: "argile",
      decision: "ACCEPTED", author: author("admin-1", "2026-09-14T10:00:00.000Z"),
    }));
    const second = commit(buildCorrectionEntry(
      first[0], { decision: "REFUSED" }, author("admin-1", "2026-09-16T10:00:00.000Z"),
    ));
    const all = [...first, ...second];
    const latest = latestBySubject(all).get("material:argile")!;
    expect(latest.decision).toBe("REFUSED");
    expect(latest.supersedesId).toBe(first[0].id);
    expect(historyOf(all, "material", "argile")).toHaveLength(2);
  });

  it("corriger conserve l'historique et la valeur précédente", () => {
    const first = commit(buildDecisionEntry({
      submissionId: FIXTURE_ID, category: "material", subject: "beton",
      decision: "ACCEPTED", confirmedValue: "ACCEPTED", author: author(),
    }));
    const rollback = commit(buildRollbackEntry([...first], "material", "beton", author("admin-2", "2026-09-17T10:00:00.000Z"))!);
    expect(rollback[0].decision).toBe("UNKNOWN");
    expect(rollback[0].previousValue).toBe("ACCEPTED");
    expect(historyOf([...first, ...rollback], "material", "beton")).toHaveLength(2);
  });

  it("rollback vers la décision antérieure", () => {
    const a = commit(buildDecisionEntry({ submissionId: FIXTURE_ID, category: "material", subject: "argile", decision: "ACCEPTED", confirmedValue: "ACCEPTED", author: author("a", "2026-09-14T10:00:00.000Z") }));
    const b = commit(buildCorrectionEntry(a[0], { decision: "REFUSED", confirmedValue: "REFUSED" }, author("a", "2026-09-16T10:00:00.000Z")));
    const c = commit(buildRollbackEntry([...a, ...b], "material", "argile", author("a", "2026-09-18T10:00:00.000Z"))!);
    expect(c[0].decision).toBe("ACCEPTED");
    const q = buildQualifiedProfile(profileOf("terre"), [...a, ...b, ...c]);
    expect(q.materials.find((m) => m.materialKey === "argile")!.status).toBe("ACCEPTED");
  });
});

describe("Lot 14 — profil courant", () => {
  it("priorité : confirmation humaine > texte > NLU", () => {
    expect(originRank("human_recent")).toBeLessThan(originRank("explicit_text"));
    expect(originRank("explicit_text")).toBeLessThan(originRank("historical"));
    expect(originRank("historical")).toBeLessThan(originRank("nlu_high"));
    expect(originRank("nlu_high")).toBeLessThan(originRank("nlu_medium"));
    expect(originRank("nlu_medium")).toBeLessThan(originRank("unknown"));
  });

  it("le texte original n'est jamais écrasé", () => {
    const p = profileOf("400 tonnes de terre sablonneuse avec un peu de glaise");
    const entries = commit(buildDecisionEntry({
      submissionId: FIXTURE_ID, category: "material", subject: "argile", decision: "REFUSED", author: author(),
    }));
    const q = buildQualifiedProfile(p, entries);
    expect(q.originalText).toBe("400 tonnes de terre sablonneuse avec un peu de glaise");
    expect(p.originalText).toBe(q.originalText);
  });

  it("UNKNOWN ne devient jamais REFUSED", () => {
    const q = buildQualifiedProfile(profileOf("terre et sable"), []);
    const asphalte = q.materials.find((m) => m.materialKey === "asphalte");
    expect(asphalte?.status ?? "UNKNOWN").toBe("UNKNOWN");
    expect(q.exclusions).not.toContain("asphalte");
  });

  it("refus explicite bat l'acceptation large", () => {
    const entries = commit(buildBroadAcceptance(FIXTURE_ID, ["argile", "beton"], author()));
    const q = buildQualifiedProfile(profileOf("prend presque n'importe quoi"), entries);
    expect(q.acceptanceMode).toBe("broad");
    expect(q.exclusions).toEqual(expect.arrayContaining(["argile", "beton"]));
    const fp = toFillProfile(q, profileOf("prend presque n'importe quoi").fillProfile);
    expect(fp.materials.find((m) => m.materialKey === "argile")!.status).toBe("REFUSED");
  });

  it("une confirmation matériaux ne touche ni la disponibilité ni le CRM", () => {
    const p = buildAcceptanceProfile({ submissionId: FIXTURE_ID, text: "terre", available: true });
    const entries = commit(buildDecisionEntry({
      submissionId: FIXTURE_ID, category: "material", subject: "terre", decision: "ACCEPTED", author: author(),
    }));
    const q = buildQualifiedProfile(p, entries);
    expect(q.available).toBe(true);
    expect(q.freshness).toEqual(p.freshness);
    expect(Object.keys(q)).not.toContain("crmStatus");
  });

  it("environnement reste séparé et « terre propre » n'est pas une caractérisation", () => {
    const q = buildQualifiedProfile(profileOf("terre propre, rien de contaminé"), []);
    expect(q.environment.status).toBe("UNKNOWN");
    expect(q.environment.humanConfirmed).toBe(false);
  });

  it("environnement confirmé manuellement", () => {
    const entries = commit(buildDecisionEntry({
      submissionId: FIXTURE_ID, category: "environment", subject: "environment",
      decision: "CONFIRMED", confirmedValue: "CARACTERISE", author: author(),
    }));
    const q = buildQualifiedProfile(profileOf("terre propre"), entries);
    expect(q.environment.status).toBe("CARACTERISE");
    expect(q.environment.humanConfirmed).toBe(true);
  });

  it("calibre lié au matériau : roche max 18 po ne s'applique pas à la terre", () => {
    const q = buildQualifiedProfile(profileOf("terre, sable et roche maximum 18 pouces"), []);
    const terre = q.materials.find((m) => m.materialKey === "terre");
    const roche = q.materials.find((m) => m.materialKey === "roche" || m.materialKey === "pierre");
    expect(terre?.maxInches ?? null).toBeNull();
    if (roche) expect(roche.maxInches).toBe(18);
  });

  it("calibre confirmé par matériau", () => {
    const entries = commit(buildDecisionEntry({
      submissionId: FIXTURE_ID, category: "granulometry", subject: "pierre",
      decision: "CONFIRMED", confirmedValue: 12, author: author(),
    }));
    const q = buildQualifiedProfile(profileOf("accepte terre, sable et pierre"), entries);
    expect(q.materials.find((m) => m.materialKey === "pierre")!.maxInches).toBe(12);
    expect(q.materials.find((m) => m.materialKey === "terre")!.maxInches).toBeNull();
  });

  it("capacité restante confirmée", () => {
    const entries = commit([
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "capacity", subject: "capacity_total", decision: "CONFIRMED", confirmedValue: 100, author: author() }),
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "capacity", subject: "capacity_remaining", decision: "CONFIRMED", confirmedValue: 35, author: author() }),
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "capacity", subject: "capacity_unit", decision: "CONFIRMED", confirmedValue: "voyages", author: author() }),
    ]);
    const q = buildQualifiedProfile(profileOf("terre"), entries);
    expect(q.capacity.total).toBe(100);
    expect(q.capacity.remaining).toBe(35);
    expect(q.capacity.unit).toBe("voyages");
    expect(q.capacity.humanConfirmed).toBe(true);
  });

  it("camions, accès et conditions confirmés", () => {
    const entries = commit([
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "truck", subject: "trucks", decision: "CONFIRMED", confirmedValue: ["10_roues", "semi_remorque"], author: author() }),
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "access", subject: "constraints", decision: "CONFIRMED", confirmedValue: ["accès étroit", "fils bas"], author: author() }),
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "condition", subject: "gelé", decision: "ACCEPTED", author: author() }),
    ]);
    const q = buildQualifiedProfile(profileOf("terre"), entries);
    expect(q.trucks.codes).toEqual(["10_roues", "semi_remorque"]);
    expect(q.accessConstraints.labels).toContain("fils bas");
    expect(q.conditions.some((c) => c.label === "gelé" && c.humanConfirmed)).toBe(true);
  });

  it("confirmation globale : les inconnus restent inconnus", () => {
    const p = profileOf("terre, sable, je sais pas pour le reste");
    const q0 = buildQualifiedProfile(p, []);
    const entries = commit(buildRequestConfirmation(FIXTURE_ID, q0, author()));
    const q = buildQualifiedProfile(p, entries);
    expect(q.requestConfirmedBy).toBe("admin-1");
    expect(q.requestConfirmedAt).toBeTruthy();
    expect(q.materials.filter((m) => m.status === "UNKNOWN").length)
      .toBe(q0.materials.filter((m) => m.status === "UNKNOWN").length);
  });
});

describe("Lot 14 — confirmation ultra rapide", () => {
  it("ne demande que les décisions utiles", () => {
    const p = profileOf("terre, sable, pas de béton, pas trop de glaise");
    const q = buildQualifiedProfile(p, []);
    const ft = fastTrack(q);
    expect(ft.certain.length).toBeGreaterThan(0);
    expect(ft.questions.length).toBeLessThanOrEqual(5);
    ft.questions.forEach((x) => expect(x.options).toEqual(["ACCEPTED", "REFUSED", "UNKNOWN"]));
  });

  it("confirmation groupée n'écrit que des propositions certaines", () => {
    const p = profileOf("terre et sable");
    const q = buildQualifiedProfile(p, []);
    const drafts = buildBulkConfirmation(p, q, author());
    expect(drafts.length).toBeGreaterThan(0);
    drafts.forEach((d) => expect(["ACCEPTED", "REFUSED"]).toContain(d.decision));
    const q2 = buildQualifiedProfile(p, commit(drafts));
    expect(q2.materials.filter((m) => m.humanConfirmed).length).toBe(drafts.length);
    expect(fastTrack(q2).certain).toHaveLength(0);
  });

  it("les actions massives exigent une confirmation explicite", () => {
    const q = buildQualifiedProfile(profileOf("terre, sable, gravier"), []);
    expect(fastTrack(q).requiresConfirmationDialog).toBe(true);
  });
});

describe("Lot 14 — complétude et impact", () => {
  it("score calculé seulement sur les informations pertinentes", () => {
    const p = profileOf("accepte terre et sable, pas de roche, 100 voyages");
    const q = buildQualifiedProfile(p, []);
    const c = completeness(q);
    expect(c.rows.find((r) => r.key === "calibre")!.applicable).toBe(false);
    expect(c.score).toBeGreaterThan(0);
    expect(c.score).toBeLessThanOrEqual(100);
    expect(typeof c.essentialComplete).toBe("boolean");
  });

  it("essentiel complété après confirmation humaine et capacité", () => {
    const p = profileOf("accepte terre et sable");
    const entries = commit([
      ...buildBulkConfirmation(p, buildQualifiedProfile(p, []), author()),
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "capacity", subject: "capacity_total", decision: "CONFIRMED", confirmedValue: 50, author: author() }),
    ]);
    expect(completeness(buildQualifiedProfile(p, entries)).essentialComplete).toBe(true);
  });

  it("avant / après réellement calculés", () => {
    const p = profileOf("je sais pas exactement");
    const loads = [load("40 tonnes de terre"), load("sable")];
    const entries = commit([
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "material", subject: "terre", decision: "ACCEPTED", author: author() }),
      buildDecisionEntry({ submissionId: FIXTURE_ID, category: "material", subject: "sable", decision: "ACCEPTED", author: author() }),
    ]);
    const { before, after } = matchingDelta(p, entries, loads);
    expect(before.certain + before.potential + before.incompatible).toBe(2);
    expect(after.certain).toBeGreaterThanOrEqual(before.certain);
  });

  it("instantané de matching sur profil courant", () => {
    const p = profileOf("accepte terre, sable, pierre");
    const snap = matchingSnapshot(toFillProfile(buildQualifiedProfile(p, []), p.fillProfile), [load("terre")]);
    expect(snap.certain + snap.potential + snap.incompatible).toBe(1);
  });
});

describe("Lot 14 — termes non reconnus et apprentissage contrôlé", () => {
  it("normalisation et proposition", () => {
    expect(normalizeTerm("Garnotte ")).toBe("garnotte");
    const p = buildTermProposal({ term: "garnotte", occurrences: 4, context: "du garnotte pis de la terre" });
    expect(p.termNorm).toBe("garnotte");
    expect(p.occurrences).toBe(4);
    expect(p.proposedMaterialKey).toBeNull();
  });

  it("aucun alias créé automatiquement", () => {
    const p = buildTermProposal({ term: "miron", occurrences: 2 });
    expect(buildAliasFromDecision(p, "LEFT_UNKNOWN", null, author())).toBeNull();
    expect(() => buildAliasFromDecision(p, "ALIAS_CREATED", null, author())).toThrow();
  });

  it("alias créé seulement après décision humaine", () => {
    const p = buildTermProposal({ term: "garnotte", occurrences: 4 });
    const alias = buildAliasFromDecision(p, "ALIAS_CREATED", "gravier", author())!;
    expect(alias.material_keys).toEqual(["gravier"]);
    expect(alias.validated_by_admin).toBe(true);
    expect(alias.notes).toContain("admin-1");
  });
});

describe("Lot 14 — non-régression permanente", () => {
  it("remblai / remplissage / fill ≠ terre", () => {
    for (const t of ["besoin de remplissage", "j'ai besoin de remblai", "need clean fill", "backfill"]) {
      const q = buildQualifiedProfile(profileOf(t), []);
      expect(q.materials.filter((m) => m.status === "ACCEPTED")).toHaveLength(0);
    }
  });

  it("« remplissage de terre » reste de la terre", () => {
    const q = buildQualifiedProfile(profileOf("remplissage de terre"), []);
    expect(q.materials.some((m) => m.materialKey === "terre" && m.status === "ACCEPTED")).toBe(true);
  });

  it("les écritures réelles sont désactivées par défaut", () => {
    expect(FEATURE_FLAGS.qualification_writes_v2).toBe(false);
    expect(FEATURE_FLAGS.qualification_control_center_v2).toBe(false);
    expect(FEATURE_FLAGS.material_matching_v2).toBe(false);
  });
});
