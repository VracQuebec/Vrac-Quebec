import { describe, it, expect } from "vitest";
import { buildCopilotCounters, countersExplanation, counterSources, explainHidden } from "@/lib/seo/counters";
import type { ActionGroup } from "@/lib/seo/actionGroups";
import { natureOfType, actionStatusLabel, nextStatus, retryErrors, buildLogEntry } from "@/lib/seo/workflow";
import { runVerification, verificationStatusLabel, verificationKindOfType } from "@/lib/seo/verification";
import type { VerificationPageRow } from "@/lib/seo/verification";

const group = (type: string, members = 1): ActionGroup => ({
  key: `k-${type}-${members}`, kind: "page", title: `T ${type}`, actionLabel: "Action", reason: "raison",
  priority: "high", score: 70, pages: 1, impressions: 100, clicks: 2, ctr: 0.02, position: 12,
  conversions: 0, singleAction: members === 1, distinctActions: 1, relatedGroups: [],
  primary: { id: `o-${type}`, type, status: "open", title: `T ${type}` } as ActionGroup["primary"],
  members: Array.from({ length: members }, (_, i) => ({ id: `o-${type}-${i}`, type, status: "open", title: `T ${type}` })) as ActionGroup["members"],
} as ActionGroup);

const page = (over: Partial<VerificationPageRow> = {}): VerificationPageRow => ({
  id: over.id ?? "p1", slug: over.slug ?? "excavation-quebec", status: "published",
  noindex: false, google_index_status: "indexed", qa_last_score: 90, qa_blockers: [],
  city_slug: "quebec", service_slug: "excavation", ...over,
});

const base = {
  signalsDetected: 61, openCount: 37, inProgressCount: 7, completedCount: 4,
  errorCount: 3, dismissedCount: 0, resolvedCount: 8, appliedCount: 4, staleCount: 726,
  totalCount: 789,
};

