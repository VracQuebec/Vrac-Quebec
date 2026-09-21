import { describe, it, expect } from "vitest";
import {
  availableModes, MODE_LABEL,
  buildContentProposal, validateContent, contentDiffSummary, contentWordCount,
  suggestCta, validateCta, ctaDestinations, extractCta, upsertCtaBlock, buildCtaHtml,
  suggestInternalLinks, mergeInternalLinks, validateInternalLinks, currentInternalLinks,
  buildBatchPlan, applyBatchResult, batchProgress, retryErrors,
  type EditablePage, type LinkCandidate,
} from "@/lib/seo/workflow";

const page = (over: Partial<EditablePage> = {}): EditablePage => ({
  id: "p1",
  slug: "excavation-levis",
  url: "/excavation-levis",
  title: "Excavation à Lévis",
  meta_title: null,
  meta_description: "Une meta existante",
  city_slug: "levis",
  service_slug: "excavation",
  status: "published",
  noindex: false,
  google_index_status: "indexed",
  qa_last_score: 92,
  qa_blockers: [],
  intro: "Intro existante",
  word_count: 400,
  internal_links: [],
  content_html: "<p>Contenu existant sur le chantier.</p>",
  ...over,
});

describe("modes d'exécution", () => {
  it("expose le contenu comme mode par défaut d'un signal de position", () => {
    expect(availableModes("position_gain")[0]).toBe("content");
  });
  it("expose le CTA comme mode par défaut d'une page qui convertit", () => {
    expect(availableModes("converting_page")[0]).toBe("cta");
  });
  it("expose les modes d'écriture pour un signal territoire × service", () => {
    expect(availableModes("local_potential").sort()).toEqual(["content", "cta", "internal_links", "publish", "titles_meta"]);
  });
  it("n'expose aucun mode d'écriture pour un signal de vérification", () => {
    expect(availableModes("not_indexed")).toEqual([]);
    expect(availableModes("cannibalization")).toEqual([]);
  });
  it("nomme chaque mode en français", () => {
    expect(MODE_LABEL.internal_links).toContain("maillage");
  });
});

describe("1. renforcer le contenu", () => {
  it("conserve toujours le contenu existant et ajoute des sections", () => {
    const p = page();
    const { draft, additions } = buildContentProposal(p);
    expect(additions.length).toBeGreaterThan(0);
    expect(draft.content_html.startsWith(p.content_html!)).toBe(true);
    expect(contentWordCount(draft.content_html)).toBeGreaterThan(contentWordCount(p.content_html!));
  });
  it("n'invente aucun service ni territoire absent de la page", () => {
    const { draft } = buildContentProposal(page({ city_slug: null, service_slug: null, title: null, slug: "page-test" }));
    expect(draft.content_html).not.toContain("Levis");
    expect(draft.content_html).not.toContain("Excavation");
  });
  it("ne duplique pas une section déjà présente", () => {
    const p = page({ content_html: "<h2>Comment ça fonctionne</h2><p>x</p>" });
    const { additions, notes } = buildContentProposal(p);
    expect(additions.join(" ")).not.toContain("comment ça fonctionne</h2>");
    expect(notes.join(" ")).toContain("existe déjà");
  });
  it("refuse un contenu vidé", () => {
    const before = { intro: "i", content_html: "<p>abc</p>" };
    expect(validateContent(before, { intro: "i", content_html: "   " })[0].message).toContain("vidé");
  });
  it("alerte si la proposition supprime une grande partie du contenu", () => {
    const before = { intro: "", content_html: "<p>" + "mot ".repeat(200) + "</p>" };
    expect(validateContent(before, { intro: "", content_html: "<p>court</p>" }).length).toBe(1);
  });
  it("résume l'écart avant/après", () => {
    const before = { intro: "a", content_html: "<p>un deux</p>" };
    const after = { intro: "b", content_html: "<p>un deux trois</p>" };
    const d = contentDiffSummary(before, after);
    expect(d.addedWords).toBe(1);
    expect(d.introChanged).toBe(true);
  });
});

describe("2. renforcer le CTA", () => {
  it("propose un CTA basé sur le service et le territoire réels", () => {
    const cta = suggestCta(page());
    expect(cta.text).toContain("Levis");
    expect(cta.href).toBe("#soumission");
  });
  it("n'accepte que des destinations réellement disponibles", () => {
    expect(validateCta({ text: "Demander", href: "/parcours-invente" }, page())[0].message).toContain("non disponible");
    expect(validateCta({ text: "Demander une soumission", href: "/soumission" }, page())).toEqual([]);
  });
  it("propose la zone desservie seulement si la ville existe", () => {
    expect(ctaDestinations({ city_slug: "levis" }).some((d) => d.href === "/livraison/levis")).toBe(true);
    expect(ctaDestinations({ city_slug: null }).some((d) => d.href.startsWith("/livraison/"))).toBe(false);
  });
  it("refuse un CTA sans texte", () => {
    expect(validateCta({ text: "  ", href: "/soumission" }, page())[0]).toBeTruthy();
  });
  it("insère puis remplace le bloc CTA sans détruire le contenu", () => {
    const html = "<p>Contenu</p>";
    const once = upsertCtaBlock(html, { text: "A", href: "/soumission" });
    expect(once).toContain("<p>Contenu</p>");
    const twice = upsertCtaBlock(once, { text: "B", href: "/calculateur" });
    expect(twice.match(/copilot:cta/g)?.length).toBe(2);
    expect(extractCta(twice)).toEqual({ text: "B", href: "/calculateur" });
  });
  it("ne trouve aucun CTA dans une page qui n'en a pas", () => {
    expect(extractCta("<p>rien</p>")).toBeNull();
    expect(buildCtaHtml({ text: "X", href: "/soumission" })).toContain('href="/soumission"');
  });
});

