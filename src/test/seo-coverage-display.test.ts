import { describe, expect, it } from "vitest";
import {
  citiesWithQualityProblem,
  collectFixes,
  fixReason,
  needsFix,
  QUALITY_RULES,
} from "@/lib/seo/coverageDisplay";

const titleOf = (n: number) => "T".repeat(n);

describe("fixReason — titre SEO", () => {
  it("signale un titre trop court (29 caractères — cas réel Notre-Dame-du-Sacré-Cœur-d'Issoudun)", () => {
    expect(fixReason({ meta_title: titleOf(29), internal_link_count: 5 })).toMatch(/trop court/);
  });

  it("accepte un titre de 30 caractères exactement", () => {
    expect(fixReason({ meta_title: titleOf(30), internal_link_count: 5 })).toBeNull();
  });

  it("accepte un titre long", () => {
    expect(fixReason({ meta_title: titleOf(60), internal_link_count: 5 })).toBeNull();
  });

  it("signale un titre vide", () => {
    expect(fixReason({ meta_title: "", internal_link_count: 5 })).toMatch(/trop court/);
  });

  it("signale un titre absent (null)", () => {
    expect(fixReason({ meta_title: null, internal_link_count: 5 })).toMatch(/trop court/);
  });

  it("compte la longueur après retrait des espaces (30 avec espaces, 28 réels)", () => {
    expect(fixReason({ meta_title: `  ${titleOf(28)}  `, internal_link_count: 5 })).toMatch(/trop court/);
  });

  it("mentionne la longueur minimale exigée", () => {
    expect(fixReason({ meta_title: titleOf(10) })).toContain(String(QUALITY_RULES.metaTitleMinLength));
  });
});

describe("fixReason — liens internes", () => {
  it("signale 1 lien interne (cas réel Portneuf / roche)", () => {
    expect(fixReason({ meta_title: titleOf(40), internal_link_count: 1 })).toMatch(/insuffisants \(1 lien/);
  });

  it("signale une page orpheline (0 lien interne)", () => {
    expect(fixReason({ meta_title: titleOf(40), internal_link_count: 0 })).toMatch(/orpheline/);
  });

  it("accepte 2 liens internes exactement", () => {
    expect(fixReason({ meta_title: titleOf(40), internal_link_count: 2 })).toBeNull();
  });

  it("traite un compteur absent comme 0 lien", () => {
    expect(fixReason({ meta_title: titleOf(40), internal_link_count: null })).toMatch(/orpheline/);
  });
});

describe("fixReason — priorité et format", () => {
  it("signale d'abord le titre quand titre et liens sont tous deux insuffisants", () => {
    expect(fixReason({ meta_title: titleOf(5), internal_link_count: 0 })).toMatch(/trop court/);
  });
});

describe("needsFix et collectFixes", () => {
  it("needsFix reflète fixReason", () => {
    expect(needsFix({ meta_title: titleOf(29) })).toBe(true);
    expect(needsFix({ meta_title: titleOf(40), internal_link_count: 3 })).toBe(false);
  });

  it("collectFixes ne retourne que les pages fautives avec leur raison", () => {
    const pages = [
      { slug: "a", city_slug: "ville-a", meta_title: titleOf(29), internal_link_count: 5, status: "draft" },
      { slug: "b", city_slug: "ville-b", meta_title: titleOf(40), internal_link_count: 5, status: "published" },
      { slug: "c", city_slug: "ville-c", meta_title: titleOf(40), internal_link_count: 1, status: "published" },
    ];
    const fixes = collectFixes(pages);
    expect(fixes.map((f) => f.slug)).toEqual(["a", "c"]);
    expect(fixes[0].reason).toMatch(/trop court/);
    expect(fixes[1].reason).toMatch(/insuffisants/);
    expect(fixes[0].status).toBe("draft"); // champs d'origine conservés
  });

  it("collectFixes retourne un tableau vide sans fautive", () => {
    expect(collectFixes([{ meta_title: titleOf(40), internal_link_count: 4 }])).toEqual([]);
  });
});

describe("citiesWithQualityProblem", () => {
  it("dédupe les villes et préserve l'ordre", () => {
    expect(citiesWithQualityProblem([
      { city_slug: "portneuf" },
      { city_slug: "notre-dame-du-sacre-coeur-d-issoudun" },
      { city_slug: "portneuf" },
    ])).toEqual(["portneuf", "notre-dame-du-sacre-coeur-d-issoudun"]);
  });

  it("retourne un tableau vide sans correction", () => {
    expect(citiesWithQualityProblem([])).toEqual([]);
  });
});

describe("scénario réel — les deux pages d'audit connues", () => {
  it("produit exactement les deux raisons attendues et rien d'autre", () => {
    const pages = [
      // Hub Notre-Dame-du-Sacré-Cœur-d'Issoudun (brouillon) : 29 caractères
      { slug: "notre-dame-du-sacre-coeur-d-issoudun", city_slug: "notre-dame-du-sacre-coeur-d-issoudun", meta_title: titleOf(29), internal_link_count: 2 },
      // Portneuf / roche (publiée) : 1 lien interne
      { slug: "roche-portneuf", city_slug: "portneuf", meta_title: titleOf(30), internal_link_count: 1 },
      // Pages saines de référence
      { slug: "portneuf", city_slug: "portneuf", meta_title: titleOf(42), internal_link_count: 9 },
      { slug: "asphalte-notre-dame-du-sacre-coeur-d-issoudun", city_slug: "notre-dame-du-sacre-coeur-d-issoudun", meta_title: titleOf(59), internal_link_count: 10 },
    ];
    const fixes = collectFixes(pages);
    expect(fixes).toHaveLength(2);
    expect(fixes[0].reason).toMatch(/trop court/);
    expect(fixes[1].reason).toMatch(/insuffisants/);
    expect(citiesWithQualityProblem(fixes)).toHaveLength(2);
  });
});
