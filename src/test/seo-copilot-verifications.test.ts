import { describe, it, expect } from "vitest";
import {
  VERIFICATION_LABEL, runCannibalizationCheck, runIndexationCheck, runQaCheck, runVerification,
  verificationButtonLabel, verificationKindOfType, verificationStatusLabel,
  type VerificationPageRow,
} from "@/lib/seo/verification";
import { actionStatusLabel, natureOfType, workButtonLabel, capabilityOfType } from "@/lib/seo/workflow";
import { buildCopilotCounters, countersExplanation } from "@/lib/seo/counters";
import type { ActionGroup } from "@/lib/seo/actionGroups";

const page = (over: Partial<VerificationPageRow> = {}): VerificationPageRow => ({
  id: over.id ?? "p1", slug: over.slug ?? "excavation-quebec", status: "published",
  noindex: false, google_index_status: "indexed", qa_last_score: 90, qa_blockers: [],
  city_slug: "quebec", service_slug: "excavation", ...over,
});

const group = (type: string, members = 1): ActionGroup => ({
  key: `k-${type}`, kind: "page", title: `T ${type}`, actionLabel: "Action", reason: "raison",
  priority: "high", score: 70, pages: 1, impressions: 100, clicks: 2, ctr: 0.02, position: 12,
  conversions: 0, singleAction: members === 1, distinctActions: 1, relatedGroups: [],
  members: Array.from({ length: members }, (_, i) => ({ id: `o${i}`, type })),
  primary: { id: "o0", type, status: "open" },
} as unknown as ActionGroup);

