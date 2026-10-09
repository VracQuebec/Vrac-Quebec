import { describe, it, expect } from "vitest";
import { sanitizeContentLinks, candidateSlugs } from "../../prepared/seo-generator/_shared/seo-link-guard";
import { findPlaceholders, metaIssues, normalizeForSimilarity, shingles, jaccard } from "../../prepared/seo-generator/_shared/seo-quality";
import { enforceOfferFaq, isForbiddenOfferFaq, offerKind } from "../../prepared/seo-generator/_shared/seo-faq-offer";
import { findUnverifiedClaims } from "../../prepared/seo-generator/_shared/seo-claims";

describe("liens écrits par l'IA", () => {
  const html = '<p>Voir <a href="/gravier-levis">gravier à Lévis</a>, <a href="/terre-inventee">terre</a>, <a href="/brouillon-x">brouillon</a>, <a href="https://x.com">site</a>, <a href="gravier levis">mal</a>, <a>vide</a>.</p>';
  const r = sanitizeContentLinks(html, ["gravier-levis"]);
  it("garde un lien vers une page publiée", () => {
    expect(r.html).toContain('<a href="/gravier-levis">gravier à Lévis</a>');
    expect(r.kept).toEqual(["gravier-levis"]);
  });
  it("retire les liens inexistants ou en brouillon en gardant le texte", () => {
    expect(r.html).not.toContain("/terre-inventee");
    expect(r.html).not.toContain("/brouillon-x");
    expect(r.html).toContain(" terre, brouillon, ");
  });
  it("retire les liens externes et mal formés", () => {
    expect(r.removed.map((x) => x.reason)).toEqual(["not_published", "not_published", "external", "malformed", "malformed"]);
    expect(r.html).not.toContain("<a>");
  });
  it("n'ajoute aucun lien", () => {
    expect((r.html.match(/<a /g) ?? []).length).toBe(1);
  });
  it("ne lit en base que les adresses internes simples", () => {
    expect(candidateSlugs(html).sort()).toEqual(["brouillon-x", "gravier-levis", "terre-inventee"]);
  });
});

describe("FAQ contrôlée par catégorie", () => {
  const ai = [
    { question: "Quelle quantité prévoir ?", answer: "Mesurez la surface." },
    { question: "Vrac Québec fournit-il lui-même ce matériau ou ce service ?", answer: "Non. Vrac Québec est une plateforme qui reçoit les demandes." },
    { question: "Vrac Québec offre-t-il ce matériau ?", answer: "Oui, livré demain." },
  ];
  const cases: Array<[string | null, string | null, string]> = [
    ["gravier", null, "offre des matériaux en vrac"],
    [null, "transport-vrac", "aide à coordonner le transport"],
    [null, "dompe", "aide à trouver une solution de dompe"],
    [null, "nivellement", "aide à trouver la solution pertinente"],
    [null, null, "coordonne le transport"],
  ];
  for (const [m, s, expected] of cases) {
    it(`catégorie ${offerKind(m, s)} : une seule réponse contrôlée`, () => {
      const out = enforceOfferFaq(ai, offerKind(m, s), "gravier", "Lévis");
      expect(out).toHaveLength(2);
      expect(out[0].question).toBe("Quelle quantité prévoir ?");
      expect(out[1].answer).toContain(expected);
    });
  }
  it("les anciennes réponses ne reviennent jamais", () => {
    for (const k of ["material", "transport", "dompe", "service", "city"] as const) {
      const out = enforceOfferFaq(ai, k, "t", "c");
      expect(out.some((f) => /fournit-il lui-même/.test(f.question))).toBe(false);
      expect(out.some((f) => /^Non\./.test(f.answer))).toBe(false);
      expect(out.some((f) => /plateforme/i.test(f.answer))).toBe(false);
    }
  });
  it("détecte la réduction à une simple plateforme", () => {
    expect(isForbiddenOfferFaq({ question: "Q", answer: "Vrac Québec est uniquement une plateforme." })).toBe(true);
    expect(isForbiddenOfferFaq({ question: "Q", answer: "Mesurez la surface." })).toBe(false);
  });
  it("aucune réponse contrôlée ne contient de promesse interdite", () => {
    for (const k of ["material", "transport", "dompe", "service", "city"] as const) {
      const [f] = enforceOfferFaq([], k, "gravier", "Lévis");
      expect(findUnverifiedClaims(`${f.question} ${f.answer}`)).toEqual([]);
      expect(f.answer).not.toMatch(/nos camions|notre flotte|nous livrons|garanti/i);
    }
  });
});

describe("contrôles SEO", () => {
  it("repère les variables non remplacées", () => {
    expect(findPlaceholders({ intro: "Gravier à {{city}}", title: "Prix ${x}", faq: "undefined" }).map((h) => h.token)).toEqual(["{{…}}", "${…}", "undefined/NaN"]);
    expect(findPlaceholders({ intro: "Gravier à Lévis, réponse nulle part." })).toEqual([]);
  });
  it("signale descriptions vides, courtes et doublons", () => {
    expect(metaIssues({ meta_title: "A", meta_description: "" }, []).map((i) => i.code)).toEqual(["desc_empty"]);
    expect(metaIssues({ meta_title: "A", meta_description: "court" }, []).map((i) => i.code)).toEqual(["desc_short"]);
    const long = "x".repeat(130);
    expect(metaIssues({ meta_title: "Gravier Lévis", meta_description: long }, [{ slug: "b", meta_title: "gravier  lévis", meta_description: long }]).map((i) => i.code)).toEqual(["title_duplicate", "desc_duplicate"]);
  });
  it("similarité : identique = 1, phrases communes neutralisées", () => {
    const a = "<p>Le gravier convient aux entrées de cour et aux fondations de terrasse bien drainées.</p>";
    expect(jaccard(shingles(normalizeForSimilarity(a)), shingles(normalizeForSimilarity(a)))).toBe(1);
    const common = "Vrac Québec offre des matériaux en vrac et vous permet de demander une soumission.";
    const x = `<p>${common}</p><p>Sol argileux à Lévis, prévoir un drain.</p>`;
    const y = `<p>${common}</p><p>Terrain rocheux à Beauport, peu de pente.</p>`;
    expect(jaccard(shingles(normalizeForSimilarity(x, [], [common])), shingles(normalizeForSimilarity(y, [], [common])))).toBe(0);
  });
});
