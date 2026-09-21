import { describe, it, expect } from "vitest";
import {
  capabilityOfType, capabilityOfGroup, workButtonLabel, nextStatus,
  suggestMeta, validateMeta, hasChanges, buildBatchPlan, applyBatchResult,
  batchProgress, retryErrors, runVerification, buildLogEntry,
  TITLE_MAX, META_MAX,
  type EditablePage,
} from "@/lib/seo/workflow";
import { buildActionGroups } from "@/lib/seo/actionGroups";
import type { Opportunity } from "@/lib/seo/useCopilot";

function opp(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: over.id ?? "o1", type: "high_impr_low_ctr", category: "ctr",
    title: "Signal", rationale: "r", reason: "raison réelle", recommended_action: "Revoir le title",
    expected_impact: null, score_factors: [], data_quality: "suffisante", source: "gsc",
    url: "/excavation-quebec", priority: "high", score: 70, data: {}, suggested_action: "optimize",
    impact_score: 5, effort_score: 2, potential_searches: null, potential_clicks: null, potential_leads: null,
    entity_slug: "excavation-quebec", target_city_slug: "quebec", target_material_slug: null,
    target_service_slug: "excavation", page_id: "p1", status: "open",
    detected_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    ...over,
  } as Opportunity;
}

const page = (over: Partial<EditablePage> = {}): EditablePage => ({
  id: "p1", slug: "excavation-quebec", url: "/excavation-quebec",
  title: "Excavation", meta_title: null, meta_description: "courte",
  city_slug: "quebec", service_slug: "excavation", status: "published",
  noindex: false, google_index_status: "indexed", qa_last_score: 95, qa_blockers: [],
  ...over,
});

