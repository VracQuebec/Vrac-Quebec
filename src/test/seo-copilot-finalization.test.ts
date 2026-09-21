import { describe, it, expect } from "vitest";
import {
  availableModes, MODE_LABEL, publishState, validatePublish,
  pageFingerprint, detectConcurrentChange, buildRestorePlan, canRestore,
  buildBatchPlan, applyBatchResult, batchProgress, retryErrors,
  nextStatus, natureOfType,
  type EditablePage,
} from "@/lib/seo/workflow";

const page = (over: Partial<EditablePage> = {}): EditablePage => ({
  id: "p1",
  slug: "excavation-quebec",
  url: "/excavation-quebec",
  title: "Excavation à Québec | Vrac Québec",
  meta_title: null,
  meta_description: "Excavation à Québec : demandez une soumission à Vrac Québec pour votre chantier rapidement.",
  city_slug: "quebec",
  service_slug: "excavation",
  status: "published",
  content_html: "<p>".concat("contenu réel ".repeat(40), "</p>"),
  internal_links: [],
  intro: "Intro",
  ...over,
});

describe("F. Publication", () => {
  it("expose la publication comme mode exécutable des actions", () => {
    expect(availableModes("high_impr_low_ctr")).toContain("publish");
    expect(MODE_LABEL.publish).toBe("Publication");
  });

  it("n'expose aucun mode pour une vérification", () => {
    expect(availableModes("not_indexed")).toEqual([]);
    expect(availableModes("cannibalization")).toEqual([]);
    expect(natureOfType("cannibalization")).toBe("verification");
  });

  it("indique clairement qu'une page est publiée", () => {
    const st = publishState({ status: "published" });
    expect(st.isPublished).toBe(true);
    expect(st.canPublish).toBe(false);
    expect(st.label).toContain("publiée");
  });

  it("indique clairement qu'une page est un brouillon", () => {
    const st = publishState({ status: "draft" });
    expect(st.isDraft).toBe(true);
    expect(st.canPublish).toBe(true);
    expect(st.label).toContain("Brouillon");
  });

  it("refuse la publication sans titre, sans meta ou sans contenu", () => {
    expect(validatePublish(page({ status: "draft", title: "" }))[0].message).toContain("titre");
    expect(validatePublish(page({ status: "draft", meta_description: "" }))[0].message).toContain("meta");
    expect(validatePublish(page({ status: "draft", content_html: "<p>court</p>" }))[0].message).toContain("contenu");
  });

  it("autorise la publication d'un brouillon complet", () => {
    expect(validatePublish(page({ status: "draft" }))).toEqual([]);
  });
});

describe("16. Modifications concurrentes", () => {
  it("l'empreinte est stable pour un état identique", () => {
    expect(pageFingerprint(page())).toBe(pageFingerprint(page()));
  });

  it("l'empreinte change quand un champ opérationnel change", () => {
    expect(pageFingerprint(page())).not.toBe(pageFingerprint(page({ title: "Autre titre" })));
  });

  it("l'empreinte ignore les colonnes analytiques", () => {
    expect(pageFingerprint(page({ qa_last_score: 10 }))).toBe(pageFingerprint(page({ qa_last_score: 99 })));
  });

  it("aucun conflit quand la page est inchangée", () => {
    expect(detectConcurrentChange(page(), page())).toBeNull();
  });

  it("bloque l'écriture quand la page a changé entre-temps", () => {
    const msg = detectConcurrentChange(page(), page({ content_html: "<p>réécrit</p>" }));
    expect(msg).toContain("Modification concurrente");
    expect(msg).toContain("content_html");
  });

  it("bloque l'écriture quand la page n'existe plus", () => {
    expect(detectConcurrentChange(page(), null)).toContain("n'existe plus");
  });

  it("bloque l'écriture sans état de référence", () => {
    expect(detectConcurrentChange(null, page())).toContain("référence");
  });
});

describe("8. Restauration", () => {
  it("restaure titre et meta à partir du journal", () => {
    const plan = buildRestorePlan({ title: "Ancien", meta_description: "Ancienne meta" }, "excavation-quebec");
    expect(plan?.update).toMatchObject({ title: "Ancien", meta_description: "Ancienne meta" });
    expect(plan?.summary).toContain("/excavation-quebec");
  });

  it("restaure le contenu et recalcule le nombre de mots", () => {
    const plan = buildRestorePlan({ content_html: "<p>un deux trois</p>" });
    expect(plan?.update.content_html).toBe("<p>un deux trois</p>");
    expect(plan?.update.word_count).toBe(3);
  });

  it("restaure les liens internes et leur compte", () => {
    const plan = buildRestorePlan({ internal_links: [{ label: "A", href: "/a" }] });
    expect(plan?.update.internal_link_count).toBe(1);
  });

  it("restaure le statut de publication", () => {
    const plan = buildRestorePlan({ status: "draft" });
    expect(plan?.update.status).toBe("draft");
  });

  it("n'invente rien quand l'historique ne contient pas de valeur restaurable", () => {
    expect(buildRestorePlan({})).toBeNull();
    expect(buildRestorePlan(null)).toBeNull();
    expect(buildRestorePlan({ cta: { text: "x", href: "#soumission" } })).toBeNull();
  });

  it("la restauration n'est proposée que pour une action appliquée sur une page", () => {
    expect(canRestore({ status: "applied", page_id: "p1", before_data: { title: "Ancien" } })).toBe(true);
    expect(canRestore({ status: "failed", page_id: "p1", before_data: { title: "Ancien" } })).toBe(false);
    expect(canRestore({ status: "applied", page_id: null, before_data: { title: "Ancien" } })).toBe(false);
    expect(canRestore({ status: "applied", page_id: "p1", before_data: {} })).toBe(false);
  });
});

describe("Lot, erreurs et cycle de statut", () => {
  it("une erreur au milieu du lot n'arrête pas les autres pages", () => {
    let items = buildBatchPlan(["a", "b", "c"], ["a", "b", "c"]);
    items = applyBatchResult(items, "a", true);
    items = applyBatchResult(items, "b", false, "panne");
    items = applyBatchResult(items, "c", true);
    const p = batchProgress(items);
    expect(p).toMatchObject({ done: 2, errors: 1, total: 3, finished: true });
  });

  it("le réessai ne relance que les pages en erreur", () => {
    let items = buildBatchPlan(["a", "b"], ["a", "b"]);
    items = applyBatchResult(items, "a", true);
    items = applyBatchResult(items, "b", false, "panne");
    const retried = retryErrors(items);
    expect(retried.find((i) => i.page_id === "a")?.status).toBe("done");
    expect(retried.find((i) => i.page_id === "b")?.status).toBe("pending");
  });

  it("le cycle complet passe par En cours puis Terminée", () => {
    expect(nextStatus("open", "work")).toBe("in_progress");
    expect(nextStatus("in_progress", "applied")).toBe("completed");
    expect(nextStatus("in_progress", "failed")).toBe("error");
    expect(nextStatus("error", "work")).toBe("in_progress");
  });
});