describe("3. renforcer le maillage interne", () => {
  const candidates: LinkCandidate[] = [
    { slug: "excavation-levis", title: "Excavation à Lévis", city_slug: "levis", service_slug: "excavation" },
    { slug: "nivellement-levis", title: "Nivellement à Lévis", city_slug: "levis", service_slug: "nivellement" },
    { slug: "excavation-quebec", title: "Excavation à Québec", city_slug: "quebec", service_slug: "excavation" },
    { slug: "transport-gatineau", title: "Transport à Gatineau", city_slug: "gatineau", service_slug: "transport" },
  ];
  it("ne suggère que des pages réelles et jamais la page elle-même", () => {
    const s = suggestInternalLinks(page(), candidates);
    expect(s.map((x) => x.href)).toEqual(["/nivellement-levis", "/excavation-quebec"]);
  });
  it("explique la pertinence de chaque suggestion", () => {
    const s = suggestInternalLinks(page(), candidates);
    expect(s[0].reason).toContain("Même territoire");
    expect(s[1].reason).toContain("Même service");
  });
  it("exclut les liens déjà présents", () => {
    const p = page({ internal_links: [{ label: "Nivellement", href: "/nivellement-levis" }] });
    expect(currentInternalLinks(p)).toHaveLength(1);
    expect(suggestInternalLinks(p, candidates).map((x) => x.href)).toEqual(["/excavation-quebec"]);
  });
  it("fusionne sans doublon", () => {
    const merged = mergeInternalLinks(
      [{ label: "A", href: "/a" }],
      [{ label: "A bis", href: "/a" }, { label: "B", href: "/b" }],
    );
    expect(merged.map((l) => l.href)).toEqual(["/a", "/b"]);
  });
  it("rejette toute URL inventée", () => {
    const issues = validateInternalLinks([{ label: "X", href: "/page-inexistante" }], ["nivellement-levis"]);
    expect(issues[0].message).toContain("aucune page SEO existante");
    expect(validateInternalLinks([{ label: "N", href: "/nivellement-levis" }], ["nivellement-levis"])).toEqual([]);
  });
});

describe("4 & 5. groupes de pages et lot", () => {
  it("applique uniquement les pages sélectionnées", () => {
    const items = buildBatchPlan(["a", "b", "c"], new Set(["a", "c"]), { a: "pa", b: "pb", c: "pc" });
    expect(items.filter((i) => i.status === "pending").map((i) => i.slug)).toEqual(["pa", "pc"]);
    expect(items.find((i) => i.page_id === "b")!.status).toBe("skipped");
  });
  it("une erreur n'arrête pas le reste du lot", () => {
    let items = buildBatchPlan(["a", "b", "c"], new Set(["a", "b", "c"]));
    items = applyBatchResult(items, "a", true);
    items = applyBatchResult(items, "b", false, "échec réseau");
    items = applyBatchResult(items, "c", true);
    const p = batchProgress(items);
    expect(p).toMatchObject({ done: 2, errors: 1, total: 3, finished: true });
    expect(items.find((i) => i.page_id === "b")!.error).toBe("échec réseau");
  });
  it("réessaie uniquement les erreurs et conserve les réussites", () => {
    let items = buildBatchPlan(["a", "b"], new Set(["a", "b"]));
    items = applyBatchResult(items, "a", true);
    items = applyBatchResult(items, "b", false, "boom");
    const retry = retryErrors(items);
    expect(retry.find((i) => i.page_id === "a")!.status).toBe("done");
    expect(retry.find((i) => i.page_id === "b")!.status).toBe("pending");
  });
  it("affiche une progression réelle 0/N puis N/N", () => {
    let items = buildBatchPlan(["a", "b"], new Set(["a", "b"]));
    expect(batchProgress(items)).toMatchObject({ done: 0, total: 2, finished: false });
    items = applyBatchResult(items, "a", true);
    items = applyBatchResult(items, "b", true);
    expect(batchProgress(items)).toMatchObject({ done: 2, total: 2, finished: true });
  });
});

describe("sécurité d'exécution", () => {
  it("aucune proposition ne crée de page : elle ne renvoie que des champs de page existante", () => {
    const { draft } = buildContentProposal(page());
    expect(Object.keys(draft).sort()).toEqual(["content_html", "intro"]);
  });
  it("les destinations CTA restent dans les parcours connus du site", () => {
    const hrefs = ctaDestinations({ city_slug: "levis" }).map((d) => d.href);
    for (const h of hrefs) {
      expect(h === "#soumission" || h.startsWith("/") || h.startsWith("tel:") || h.startsWith("https://wa.me/")).toBe(true);
    }
  });
});
