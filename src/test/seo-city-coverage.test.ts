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
