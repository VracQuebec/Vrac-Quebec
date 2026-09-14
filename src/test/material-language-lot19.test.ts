// ============================================================
// LOT 19 — TESTS DE L'INTERPRÉTEUR DE LANGAGE DE CHANTIER
// Fonctions pures : aucune donnée réelle, aucune écriture.
// ============================================================
import { describe, expect, it } from "vitest";
import {
  applyManualCorrection, parseMaterialDescription, toLoadComposition, toMatchContext,
} from "@/lib/material-language";

const keys = (t: string) => parseMaterialDescription(t).materials.map((m) => m.type);
const role = (t: string, key: string) =>
  parseMaterialDescription(t).materials.find((m) => m.type === key)?.role;

describe("LOT 19 — exemples obligatoires", () => {
  it("TEST 1 — 20 voyages de semi 2 essieux de sable terreux avec du tuff en dessous de 18 pouces", () => {
    const r = parseMaterialDescription(
      "20 voyages de semi 2 essieux de sable terreux avec du tuff en dessous de 18 pouces",
    );
    expect(r.transport?.tripCount).toBe(20);
    expect(r.transport?.vehicleType).toBe("semi_2_essieux");
    expect(r.materials.find((m) => m.role === "principal")?.type).toBe("sable");
    expect(r.materials.filter((m) => m.role !== "principal").map((m) => m.type))
      .toEqual(expect.arrayContaining(["terre", "roche"]));
    expect(r.granulometry?.maxInches).toBe(18);
    expect(r.rawText).toContain("tuff");
  });

  it("TEST 2 — environ 400 tonnes de terre sablonneuse avec un peu de glaise et quelques petites roches", () => {
    const r = parseMaterialDescription(
      "J'ai environ 400 tonnes de terre sablonneuse avec un peu de glaise et quelques petites roches.",
    );
    expect(r.quantity?.value).toBe(400);
    expect(r.quantity?.unit).toBe("tonne");
    expect(r.quantity?.approximate).toBe(true);
    expect(r.materials.find((m) => m.role === "principal")?.type).toBe("terre");
    expect(role("terre sablonneuse", "sable")).toBe("secondary");
    expect(r.materials.map((m) => m.type)).toEqual(expect.arrayContaining(["argile", "roche"]));
    // Aucune grosseur inventée.
    expect(r.granulometry).toBeUndefined();
    expect(r.clarificationQuestions.some((q) => q.id === "granulometry_max")).toBe(true);
  });

  it("TEST 3 — 10 voyages de 12 roues de terre propre avec pierre 0-4 pouces", () => {
    const r = parseMaterialDescription("10 voyages de 12 roues de terre propre avec pierre 0-4 pouces");
    expect(r.transport?.tripCount).toBe(10);
    expect(r.transport?.vehicleType).toBe("12_roues");
    expect(r.materials.find((m) => m.role === "principal")?.type).toBe("terre");
    expect(r.materials.some((m) => m.type === "pierre")).toBe(true);
    expect(r.granulometry?.maxInches).toBe(4);
    expect(r.contamination.statedClean).toBe(true);
    expect(r.contamination.declarations.join(" ")).toMatch(/non vérifiée|aucune certification/i);
  });
});

describe("quantités et transport", () => {
  it("tonnes, voyages, verges et mètres cubes", () => {
    expect(parseMaterialDescription("300 tonnes de terre").quantity?.unit).toBe("tonne");
    expect(parseMaterialDescription("15 voyages de terre").quantity?.unit).toBe("voyage");
    expect(parseMaterialDescription("40 verges cubes de sable").quantity?.unit).toBe("verge3");
    expect(parseMaterialDescription("25 m3 de sable").quantity?.unit).toBe("m3");
  });

  it("quantité approximative", () => {
    const r = parseMaterialDescription("environ 500 tonnes de sable");
    expect(r.quantity?.approximate).toBe(true);
    expect(r.quantity?.value).toBe(500);
  });

  it("10 roues, 12 roues, semi 3 essieux, semi imprécis", () => {
    expect(parseMaterialDescription("8 loads de 10 roues de terre").transport?.vehicleType).toBe("10_roues");
    expect(parseMaterialDescription("8 loads de 12 roues de terre").transport?.vehicleType).toBe("12_roues");
    expect(parseMaterialDescription("semi 3 essieux de terre").transport?.vehicleType).toBe("semi_3_essieux");
    const vague = parseMaterialDescription("2 voyages de semi de terre");
    expect(vague.ambiguities.some((a) => a.kind === "VEHICULE_IMPRECIS")).toBe(true);
  });
});