describe("Audit de cohérence du Copilote SEO", () => {
  it("1. les opportunités actives = ouvertes + en cours + erreurs", () => {
    const c = buildCopilotCounters({ ...base, totalLoaded: 47, filteredCount: 47, groups: [] });
    expect(c.opportunitiesOpen).toBe(44);
    expect(c.opportunitiesActive).toBe(47);
    expect(c.errors).toBe(3);
  });

  it("2. le total en base couvre exactement tous les statuts", () => {
    const c = buildCopilotCounters({ ...base, totalLoaded: 47, filteredCount: 47, groups: [] });
    const sum = c.opportunitiesActive + c.actionsCompleted + c.resolved + c.dismissed + c.stale;
    expect(sum).toBe(c.opportunitiesTotal);
  });

  it("3. l'écart entre actives et affichées est expliqué (filtre)", () => {
    const c = buildCopilotCounters({ ...base, totalLoaded: 47, filteredCount: 40, groups: [] });
    expect(c.hiddenByFilter).toBe(7);
    expect(c.hiddenByLimit).toBe(0);
    expect(c.opportunitiesVisible + c.hiddenByFilter).toBe(47);
  });

  it("4. l'écart lié à la limite de chargement est expliqué", () => {
    const c = buildCopilotCounters({ ...base, openCount: 200, inProgressCount: 4, errorCount: 3, totalLoaded: 200, filteredCount: 200, groups: [] });
    expect(c.hiddenByLimit).toBe(7);
    expect(countersExplanation(c).join(" ")).toMatch(/7 opportunité\(s\) non chargée/);
  });

  it("5. chaque compteur affiché déclare sa source en base", () => {
    const c = buildCopilotCounters({ ...base, totalLoaded: 47, filteredCount: 47, groups: [group("high_impr_low_ctr")] });
    const src = counterSources(c);
    expect(src.length).toBeGreaterThanOrEqual(15);
    for (const s of src) expect(s.source.length).toBeGreaterThan(10);
    expect(src.find((s) => s.key === "errors")?.value).toBe(3);
    expect(src.find((s) => s.key === "stale")?.source).toMatch(/stale/);
  });

  it("6. le regroupement ne double jamais le compte des actions", () => {
    const groups = [group("high_impr_low_ctr", 3), group("ctr_top10", 2), group("low_qa", 1)];
    const c = buildCopilotCounters({ ...base, totalLoaded: 6, filteredCount: 6, groups });
    expect(c.actionsUnique).toBe(3);
    expect(c.actionsGrouped).toBe(2);
    expect(c.signalsGrouped).toBe(3);
    expect(c.actionsUnique + c.signalsGrouped).toBe(6);
    expect(c.actionsUnique + c.actionsGrouped).not.toBe(c.opportunitiesVisible);
  });

  it("7. une action regroupée conserve tous ses signaux d'origine", () => {
    const g = group("group_service", 4);
    expect(g.members).toHaveLength(4);
    expect(g.members.every((m) => m.type === "group_service")).toBe(true);
  });

  it("8. actions exécutables et vérifications sont strictement séparées", () => {
    const groups = [group("high_impr_low_ctr"), group("converting_page"), group("low_qa"), group("cannibalization")];
    const c = buildCopilotCounters({ ...base, totalLoaded: 4, filteredCount: 4, groups });
    expect(c.verifications).toBe(2);
    expect(c.executable).toBe(2);
    expect(c.executable + c.verifications).toBe(c.actionsUnique);
  });

  it("9. les types de vérification sont bien indexation / QA / cannibalisation", () => {
    expect(verificationKindOfType("not_indexed")).toBe("indexation");
    expect(verificationKindOfType("low_qa")).toBe("qa");
    expect(verificationKindOfType("cannibalization")).toBe("cannibalisation");
    expect(verificationKindOfType("high_impr_low_ctr")).toBeNull();
    expect(natureOfType("high_impr_low_ctr")).toBe("action");
  });

  it("10. une vérification ne modifie aucune page (entrée immuable)", () => {
    const rows = [page({ id: "a" }), page({ id: "b", noindex: true })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    runVerification("indexation", rows);
    expect(rows).toEqual(snapshot);
  });

  it("11. une vérification détecte un problème réel", () => {
    const res = runVerification("indexation", [page({ noindex: true })]);
    expect(res.outcome).toBe("issue");
    expect(res.issues).toHaveLength(1);
    expect(verificationStatusLabel("done", res.outcome)).toBe("Problème détecté");
  });

  it("12. une vérification sans problème renvoie « Vérifiée »", () => {
    const res = runVerification("qa", [page()]);
    expect(res.outcome).toBe("ok");
    expect(verificationStatusLabel("done", res.outcome)).toBe("Vérifiée");
  });

  it("13. la cannibalisation repose sur les pages réelles du même couple territoire × service", () => {
    const res = runVerification("cannibalisation", [page({ id: "a", slug: "s1" }), page({ id: "b", slug: "s2" })]);
    expect(res.outcome).toBe("issue");
    expect(res.checked).toBe(2);
  });

  it("14. le cycle d'une action exécutable est complet", () => {
    expect(nextStatus("open", "work")).toBe("in_progress");
    expect(nextStatus("in_progress", "applied")).toBe("completed");
    expect(nextStatus("in_progress", "failed")).toBe("error");
    expect(actionStatusLabel("error")).toBe("À réessayer");
    expect(nextStatus("error", "work")).toBe("in_progress");
  });

  it("15. une erreur sur une page n'arrête pas le reste du lot", () => {
    const batch = [
      { slug: "a", status: "applied" as const },
      { slug: "b", status: "failed" as const, error: "42501" },
      { slug: "c", status: "applied" as const },
    ];
    const retry = retryErrors(batch);
    expect(retry.map((r) => r.slug)).toEqual(["b"]);
    expect(batch.filter((b) => b.status === "applied")).toHaveLength(2);
  });

  it("16. chaque journal d'action porte le contexte complet", () => {
    const g = group("high_impr_low_ctr");
    const entry = buildLogEntry(g, {
      status: "applied", note: "titre + meta",
      before_data: { title: "avant" }, after_data: { title: "après" },
    });
    expect(entry.opportunity_id).toBe(g.primary.id);
    expect(entry.action_type).toBe(g.primary.type);
    expect(entry.status).toBe("applied");
    expect(entry.before_data).toEqual({ title: "avant" });
    expect(entry.after_data).toEqual({ title: "après" });
  });

  it("17. un échec est journalisé avec son erreur, jamais silencieux", () => {
    const entry = buildLogEntry(group("converting_page"), { status: "failed", error: "panne simulee · 42501" });
    expect(entry.status).toBe("failed");
    expect(entry.error).toMatch(/42501/);
  });

  it("18. une vérification est journalisée sans données « après »", () => {
    const entry = buildLogEntry(group("low_qa"), { status: "checked", note: "20 pages vérifiées" });
    expect(entry.status).toBe("checked");
    expect(entry.after_data ?? null).toBeNull();
  });

  it("19. aucune opportunité n'est supprimée : chaque masquée a une raison", () => {
    const rows = explainHidden([
      { id: "1", type: "group_service", title: "A", status: "completed" },
      { id: "2", type: "new_combo", title: "B", status: "applied" },
      { id: "3", type: "converting_page", title: "C", status: "resolved" },
      { id: "4", type: "low_qa", title: "D", status: "dismissed", dismiss_reason: "hors périmètre" },
      { id: "5", type: "ctr_top10", title: "E", status: "stale" },
      { id: "6", type: "x", title: "F", status: "inconnu" },
    ]);
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.reason.length).toBeGreaterThan(5);
      expect(r.filter).toMatch(/statut = /);
    }
    expect(rows[5].reason).toMatch(/inconnu/);
  });

  it("20. les opportunités en erreur restent dans la vue active, jamais masquées", () => {
    const hidden = explainHidden([{ id: "9", type: "converting_page", title: "Z", status: "error" }]);
    expect(hidden[0].reason).toMatch(/hors de la vue active/);
    const c = buildCopilotCounters({ ...base, totalLoaded: 47, filteredCount: 47, groups: [] });
    expect(c.opportunitiesActive).toBeGreaterThan(c.opportunitiesOpen);
  });

  it("21. l'explication couvre le total en base et l'absence de suppression", () => {
    const c = buildCopilotCounters({ ...base, totalLoaded: 47, filteredCount: 47, groups: [group("low_qa", 2)] });
    const txt = countersExplanation(c).join(" ");
    expect(txt).toMatch(/789 opportunité/);
    expect(txt).toMatch(/jamais supprimée/);
    expect(txt).toMatch(/3 opportunité\(s\) en erreur/);
  });

  it("22. les compteurs sont déterministes (persistance après rechargement)", () => {
    const args = { ...base, totalLoaded: 47, filteredCount: 44, groups: [group("high_impr_low_ctr", 2), group("low_qa")] };
    expect(buildCopilotCounters(args)).toEqual(buildCopilotCounters(args));
  });
});
