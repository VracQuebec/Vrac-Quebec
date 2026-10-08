import { describe, it, expect } from "vitest";
import { computeCoverage, matchTerm, coverageLabel, type CoverageRaw } from "@/lib/seo/cityCoverage";

const mats = ["asphalte","beton","brique","gravier","gravier-0-3-4","mg-20","mg-56","neige","pierre","pierre-concassee","pierre-nette","poussiere-de-pierre","remblai","roche","sable","terre-contaminee","terre-tamisee"]
  .map((s) => ({ slug: s, name: s, keys: [s] }));
const svcs = ["courtage-materiaux","dompe","excavation","livraison-gravier","livraison-pierre","livraison-sable","livraison-terre","nivellement","recherche-point-de-depot","transport-vrac"]
  .map((s) => ({ slug: s, name: s }));
const tsvc = [
  ["courtage_materiaux","NON_CONFIGUREE",0],["disposition_remblai","NON_CONFIGUREE",0],["livraison","NON_CONFIGUREE",0],
  ["materiaux_vrac","NON_CONFIGUREE",0],["recherche_dompe","PARTIELLE",2],["reseau_partenaires","NON_CONFIGUREE",0],
  ["soumission","NON_CONFIGUREE",0],["transport","NON_CONFIGUREE",0],
].map(([key, status, requests]) => ({ key: key as string, status: status as string, requests: requests as number }));
const page = (slug: string, m: string | null, s: string | null, published = true) =>
  ({ slug, status: published ? "published" : "draft", noindex: !published, published_at: published ? "2026-01-01" : null, material_slug: m, service_slug: s });

const disraeli: CoverageRaw = {
  city_slug: "disraeli", city_name: "Disraeli", materials: mats, services: svcs, territory_services: tsvc,
  terms: [
    { raw: "Roches", slug: "roches", count: 1 }, { raw: "Roches concassées", slug: "roches-concassees", count: 1 },
    { raw: "Sable", slug: "sable", count: 1 }, { raw: "Terre", slug: "terre", count: 2 },
    { raw: "Terre mélangée", slug: "terre-melangee", count: 2 },
  ],
  pages: [page("disraeli", null, null), page("dompe-disraeli", null, "dompe"), page("sable-disraeli", "sable", null), page("remblai-disraeli", "remblai", null, false)],
};

describe("couverture SEO réelle d'une ville", () => {
  const c = computeCoverage(disraeli);
  it("Disraeli : 4 existantes sur 28 possibilités, pas 4/4", () => {
    expect(c.possible).toBe(28);
    expect(c.existing).toBe(4);
    expect(coverageLabel(c.existingInCatalog, c.possible)).toBe("4 / 28");
  });
  it("Disraeli : 3 opportunités pertinentes, 3 couvertes, distinctes du potentiel théorique", () => {
    expect(c.planned).toBe(3);
    expect(c.plannedCovered).toBe(3);
    expect(c.theoretical).toBe(28);
    expect(c.toConfirm).toBe(1);
    expect(c.toDevelop).toBe(0);
  });
  it("une page pertinente en brouillon est « En brouillon »", () => {
    const d = computeCoverage({ ...disraeli, pages: [page("sable-disraeli", "sable", null, false)] });
    expect(d.items.find((i) => i.slug === "sable")?.status).toBe("draft");
    expect(d.plannedDrafts).toBe(1);
    expect(d.items.find((i) => i.kind === "hub")?.status).toBe("to_develop");
  });
  it("Disraeli : 3 publiées, 1 brouillon", () => {
    expect(c.published).toBe(3);
    expect(c.drafts).toBe(1);
  });
  it("une page existante sans critère est hors critères, pas prévue", () => {
    expect(c.items.find((i) => i.slug === "remblai")?.status).toBe("off_criteria");
    expect(c.planned).toBe(3);
    expect(c.offCriteria).toBe(1);
  });
  it("un service non configuré n'est jamais une page à développer", () => {
    expect(c.items.find((i) => i.slug === "transport-vrac")?.status).toBe("not_configured");
    expect(c.items.find((i) => i.slug === "courtage-materiaux")?.status).toBe("not_configured");
    expect(c.items.find((i) => i.slug === "excavation")?.status).toBe("not_linked");
  });
  it("« Roches » est équivalent à « roche », « Terre » reste sans correspondance", () => {
    expect(matchTerm("roches", mats)).toEqual({ match: "equiv", material: "roche" });
    expect(matchTerm("terre", mats).match).toBe("none");
    expect(c.items.find((i) => i.slug === "roche")?.status).toBe("to_develop_equiv");
  });
  it("« Pierre concassée 0-3/4 » rejoint « pierre-concassee », pas « pierre »", () => {
    expect(matchTerm("pierre-concassee-0-3-4", mats)).toEqual({ match: "equiv", material: "pierre-concassee" });
  });
  it("correspondance exacte par nom du catalogue", () => {
    expect(matchTerm("sable", mats)).toEqual({ match: "exact", material: "sable" });
  });
});

