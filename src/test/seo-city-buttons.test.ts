import { describe, it, expect } from "vitest";
import { cityPlan } from "@/lib/seo/cityActions";
import { computeCoverage, catalogBreakdown, coverageFlags } from "@/lib/seo/cityCoverage";

const base = { slug: "beaumont", unpublished: 0, drafts: 0, problems: [], publishedKeys: new Set<string>(), runningHere: false, lockedByOther: false, globalRunActive: false, hasGenRow: false };

describe("registre du générateur : chargement ≠ ville absente", () => {
  it("pendant le chargement, la raison n'accuse pas la municipalité", () => {
    expect(cityPlan({ ...base, registryState: "loading" }).generate.reason).toMatch(/chargement/);
  });
  it("en cas d'erreur de lecture, la raison le dit", () => {
    expect(cityPlan({ ...base, registryState: "error" }).generate.reason).toMatch(/non chargé/);
  });
  it("absente seulement quand le registre est chargé sans la ville", () => {
    expect(cityPlan({ ...base, registryState: "absent" }).generate.reason).toMatch(/absente du registre/);
  });
  it("ville présente entièrement publiée : rien à générer, raison explicite", () => {
    expect(cityPlan({ ...base, hasGenRow: true, registryState: "ok" }).generate.reason).toMatch(/existent déjà/);
  });
});

const mats = ["sable", "gravier", "neige", "terre-contaminee"].map((s) => ({ slug: s, name: s, keys: [s] }));
const page = (slug: string, m: string | null) => ({ slug, status: "published", noindex: false, published_at: "x", material_slug: m, service_slug: null });

describe("catalogue complet distinct des opportunités", () => {
  const cv = computeCoverage({ city_slug: "b", city_name: "B", materials: mats, services: [], territory_services: [],
    terms: [{ raw: "Sable", slug: "sable", count: 1 }], pages: [page("b", null), page("sable-b", "sable")] });
  const excl = new Set(["material|neige", "material|terre-contaminee"]);
  it("opportunités couvertes mais catalogue incomplet", () => {
    expect(coverageFlags(cv).badge).toBe("covered");
    const c = catalogBreakdown(cv, excl);
    expect(c).toMatchObject({ theoretical: 5, relevant: 2, excluded: 2, unknownMissing: 1, catalogPublished: 2, catalogTarget: 3, catalogComplete: false });
  });
  it("Terre contaminée et Neige ne comptent pas comme manquantes", () => {
    expect(catalogBreakdown(cv, excl).unknownMissing).toBe(1);
    expect(catalogBreakdown(cv, new Set()).unknownMissing).toBe(3);
  });
});