describe("Copilote SEO — actions vs vérifications", () => {
  it("1. une action exécutable reste une action avec le bouton Travailler", () => {
    expect(natureOfType("high_impr_low_ctr")).toBe("action");
    expect(workButtonLabel("open", capabilityOfType("high_impr_low_ctr"))).toBe("Travailler");
  });

  it("2. les trois signaux de diagnostic sont des vérifications", () => {
    for (const t of ["not_indexed", "not_indexed_bulk", "low_qa", "cannibalization"]) {
      expect(natureOfType(t)).toBe("verification");
      expect(verificationKindOfType(t)).not.toBeNull();
    }
    expect(verificationKindOfType("high_impr_low_ctr")).toBeNull();
  });

  it("3. les libellés de vérification sont distincts de Travailler", () => {
    expect(verificationButtonLabel("idle")).toBe("Vérifier");
    expect(verificationButtonLabel("idle", true)).toBe("Revérifier");
    expect(verificationButtonLabel("running")).toBe("Vérification en cours…");
    expect(verificationButtonLabel("error")).toBe("Réessayer la vérification");
    expect(VERIFICATION_LABEL.indexation).toBe("Indexation");
  });

  it("4. états d'action : À travailler, En cours, Terminée, À réessayer, Ignorée", () => {
    expect(actionStatusLabel("open")).toBe("À travailler");
    expect(actionStatusLabel("in_progress")).toBe("En cours");
    expect(actionStatusLabel("completed")).toBe("Terminée");
    expect(actionStatusLabel("error")).toBe("À réessayer");
    expect(actionStatusLabel("dismissed")).toBe("Ignorée");
  });

  it("5. états de vérification : À vérifier, En cours, Vérifiée, Problème détecté, Erreur, À revérifier", () => {
    expect(verificationStatusLabel("idle")).toBe("À vérifier");
    expect(verificationStatusLabel("idle", null, true)).toBe("À revérifier");
    expect(verificationStatusLabel("running")).toBe("En cours");
    expect(verificationStatusLabel("done", "ok")).toBe("Vérifiée");
    expect(verificationStatusLabel("done", "issue")).toBe("Problème détecté");
    expect(verificationStatusLabel("error")).toBe("Erreur");
  });

  it("6. vérification d'indexation sans problème", () => {
    const r = runIndexationCheck([page(), page({ id: "p2", slug: "s2" })]);
    expect(r.outcome).toBe("ok");
    expect(r.checked).toBe(2);
    expect(r.issues).toHaveLength(0);
  });

  it("7. vérification d'indexation qui détecte un problème (noindex)", () => {
    const r = runIndexationCheck([page(), page({ id: "p2", slug: "s2", noindex: true })]);
    expect(r.outcome).toBe("issue");
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].url).toBe("/s2");
    expect(r.issues[0].message).toMatch(/noindex/);
  });

  it("8. statut Google non indexé ou inconnu remonte comme problème", () => {
    const r = runIndexationCheck([
      page({ id: "a", slug: "a", google_index_status: "crawled_not_indexed" }),
      page({ id: "b", slug: "b", google_index_status: null }),
    ]);
    expect(r.issues).toHaveLength(2);
  });

  it("9. les brouillons ne sont pas comptés comme problème d'indexation", () => {
    const r = runIndexationCheck([page({ status: "draft", google_index_status: null })]);
    expect(r.outcome).toBe("ok");
  });

  it("10. QA technique : score sous le seuil", () => {
    const r = runQaCheck([page({ qa_last_score: 42 })], 70);
    expect(r.outcome).toBe("issue");
    expect(r.issues[0].message).toMatch(/42\/100/);
  });

  it("11. QA technique : bloqueurs listés", () => {
    const r = runQaCheck([page({ qa_blockers: ["title manquant", { message: "h1 dupliqué" }] })]);
    expect(r.issues[0].message).toMatch(/title manquant/);
  });

  it("12. QA technique sans problème", () => {
    const r = runQaCheck([page(), page({ id: "p2", slug: "s2", qa_last_score: 88 })]);
    expect(r.outcome).toBe("ok");
    expect(r.summary).toMatch(/Aucun bloqueur/);
  });

  it("13. cannibalisation détectée sur le même territoire × service", () => {
    const r = runCannibalizationCheck([
      page({ id: "a", slug: "a" }), page({ id: "b", slug: "b" }),
      page({ id: "c", slug: "c", city_slug: "levis" }),
    ]);
    expect(r.outcome).toBe("issue");
    expect(r.issues).toHaveLength(2);
    expect(r.issues[0].message).toMatch(/\/a/);
  });

  it("14. aucune cannibalisation quand chaque couple est unique", () => {
    const r = runCannibalizationCheck([page({ id: "a", slug: "a" }), page({ id: "b", slug: "b", city_slug: "levis" })]);
    expect(r.outcome).toBe("ok");
  });

  it("15. une vérification ne renvoie jamais de modification de page", () => {
    const rows = [page({ noindex: true, qa_last_score: 10 })];
    const snapshot = JSON.stringify(rows);
    for (const k of ["indexation", "qa", "cannibalisation"] as const) {
      const r = runVerification(k, rows);
      expect(Object.keys(r)).toEqual(["kind", "outcome", "checked", "issues", "summary", "checked_at"]);
    }
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it("16. une vérification est rejouable et donne le même verdict (retry)", () => {
    const rows = [page({ noindex: true })];
    const a = runVerification("indexation", rows);
    const b = runVerification("indexation", rows);
    expect(b.outcome).toBe(a.outcome);
    expect(b.issues).toEqual(a.issues);
  });

  it("17. le résultat porte un horodatage pour l'historique", () => {
    const r = runVerification("qa", [page({ qa_last_score: 10 })]);
    expect(Number.isNaN(Date.parse(r.checked_at))).toBe(false);
  });

  it("18. compteurs : aucun nombre ambigu", () => {
    const groups = [group("high_impr_low_ctr"), group("low_qa"), group("position_gain", 3)];
    const c = buildCopilotCounters({
      signalsDetected: 120, openCount: 48, inProgressCount: 3, completedCount: 12,
      totalLoaded: 48, filteredCount: 45, groups,
    });
    expect(c.opportunitiesOpen).toBe(51);
    expect(c.opportunitiesVisible).toBe(45);
    expect(c.hiddenByFilter).toBe(3);
    expect(c.hiddenByLimit).toBe(3);
    expect(c.actionsUnique).toBe(3);
    expect(c.actionsGrouped).toBe(1);
    expect(c.verifications).toBe(1);
    expect(c.executable).toBe(2);
  });

  it("19. l'explication des compteurs justifie l'écart entre 48 affichées et 51 ouvertes", () => {
    const c = buildCopilotCounters({
      signalsDetected: 10, openCount: 51, inProgressCount: 0, completedCount: 0,
      totalLoaded: 48, filteredCount: 48, groups: [group("low_qa")],
    });
    const lines = countersExplanation(c).join(" ");
    expect(lines).toMatch(/51 opportunité/);
    expect(lines).toMatch(/48 opportunité\(s\) affichée/);
    expect(lines).toMatch(/3 opportunité\(s\) non chargée/);
  });

  it("20. un groupe de vérification ne propose jamais le workflow d'écriture", () => {
    const g = group("cannibalization");
    expect(natureOfType(g.primary.type)).toBe("verification");
    expect(capabilityOfType(g.primary.type)).toBe("verification");
  });
});