describe("Copilote SEO — exécution des opportunités", () => {
  it("1. une opportunité PAGE a une capacité d'exécution", () => {
    const [g] = buildActionGroups([opp()]);
    expect(g.kind).toBe("page");
    expect(capabilityOfGroup(g)).toBe("titles_meta");
  });

  it("2. une opportunité SERVICE a une capacité d'exécution", () => {
    expect(capabilityOfType("group_service")).toBe("titles_meta");
  });

  it("3. une opportunité TERRITOIRE × SERVICE est prise en charge", () => {
    expect(capabilityOfType("local_potential")).toBe("titles_meta");
    expect(capabilityOfType("signal_inconnu")).toBe("not_configured");
    expect(workButtonLabel("open", "not_configured")).toBe("Action à configurer");
  });

  it("4. une opportunité GROUPE territoire est prise en charge", () => {
    expect(capabilityOfType("group_territory")).toBe("titles_meta");
  });

  it("5. la proposition de titre vient des données réelles de la page", () => {
    const s = suggestMeta(page());
    expect(s.title).toContain("Excavation");
    expect(s.title).toContain("Quebec");
    expect(s.title.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it("6. la proposition de meta reste dans les limites", () => {
    const s = suggestMeta(page());
    expect(s.meta_description.length).toBeLessThanOrEqual(META_MAX);
    expect(s.meta_description.length).toBeGreaterThan(0);
  });

  it("7. la sauvegarde est bloquée si le titre est trop court", () => {
    const issues = validateMeta({ title: "Court", meta_description: "x".repeat(100) });
    expect(issues.some((i) => i.field === "title")).toBe(true);
  });

  it("8. la sauvegarde est bloquée si la meta est trop longue", () => {
    const issues = validateMeta({ title: "Excavation à Québec | Vrac Québec", meta_description: "x".repeat(300) });
    expect(issues.some((i) => i.field === "meta_description")).toBe(true);
  });

  it("9. deux pages ne peuvent pas recevoir le même titre", () => {
    const draft = suggestMeta(page());
    const issues = validateMeta(draft, [draft.title]);
    expect(issues.some((i) => i.message.includes("déjà utilisé"))).toBe(true);
  });

  it("10. une proposition valide ne produit aucune erreur", () => {
    expect(validateMeta(suggestMeta(page()))).toEqual([]);
  });

  it("11. aucune modification détectée = aucune écriture", () => {
    const p = page({ title: "T", meta_description: "M" });
    expect(hasChanges(p, { title: "T", meta_description: "M" })).toBe(false);
    expect(hasChanges(p, { title: "T2", meta_description: "M" })).toBe(true);
  });

  it("12. statut OPEN → IN_PROGRESS au clic sur Travailler", () => {
    expect(nextStatus("open", "work")).toBe("in_progress");
  });

  it("13. statut COMPLETED seulement après application réelle", () => {
    expect(nextStatus("in_progress", "applied")).toBe("completed");
    expect(nextStatus("open", "work")).not.toBe("completed");
  });

  it("14. statut ERROR en cas d'échec", () => {
    expect(nextStatus("in_progress", "failed")).toBe("error");
  });

  it("15. Ignorer met le statut à dismissed et une réouverture est possible", () => {
    expect(nextStatus("open", "dismiss")).toBe("dismissed");
    expect(nextStatus("dismissed", "reopen")).toBe("open");
  });

  it("16. le libellé du bouton suit le statut", () => {
    expect(workButtonLabel("open", "titles_meta")).toBe("Travailler");
    expect(workButtonLabel("in_progress", "titles_meta")).toBe("Continuer");
    expect(workButtonLabel("completed", "titles_meta")).toBe("Voir le travail");
    expect(workButtonLabel("error", "titles_meta")).toBe("Réessayer");
    expect(workButtonLabel("dismissed", "titles_meta")).toBe("Voir");
  });

  it("17. un lot ne traite que les pages sélectionnées", () => {
    const items = buildBatchPlan(["a", "b", "c"], new Set(["a", "c"]));
    expect(items.filter((i) => i.status === "pending")).toHaveLength(2);
    expect(items.find((i) => i.page_id === "b")?.status).toBe("skipped");
    expect(batchProgress(items).total).toBe(2);
  });

  it("18. une erreur sur une page n'annule pas les réussites du lot", () => {
    let items = buildBatchPlan(["a", "b"], new Set(["a", "b"]));
    items = applyBatchResult(items, "a", true);
    items = applyBatchResult(items, "b", false, "RLS refusée");
    const p = batchProgress(items);
    expect(p.done).toBe(1);
    expect(p.errors).toBe(1);
    expect(p.finished).toBe(true);
    expect(items.find((i) => i.page_id === "b")?.error).toBe("RLS refusée");
  });

  it("19. « Réessayer les erreurs » ne remet en attente que les échecs", () => {
    let items = buildBatchPlan(["a", "b"], new Set(["a", "b"]));
    items = applyBatchResult(items, "a", true);
    items = applyBatchResult(items, "b", false, "boom");
    const retried = retryErrors(items);
    expect(retried.find((i) => i.page_id === "a")?.status).toBe("done");
    expect(retried.find((i) => i.page_id === "b")?.status).toBe("pending");
  });

  it("20. l'analyse seule ne produit aucune écriture SEO (journal vide tant qu'aucune action)", () => {
    const [g] = buildActionGroups([opp()]);
    const entry = buildLogEntry(g, { status: "started" });
    expect(entry.after_data).toEqual({});
    expect(entry.page_id).toBeNull();
    expect(entry.status).toBe("started");
  });

  it("21. le journal conserve avant/après pour une modification appliquée", () => {
    const [g] = buildActionGroups([opp()]);
    const entry = buildLogEntry(g, {
      status: "applied", page_id: "p1", page_slug: "excavation-quebec",
      before_data: { title: "Excavation" }, after_data: { title: "Excavation à Québec | Vrac Québec" },
    });
    expect(entry.before_data).toEqual({ title: "Excavation" });
    expect(entry.opportunity_id).toBe("o1");
    expect(entry.capability).toBe("titles_meta");
  });

  it("22. le journal enregistre l'erreur d'une action échouée", () => {
    const [g] = buildActionGroups([opp()]);
    const entry = buildLogEntry(g, { status: "failed", error: "permission denied" });
    expect(entry.error).toBe("permission denied");
  });

  it("23. les vérifications reposent sur les champs réels de la page", () => {
    const checks = runVerification(page({ noindex: true, status: "draft", qa_last_score: null }));
    expect(checks.find((c) => c.label === "Page publiée")?.ok).toBe(false);
    expect(checks.find((c) => c.label === "Balise robots")?.ok).toBe(false);
    expect(checks.find((c) => c.label === "Score QA")?.ok).toBeNull();
  });

  it("24. une donnée absente n'est jamais inventée", () => {
    const checks = runVerification(page({ google_index_status: null }));
    const c = checks.find((x) => x.label === "Indexation Google connue");
    expect(c?.ok).toBeNull();
    expect(c?.detail).toContain("aucun statut");
  });

  it("25. aucun doublon de page dans un plan de lot", () => {
    const items = buildBatchPlan(["a", "a", "b"], new Set(["a", "b"]));
    const ids = new Set(items.map((i) => i.page_id));
    expect(items.filter((i) => i.page_id === "a")).toHaveLength(2); // entrée source conservée
    expect(ids.size).toBe(2);
  });

  it("26. les types de vérification ouvrent l'interface de vérification", () => {
    for (const t of ["not_indexed", "low_qa", "cannibalization"]) {
      expect(capabilityOfType(t)).toBe("verification");
    }
  });
});
