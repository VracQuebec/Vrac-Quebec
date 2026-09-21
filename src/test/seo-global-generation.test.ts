import { describe, expect, it } from "vitest";
import {
  EMPTY_PREVIEW, canStartGlobal, cityStatus, confirmationLines, failureNotice,
  finalSummary, globalPhase, normalizePreview, runProgress, shouldOfferRetry,
  type GlobalRun, type MissingPreview,
} from "@/lib/seo/globalGeneration";

const preview = (over: Partial<MissingPreview> = {}): MissingPreview => ({
  ...EMPTY_PREVIEW,
  cities_total: 162, cities_with_missing: 162, remaining: 432,
  generated: 917, published: 837, drafts: 80, errors: 3,
  ...over,
});

const run = (over: Partial<NonNullable<GlobalRun>> = {}): GlobalRun => ({
  id: "run-1", status: "running", total_pages: 432, done_pages: 127,
  succeeded_pages: 125, failed_pages: 2, current_city_slug: "quebec", ...over,
});

describe("Générateur SEO — génération globale", () => {
  it("1. lancement possible avec plusieurs villes restantes", () => {
    expect(canStartGlobal(preview(), null).allowed).toBe(true);
  });

  it("2. aucun lancement s'il ne reste aucune page pertinente", () => {
    const r = canStartGlobal(preview({ remaining: 0 }), null);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("Aucune page pertinente à générer.");
  });

  it("3. double lancement bloqué tant qu'un run est actif", () => {
    for (const status of ["queued", "running", "paused"]) {
      expect(canStartGlobal(preview(), run({ status })).allowed).toBe(false);
    }
  });

  it("4. un run terminé n'empêche pas un nouveau lancement", () => {
    expect(canStartGlobal(preview(), run({ status: "completed" })).allowed).toBe(true);
  });

  it("5. la confirmation reprend exactement les chiffres réels", () => {
    const lines = confirmationLines(preview()).join("\n");
    expect(lines).toContain("432 page(s) pertinente(s) restent à générer dans 162 ville(s)");
    expect(lines).toContain("917 page(s) sont déjà générées");
    expect(lines).toContain("837 sont publiées");
    expect(lines).toContain("80 sont en brouillon");
    expect(lines).toContain("3 sont en erreur");
  });

  it("6. la confirmation promet explicitement l'absence de publication automatique", () => {
    const lines = confirmationLines(preview());
    expect(lines).toContain("Les pages existantes ne seront pas recréées.");
    expect(lines.some((l) => l.includes("ne seront pas publiées automatiquement"))).toBe(true);
  });

  it("7. phases : en cours, pause, interrompue, terminée, inactive", () => {
    expect(globalPhase(null)).toBe("idle");
    expect(globalPhase(run({ status: "queued" }))).toBe("running");
    expect(globalPhase(run({ status: "paused" }))).toBe("paused");
    expect(globalPhase(run({ status: "stopped" }))).toBe("interrupted");
    expect(globalPhase(run({ status: "completed" }))).toBe("completed");
  });

  it("8. progression réelle avec pourcentage et restantes", () => {
    const p = runProgress(run());
    expect(p).toMatchObject({ done: 127, total: 432, pct: 29, succeeded: 125, failed: 2, remaining: 305 });
  });

  it("9. progression sans run : tout à zéro, aucun pourcentage inventé", () => {
    expect(runProgress(null)).toMatchObject({ done: 0, total: 0, pct: 0, remaining: 0 });
  });

  it("10. une erreur n'arrête pas la progression : succès et erreurs coexistent", () => {
    const p = runProgress(run({ done_pages: 200, succeeded_pages: 190, failed_pages: 10 }));
    expect(p.succeeded).toBe(190);
    expect(p.failed).toBe(10);
    expect(p.remaining).toBe(232);
  });

  it("11. le résumé final protège les pages existantes et publiées", () => {
    const before = preview();
    const after = preview({ generated: 1347, remaining: 2, drafts: 510 });
    const lines = finalSummary(before, after, run({ status: "completed", done_pages: 432, succeeded_pages: 430, failed_pages: 2 }));
    expect(lines).toContain("Pages générées : 430");
    expect(lines).toContain("Pages déjà existantes ignorées : 917");
    expect(lines).toContain("Pages déjà publiées protégées : 837");
    expect(lines).toContain("Pages en brouillon conservées : 80");
    expect(lines).toContain("Pages en erreur : 2");
    expect(lines).toContain("Pages restantes : 2");
  });

  it("12. avis d'échec affiché uniquement s'il y a des erreurs", () => {
    expect(failureNotice(run({ failed_pages: 0 }))).toBeNull();
    expect(failureNotice(run({ failed_pages: 5 }))).toContain("5 page(s) n'ont pas pu être générées.");
  });

  it("13. « Régénérer les erreurs » proposé sur erreur de run ou d'état", () => {
    expect(shouldOfferRetry(run({ failed_pages: 0 }), preview({ errors: 0 }))).toBe(false);
    expect(shouldOfferRetry(run({ failed_pages: 2 }), preview({ errors: 0 }))).toBe(true);
    expect(shouldOfferRetry(null, preview({ errors: 3 }))).toBe(true);
  });

  it("14. statuts de ville : terminée, partielle, avec erreurs, en attente, en cours", () => {
    expect(cityStatus({ generated: 28, planned: 28, errors: 0, remaining: 0 }, false)).toBe("done");
    expect(cityStatus({ generated: 18, planned: 28, errors: 0, remaining: 10 }, false)).toBe("partial");
    expect(cityStatus({ generated: 26, planned: 28, errors: 2, remaining: 2 }, false)).toBe("errors");
    expect(cityStatus({ generated: 0, planned: 28, errors: 0, remaining: 28 }, false)).toBe("waiting");
    expect(cityStatus({ generated: 0, planned: 28, errors: 0, remaining: 28 }, true)).toBe("running");
  });

  it("15. les chiffres de la base sont repris sans approximation", () => {
    const p = normalizePreview({
      cities_total: "162", cities_with_missing: 40, remaining: "432", pending: 0,
      generated: 917, published: 837, drafts: 80, errors: 3, active_run_id: "abc",
    });
    expect(p.cities_total).toBe(162);
    expect(p.remaining).toBe(432);
    expect(p.active_run_id).toBe("abc");
  });

  it("16. une réponse incomplète ne produit jamais NaN", () => {
    const p = normalizePreview({ remaining: null });
    expect(p.remaining).toBe(0);
    expect(p.generated).toBe(0);
    expect(p.active_run_id).toBeNull();
  });

  it("17. la progression ne dépasse jamais 100 %", () => {
    expect(runProgress(run({ total_pages: 10, done_pages: 50 })).pct).toBe(100);
  });
});