describe("matériaux, composition et vocabulaire", () => {
  it("matériau unique", () => {
    expect(keys("du sable")).toEqual(["sable"]);
  });
  it("matériaux mixtes avec « mélangé avec »", () => {
    const r = parseMaterialDescription("terre mélangé avec du gravier");
    expect(r.materials.map((m) => m.type)).toEqual(["terre", "pierre"]);
    expect(r.materials[1].role).toBe("secondary");
  });
  it("« un peu de » et « quelques » donnent des traces", () => {
    expect(role("terre avec un peu de glaise", "argile")).toBe("trace");
    expect(role("sable avec quelques cailloux", "pierre")).toBe("trace");
  });
  it("« sable terreux » n'est pas un 50/50", () => {
    const r = parseMaterialDescription("sable terreux");
    expect(r.materials[0]).toMatchObject({ type: "sable", role: "principal" });
    expect(r.materials[1]).toMatchObject({ type: "terre", role: "secondary" });
    expect(r.materials.every((m) => m.sharePct === null)).toBe(true);
  });
  it("glaise, tuff et roche sont reconnus", () => {
    expect(keys("glaise")).toEqual(["argile"]);
    expect(keys("tuff")).toEqual(["roche"]);
    expect(keys("de la roche")).toEqual(["roche"]);
  });
  it("aucun pourcentage n'est inventé", () => {
    const r = parseMaterialDescription("terre avec un peu de glaise");
    expect(r.materials.every((m) => m.sharePct === null)).toBe(true);
  });
  it("un pourcentage exprimé est conservé", () => {
    const r = parseMaterialDescription("terre à 80 % avec du sable");
    expect(r.materials[0].sharePct).toBe(80);
  });
});

describe("granulométrie", () => {
  it("granulométrie explicite 0-4 pouces", () => {
    const g = parseMaterialDescription("pierre 0-4 pouces").granulometry!;
    expect(g.minInches).toBe(0);
    expect(g.maxInches).toBe(4);
  });
  it("calibre fractionnaire 0-3/4", () => {
    const g = parseMaterialDescription("pierre 0-3/4").granulometry!;
    expect(g.maxInches).toBeCloseTo(0.75);
  });
  it("moins de 18 pouces", () => {
    expect(parseMaterialDescription("roche de moins de 18 pouces").granulometry?.maxInches).toBe(18);
  });
  it("granulométrie inconnue : jamais convertie", () => {
    const r = parseMaterialDescription("terre avec des petites pierres");
    expect(r.granulometry).toBeUndefined();
    expect(r.ambiguities.some((a) => a.kind === "GRANULOMETRIE_IMPRECISE")).toBe(true);
    expect(r.clarificationQuestions[0].options).toContain("je ne sais pas");
  });
});

describe("déclarations, ambiguïtés et phrases difficiles", () => {
  it("« propre » reste une déclaration, jamais une certification", () => {
    const r = parseMaterialDescription("terre propre");
    expect(r.contamination.statedClean).toBe(true);
    expect(r.contamination.unknown).toBe(false);
    expect(r.contamination.declarations[0]).toMatch(/déclaration/i);
  });
  it("information environnementale inconnue reste inconnue", () => {
    expect(parseMaterialDescription("400 tonnes de terre").contamination.unknown).toBe(true);
  });
  it("phrase contradictoire propre + contaminée", () => {
    const r = parseMaterialDescription("terre propre mais un peu contaminée");
    expect(r.ambiguities.some((a) => a.kind === "CONTRADICTION")).toBe(true);
  });
  it("phrase incomplète", () => {
    const r = parseMaterialDescription("de la terre");
    expect(r.ambiguities.some((a) => a.kind === "QUANTITE_MANQUANTE")).toBe(true);
    expect(r.materials).toHaveLength(1);
  });
  it("mots inconnus signalés sans blocage", () => {
    const r = parseMaterialDescription("200 tonnes de zorglub");
    expect(r.materials).toHaveLength(0);
    expect(r.unrecognizedWords).toContain("zorglub");
    expect(r.clarificationQuestions.some((q) => q.field === "materials")).toBe(true);
  });
  it("lieu conservé tel quel", () => {
    const r = parseMaterialDescription("20 voyages de terre à Beauport");
    expect(r.location?.raw).toBe("Beauport");
  });
  it("confiance bornée entre 0 et 1", () => {
    const r = parseMaterialDescription("400 tonnes de terre sablonneuse");
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe("correction manuelle et passerelle matching", () => {
  it("changer le matériau principal", () => {
    const r = parseMaterialDescription("sable terreux");
    const c = applyManualCorrection(r, { principalMaterial: "terre" });
    expect(c.materials.find((m) => m.role === "principal")?.type).toBe("terre");
    expect(c.rawText).toBe(r.rawText);
  });
  it("préciser la grosseur retire la question", () => {
    const r = parseMaterialDescription("terre avec des petites pierres");
    const c = applyManualCorrection(r, { maxInches: 4 });
    expect(c.granulometry?.maxInches).toBe(4);
    expect(c.clarificationQuestions.some((q) => q.id === "granulometry_max")).toBe(false);
  });
  it("conversion vers le modèle du moteur de matching", () => {
    const r = parseMaterialDescription("400 tonnes de terre sablonneuse avec un peu de glaise");
    const load = toLoadComposition(r, "l1");
    expect(load.id).toBe("l1");
    expect(load.materials.map((m) => m.materialKey)).toEqual(expect.arrayContaining(["terre", "sable", "argile"]));
    expect(load.materials.find((m) => m.materialKey === "terre")?.role).toBe("PRINCIPAL");
    expect(toMatchContext(r).quantity).toEqual({ value: 400, unit: "tonnes" });
  });
  it("le parsing d'une phrase simple est quasi instantané", () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) parseMaterialDescription("20 voyages de 12 roues de terre avec pierre 0-4 pouces");
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
