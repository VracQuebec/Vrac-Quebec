import { describe, it, expect } from "vitest";
import {
  classifyDraft, draftReason, summarizeDrafts, draftSentence,
  cityAuditStatus, cityCompletion, summarizeCityAudit,
  DRAFT_CLASS_LABEL, CITY_AUDIT_LABEL,
  type DraftPage, type CityCounts,
} from "@/lib/seo/draftAudit";

const NOW = Date.parse("2026-09-22T12:00:00Z");

function draft(over: Partial<DraftPage> = {}): DraftPage {
  return {
    slug: "sable-quebec", city_slug: "quebec", material_slug: "sable", service_slug: null,
    title: "Sable à Québec", status: "draft",
    meta_title: "Sable à Québec — livraison en vrac rapide",
    meta_description: "Livraison de sable en vrac à Québec.",
    internal_link_count: 8, word_count: 900,
    qa_last_score: 85, qa_last_checked_at: "2026-09-20T00:00:00Z", qa_blockers: [],
    proc_status: "idle", proc_error: null, priority_locked: false,
    last_generated_at: "2026-09-18T00:00:00Z",
    ...over,
  };
}

describe("classification des brouillons", () => {
  it("brouillon sain = prêt à publier", () => {
    expect(classifyDraft(draft(), NOW)).toBe("ready");
  });
  it("bloqueur QA = erreur", () => {
    expect(classifyDraft(draft({ qa_blockers: ["Meta title (29 car.)"] }), NOW)).toBe("error");
  });
  it("proc_status error = erreur", () => {
    expect(classifyDraft(draft({ proc_status: "error" }), NOW)).toBe("error");
  });
  it("message d'erreur de traitement = erreur", () => {
    expect(classifyDraft(draft({ proc_error: "timeout" }), NOW)).toBe("error");
  });
  it("titre trop court = incomplet", () => {
    expect(classifyDraft(draft({ meta_title: "Sable Québec" }), NOW)).toBe("incomplete");
  });
  it("meta description absente = incomplet", () => {
    expect(classifyDraft(draft({ meta_description: "  " }), NOW)).toBe("incomplete");
  });
  it("liens internes insuffisants = incomplet", () => {
    expect(classifyDraft(draft({ internal_link_count: 1 }), NOW)).toBe("incomplete");
  });
  it("contenu trop court = incomplet", () => {
    expect(classifyDraft(draft({ word_count: 120 }), NOW)).toBe("incomplete");
  });
  it("jamais vérifiée = à vérifier", () => {
    expect(classifyDraft(draft({ qa_last_checked_at: null, qa_last_score: null }), NOW)).toBe("check");
  });
  it("score QA faible = à vérifier", () => {
    expect(classifyDraft(draft({ qa_last_score: 67 }), NOW)).toBe("check");
  });
  it("priorité verrouillée = conservée volontairement", () => {
    expect(classifyDraft(draft({ priority_locked: true }), NOW)).toBe("held");
  });
  it("génération trop ancienne = ancienne logique", () => {
    expect(classifyDraft(draft({ last_generated_at: "2026-05-01T00:00:00Z" }), NOW)).toBe("legacy");
  });
  it("l'erreur prime sur l'incomplétude", () => {
    expect(classifyDraft(draft({ qa_blockers: ["x"], meta_title: "court" }), NOW)).toBe("error");
  });
});

describe("raisons lisibles", () => {
  it("indique la longueur réelle du titre", () => {
    expect(draftReason(draft({ meta_title: "Sable Québec" }), NOW)).toContain("12 car.");
  });
  it("indique le score réel", () => {
    expect(draftReason(draft({ qa_last_score: 67 }), NOW)).toContain("67/100");
  });
  it("aucun blocage pour une page prête", () => {
    expect(draftReason(draft(), NOW)).toContain("Aucun blocage");
  });
  it("reprend le bloqueur QA réel", () => {
    expect(draftReason(draft({ qa_blockers: ["Meta title (29 car.)"] }), NOW)).toContain("Meta title (29 car.)");
  });
});

describe("résumé des brouillons", () => {
  const pages = [
    draft(), draft({ slug: "a" }),
    draft({ slug: "b", qa_blockers: ["bloc"] }),
    draft({ slug: "c", qa_last_checked_at: null, qa_last_score: null }),
    draft({ slug: "d", status: "published" }),
  ];
  it("ignore les pages publiées", () => {
    expect(summarizeDrafts(pages, NOW).total).toBe(4);
  });
  it("compte chaque catégorie", () => {
    const s = summarizeDrafts(pages, NOW);
    expect([s.ready, s.error, s.check]).toEqual([2, 1, 1]);
  });
  it("la somme des catégories égale le total", () => {
    const s = summarizeDrafts(pages, NOW);
    expect(s.ready + s.error + s.incomplete + s.check + s.held + s.legacy).toBe(s.total);
  });
  it("phrase de résumé chiffrée", () => {
    expect(draftSentence(summarizeDrafts(pages, NOW))).toContain("Les 4 brouillons représentent 2 page(s) prête(s) à publier");
  });
  it("libellés disponibles pour chaque classe", () => {
    expect(Object.keys(DRAFT_CLASS_LABEL)).toHaveLength(6);
  });
});

describe("audit par municipalité", () => {
  const city = (o: Partial<CityCounts> = {}): CityCounts => ({
    slug: "quebec", name: "Québec", planned: 10, generated: 10, published: 10,
    drafts: 0, errors: 0, remaining: 0, ...o,
  });
  it("tout publié = COMPLET", () => expect(cityAuditStatus(city())).toBe("complete"));
  it("brouillons restants = À PUBLIER", () =>
    expect(cityAuditStatus(city({ published: 6, drafts: 4 }))).toBe("to_publish"));
  it("erreurs = AVEC ERREUR", () =>
    expect(cityAuditStatus(city({ errors: 2, published: 8, drafts: 2 }))).toBe("error"));
  it("combinaisons manquantes = INCOMPLET", () =>
    expect(cityAuditStatus(city({ generated: 7, published: 7, remaining: 3 }))).toBe("incomplete"));

  it("chiffres incohérents = À VÉRIFIER", () =>
    expect(cityAuditStatus(city({ generated: 10, published: 4, drafts: 4 }))).toBe("check"));
  it("pourcentage de complétion", () =>
    expect(cityCompletion(city({ planned: 8, generated: 6, published: 6, drafts: 0, remaining: 2 }))).toBe(75));
  it("pourcentage nul sans combinaison prévue", () =>
    expect(cityCompletion(city({ planned: 0, generated: 0, published: 0 }))).toBe(0));
  it("résumé par statut", () => {
    const s = summarizeCityAudit([city(), city({ slug: "b", published: 5, drafts: 5 }), city({ slug: "c", errors: 1, published: 9, drafts: 1 })]);
    expect([s.total, s.complete, s.to_publish, s.error]).toEqual([3, 1, 1, 1]);
  });
  it("libellés francophones", () => expect(CITY_AUDIT_LABEL.to_publish).toBe("À PUBLIER"));
});
