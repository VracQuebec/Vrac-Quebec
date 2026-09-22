import { describe, expect, it } from "vitest";
import { buildOptimizationPreview, computeStrategicCounters, type CounterPage } from "@/lib/seo/strategicCounters";

const LONG = `<p>${"Beaumont gravier livraison de matériaux en vrac pour chantier. ".repeat(40)}</p><a href="/soumission">Demander une soumission</a>`;

function page(over: Partial<CounterPage> = {}): CounterPage {
  return {
    slug: "gravier-beaumont",
    city_slug: "beaumont",
    material_slug: "gravier",
    status: "published",
    title: "Gravier à Beaumont",
    h1: "Gravier à Beaumont",
    meta_title: "Gravier à Beaumont | Vrac Québec fournisseur",
    meta_description: "Gravier livré à Beaumont pour vos chantiers résidentiels et commerciaux. Obtenez une soumission rapide adaptée à votre projet et à vos accès.",
    content_html: LONG,
    word_count: 600,
    internal_link_count: 5,
    internal_links: [],
    noindex: false,
    last_generated_at: new Date().toISOString(),
    ...over,
  };
}

describe("compteurs stratégiques", () => {
  it("analyse toutes les pages publiées et n'en déclare aucune en erreur quand tout est conforme", () => {
    const c = computeStrategicCounters([
      page(),
      page({ slug: "sable-beaumont", material_slug: "sable", meta_title: "Sable à Beaumont | Vrac Québec fournisseur" }),
    ]);
    expect(c.analyzed).toBe(2);
    expect(c.errors.total).toBe(0);
  });

  it("classe moins de 2 liens en erreur réelle", () => {
    const c = computeStrategicCounters([page({ internal_link_count: 1 })]);
    expect(c.errors.links).toHaveLength(1);
    expect(c.optimizations.links).toHaveLength(0);
  });

  it("classe 2 à 4 liens en optimisation, jamais en erreur", () => {
    const c = computeStrategicCounters([page({ internal_link_count: 2 }), page({ slug: "s2", internal_link_count: 4 })]);
    expect(c.errors.links).toHaveLength(0);
    expect(c.optimizations.links).toHaveLength(2);
    expect(c.optimizations.linksDeficit).toBe(4);
  });

  it("ne compte pas 5 liens ou plus", () => {
    const c = computeStrategicCounters([page({ internal_link_count: 6 })]);
    expect(c.optimizations.links).toHaveLength(0);
  });

  it("l'âge est une optimisation, jamais une erreur", () => {
    const old = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const c = computeStrategicCounters([page({ last_generated_at: old })]);
    expect(c.optimizations.stale).toHaveLength(1);
    expect(c.errors.total).toBe(0);
  });

  it("recalcule le score QA sans utiliser l'ancien score enregistré", () => {
    const c = computeStrategicCounters([page({ qa_last_score: 40 })]);
    expect(c.optimizations.qa).toHaveLength(0);
    expect(c.qaAverage).toBeGreaterThanOrEqual(80);
  });

  it("signale une page publiée marquée noindex comme erreur technique", () => {
    const c = computeStrategicCounters([page({ noindex: true })]);
    expect(c.errors.technical).toHaveLength(1);
  });

  it("signale une non-indexation confirmée", () => {
    const c = computeStrategicCounters([page({ google_index_status: "crawled_not_indexed" })]);
    expect(c.errors.indexation).toHaveLength(1);
  });

  it("ignore les brouillons dans l'analyse des pages publiées", () => {
    const c = computeStrategicCounters([page({ status: "draft", internal_link_count: 0 })]);
    expect(c.analyzed).toBe(0);
    expect(c.errors.total).toBe(0);
  });

  it("les articles à publier proviennent des vrais brouillons", () => {
    expect(computeStrategicCounters([page()], { blogToPublish: 0 }).blogToPublish).toBe(0);
    expect(computeStrategicCounters([page()], { blogToPublish: 3 }).blogToPublish).toBe(3);
  });

  it("l'aperçu liste pages, URLs et type de modification", () => {
    const old = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const c = computeStrategicCounters([page({ last_generated_at: old, internal_link_count: 3 })]);
    const p = buildOptimizationPreview(c);
    expect(p.pages).toBe(1);
    expect(p.urls).toEqual(["/gravier-beaumont"]);
    expect(p.kinds.length).toBeGreaterThanOrEqual(2);
    expect(p.kinds[0].target).toContain("Contenu");
  });

  it("aucune optimisation identifiée → aperçu vide", () => {
    const p = buildOptimizationPreview(computeStrategicCounters([page()]));
    expect(p.pages).toBe(0);
    expect(p.kinds).toHaveLength(0);
  });
});