import real from "./fixtures/coverage-real-cities.json";
import { splitAll, coverageFlags, suspiciousLegacyRatio, type CoverageAllRaw } from "@/lib/seo/cityCoverage";

const base = (over: Partial<CoverageRaw>): CoverageRaw => ({ ...disraeli, terms: [], pages: [], territory_services: [], ...over });

describe("moteur global — mêmes règles pour toute municipalité", () => {
  it("ville partiellement couverte : opportunité pertinente sans page = À développer", () => {
    const c = computeCoverage(base({ terms: [{ raw: "Gravier", slug: "gravier", count: 3 }, { raw: "Sable", slug: "sable", count: 1 }], pages: [page("x", null, null), page("gravier-x", "gravier", null)] }));
    expect(c.planned).toBe(3);
    expect(c.plannedCovered).toBe(2);
    expect(c.toDevelop).toBe(1);
    expect(coverageFlags(c).badge).toBe("to_develop");
  });
  it("ville complètement couverte = COUVERTE", () => {
    const c = computeCoverage(base({ terms: [{ raw: "Sable", slug: "sable", count: 1 }], pages: [page("x", null, null), page("sable-x", "sable", null)] }));
    expect(c.plannedCovered).toBe(c.planned);
    expect(coverageFlags(c).badge).toBe("covered");
  });
  it("plusieurs services actifs/partiels avec demandes sont des opportunités; sans demande, non", () => {
    const c = computeCoverage(base({ territory_services: [
      { key: "recherche_dompe", status: "ACTIVE", requests: 5 }, { key: "transport", status: "PARTIELLE", requests: 2 },
      { key: "courtage_materiaux", status: "ACTIVE", requests: 0 }] }));
    expect(c.items.find((i) => i.slug === "dompe")?.status).toBe("to_develop");
    expect(c.items.find((i) => i.slug === "transport-vrac")?.status).toBe("to_develop");
    expect(c.items.find((i) => i.slug === "courtage-materiaux")?.status).toBe("not_requested");
    expect(c.planned).toBe(3);
  });
  it("service configuré avec demandes mais sans service SEO correspondant : à valider, jamais compté", () => {
    const c = computeCoverage(base({ territory_services: [{ key: "livraison", status: "ACTIVE", requests: 3 }] }));
    expect(c.unmappedServices.map((u) => u.key)).toEqual(["livraison"]);
    expect(c.planned).toBe(1);
    expect(coverageFlags(c).toValidate).toBe(true);
  });
  it("beaucoup de pages hors critères n'augmentent jamais les opportunités", () => {
    const pages = [page("x", null, null), ...["beton", "brique", "neige", "pierre"].map((m) => page(`${m}-x`, m, null))];
    const c = computeCoverage(base({ pages }));
    expect(c.existing).toBe(5);
    expect(c.planned).toBe(1);
    expect(c.offCriteria).toBe(4);
  });
  it("l'ancien ratio X/X complet est signalé quand des pages hors critères y étaient incluses", () => {
    const c = computeCoverage(disraeli);
    expect(suspiciousLegacyRatio({ planned: 4, generated: 4 }, c).length).toBeGreaterThan(0);
  });
  it("données réelles — Saint-Agapit et Québec : même moteur, opportunités ≤ potentiel théorique", () => {
    const rows = splitAll(real as unknown as CoverageAllRaw).map(computeCoverage);
    expect(rows).toHaveLength(2);
    for (const c of rows) {
      expect(c.theoretical).toBe(28);
      expect(c.planned).toBeLessThan(c.theoretical);

      // Aucune page existante hors critères ne gonfle le total
      expect(c.planned).toBe(c.items.filter((i) => ["covered", "draft", "to_develop"].includes(i.status)).length);
    }
    const quebec = rows[1];
    expect(quebec.offCriteria).toBeGreaterThan(0);
    expect(quebec.unmappedServices.map((u) => u.key)).toContain("livraison");
  });
});
