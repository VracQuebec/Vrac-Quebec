// LOT 9 — Tests du langage de chantier québécois (fonctions pures, aucune écriture).
import { describe, it, expect } from "vitest";
import {
  interpretChantier, friendlySummary, toMatchingV2Payload, buildLearningPayload,
  detectGranulometries, negationSpans, buildPhotoSlots,
} from "@/lib/nlu/chantier";

const keys = (t: string, d?: "EVACUATION" | "RECEPTION") =>
  interpretChantier(t, { direction: d }).materials.map((m) => m.key);
const refused = (t: string) =>
  interpretChantier(t).restrictions.filter((r) => r.kind === "MATERIAU").map((r) => r.materialKey);

describe("exemples obligatoires du lot", () => {
  it("400 tonnes de terre sablonneuse avec un peu de glaise et des petits cailloux", () => {
    const r = interpretChantier("J'ai 400 tonnes de terre sablonneuse avec un peu de glaise et des petits cailloux dedans");
    expect(r.materials.map((m) => m.key).sort()).toEqual(["argile", "pierre", "sable", "terre"]);
    expect(r.quantity.value).toBe(400);
    expect(r.quantity.unit).toBe("tonnes");
    expect(r.materials.find((m) => m.key === "argile")?.role).toBe("TRACE");
    expect(r.granulometries.map((g) => g.label)).toContain("petites pierres");
    expect(r.originalText).toContain("400 tonnes");
  });

  it("20 voyages de semi 2 essieux, sable terreux avec tuff de moins de 18 pouces", () => {
    const r = interpretChantier("J'ai 20 voyages de semi 2 essieux avec du sable terreux mélangé avec du tuff de moins de 18 pouces");
    expect(r.trips).toBe(20);
    expect(r.truck.code).toBe("semi_2_essieux");
    expect(r.materials.map((m) => m.key)).toEqual(expect.arrayContaining(["sable", "terre", "roche"]));
    const g = r.granulometries.find((x) => x.maxInches === 18);
    expect(g?.canonical).toBe(false);
    expect(r.materials.map((m) => m.label).join(" ")).not.toMatch(/18 pouces/);
  });

  it("terre avec roche mais pas de béton", () => {
    const r = interpretChantier("J'ai de la terre avec roche mais pas de béton");
    expect(r.materials.map((m) => m.key).sort()).toEqual(["roche", "terre"]);
    expect(refused("J'ai de la terre avec roche mais pas de béton")).toContain("beton");
  });

  it("pas mal n'importe quoi sauf glaise et souches", () => {
    const r = interpretChantier("Je peux recevoir pas mal n'importe quoi sauf de la glaise et des souches", { direction: "RECEPTION" });
    expect(r.acceptsAlmostEverything).toBe(true);
    const ref = r.restrictions.map((x) => x.materialKey);
    expect(ref).toEqual(expect.arrayContaining(["argile", "organique"]));
    expect(r.materials.map((m) => m.key)).not.toContain("argile");
  });

  it("terre, sable, roche, béton concassé, rien de contaminé", () => {
    const r = interpretChantier("J'accepte terre, sable, roche, béton concassé, mais rien de contaminé", { direction: "RECEPTION" });
    expect(r.materials.map((m) => m.key)).toEqual(expect.arrayContaining(["terre", "sable", "roche", "beton"]));
    expect(r.restrictions.some((x) => x.kind === "ENVIRONNEMENT")).toBe(true);
  });

  it("environ 10 voyages de terre avec un peu de pierre", () => {
    const r = interpretChantier("J'ai environ 10 voyages de terre avec un peu de pierre");
    expect(r.trips).toBe(10);
    expect(r.materials.find((m) => m.key === "terre")?.role).toBe("PRINCIPAL");
    expect(r.materials.find((m) => m.key === "pierre")?.role).toBe("TRACE");
  });

  it("terre noire avec racines", () => {
    expect(keys("terre noire avec racines")).toEqual(expect.arrayContaining(["terre", "organique"]));
  });

  it("roche 0-3/4 mélangée avec sable", () => {
    const r = interpretChantier("roche 0-3/4 mélangée avec sable");
    expect(r.materials.map((m) => m.key)).toEqual(expect.arrayContaining(["roche", "sable"]));
    const g = r.granulometries.find((x) => x.code === "0-3/4");
    expect(g?.canonical).toBe(true);
    expect(g?.maxInches).toBe(0.75);
  });
});

describe("vocabulaire de chantier — cas minimaux exigés", () => {
  const cases: [string, string[]][] = [
    ["terre", ["terre"]],
    ["terre clean", ["terre"]],
    ["terre propre", ["terre"]],
    ["terre mélangée", ["terre"]],
    ["terre sablonneuse", ["terre", "sable"]],
    ["terre avec roche", ["terre", "roche"]],
    ["terre avec un peu de glaise", ["terre", "argile"]],
    ["sable terreux", ["sable", "terre"]],
    ["sable avec roche", ["sable", "roche"]],
    ["roche", ["roche"]],
    ["grosse roche", ["roche"]],
    ["roche concassée", ["pierre"]],
    ["béton cassé", ["beton"]],
    ["béton concassé", ["beton"]],
    ["asphalte", ["asphalte"]],
    ["planage d'asphalte", ["asphalte"]],
    ["tuff", ["roche"]],
    ["remplissage", ["terre"]],
    ["remblai", ["terre"]],
  ];
  it.each(cases)("« %s »", (text, expected) => {
    expect(keys(text)).toEqual(expect.arrayContaining(expected));
  });

  it("« terre clean » et « terre propre » restent des déclarations, pas des matériaux", () => {
    for (const t of ["terre clean", "terre propre"]) {
      const r = interpretChantier(t);
      expect(r.conditions.some((c) => c.key === "propre")).toBe(true);
      expect(r.materials.map((m) => m.key)).toEqual(["terre"]);
    }
  });

  it("« matériel qui s'égoutte bien » est une condition", () => {
    const r = interpretChantier("matériel qui s'égoutte bien");
    expect(r.conditions.map((c) => c.key)).toContain("drainant");
  });

  it("« je sais pas c'est quoi » n'est jamais bloquant", () => {
    const r = interpretChantier("je sais pas c'est quoi");
    expect(r.needsHumanHelp).toBe(true);
    expect(r.photoSuggested).toBe(true);
    expect(r.originalText).toBe("je sais pas c'est quoi");
    expect(friendlySummary(r).warning).toMatch(/pas certain/);
  });

  it("« tout ce que tu veux »", () => {
    expect(interpretChantier("tout ce que tu veux", { direction: "RECEPTION" }).acceptsAlmostEverything).toBe(true);
  });
});

describe("granulométrie", () => {
  it("codes canoniques", () => {
    expect(detectGranulometries("0-3/4").map((g) => g.code)).toContain("0-3/4");
    expect(detectGranulometries("trois quart net").map((g) => g.code)).toContain("3/4 net");
    expect(detectGranulometries("mg-20").map((g) => g.code)).toContain("MG-20");
    expect(detectGranulometries("mg 56").map((g) => g.code)).toContain("MG-56");
    expect(detectGranulometries("poussiere").map((g) => g.code)).toContain("poussiere");
    expect(detectGranulometries("0-2 1/2").map((g) => g.code)).toContain("0-2 1/2");
  });
  it("dimension libre conservée quand aucun calibre canonique", () => {
    const g = detectGranulometries("moins de 12 pouces")[0];
    expect(g.canonical).toBe(false);
    expect(g.maxInches).toBe(12);
  });
  it("blocs et grosses roches", () => {
    expect(detectGranulometries("des blocs").some((g) => g.label === "blocs")).toBe(true);
    expect(detectGranulometries("grosses roches").some((g) => g.label === "grosses roches")).toBe(true);
  });
});

describe("restrictions", () => {
  it("formulations négatives variées", () => {
    expect(refused("pas de glaise")).toContain("argile");
    expect(refused("sans béton")).toContain("beton");
    expect(refused("aucune souche")).toContain("organique");
    expect(refused("sauf asphalte")).toContain("asphalte");
    expect(refused("tout sauf roche")).toContain("roche");
    expect(refused("n'importe quoi sauf béton")).toContain("beton");
    expect(refused("sans souche")).toContain("organique");
  });
  it("« rien de contaminé » est une restriction environnementale déclarée", () => {
    const r = interpretChantier("j'accepte de la terre, rien de contaminé");
    const env = r.restrictions.find((x) => x.kind === "ENVIRONNEMENT");
    expect(env?.label).toMatch(/déclaration/);
  });
  it("restriction dimensionnelle", () => {
    const r = interpretChantier("terre, pas de morceaux plus gros que 18 pouces");
    const dim = r.restrictions.find((x) => x.kind === "DIMENSION");
    expect(dim?.maxInches).toBe(18);
    expect(r.materials.map((m) => m.key)).toContain("terre");
  });
  it("« pas mal de terre » n'est pas une négation", () => {
    expect(keys("j'ai pas mal de terre")).toContain("terre");
    expect(refused("j'ai pas mal de terre")).not.toContain("terre");
    expect(negationSpans("pas mal de terre")).toEqual([]);
  });
});

describe("quantité, camions, incertitude", () => {
  it("400 tonnes", () => {
    const r = interpretChantier("400 tonnes de terre");
    expect(r.quantity.value).toBe(400);
    expect(r.quantity.approximate).toBe(false);
  });
  it("environ 20 voyages reste approximatif", () => {
    const r = interpretChantier("environ 20 voyages de terre");
    expect(r.trips).toBe(20);
    expect(r.uncertaintyMarkers).toContain("environ");
  });
  it("verges cubes et mètres cubes", () => {
    expect(interpretChantier("30 verges cubes de sable").quantity.unit).toBe("verges3");
    expect(interpretChantier("30 m3 de sable").quantity.unit).toBe("m3");
  });
  it("camions détectés sans devenir des matériaux", () => {
    for (const [t, code] of [["10 roues de terre", "porteur_10_roues"], ["12 roues de terre", "porteur_12_roues"], ["semi 3 essieux de terre", "semi_3_essieux"], ["petit camion de terre", null]] as const) {
      const r = interpretChantier(t);
      if (code) expect(r.truck.code).toBe(code);
      expect(r.materials.map((m) => m.label).join(" ")).not.toMatch(/roues|essieux/);
    }
  });
  it("marqueurs d'incertitude baissent la confiance", () => {
    const r = interpretChantier("je pense que c'est du tuff, pas certain");
    expect(r.uncertaintyMarkers.length).toBeGreaterThan(0);
    expect(["MOYENNE", "ELEVEE"]).toContain(r.uncertainty);
  });
  it("confiance numérique par élément", () => {
    const r = interpretChantier("terre avec tuff");
    const terre = r.materials.find((m) => m.key === "terre")!;
    const tuff = r.materials.find((m) => m.key === "roche")!;
    expect(terre.confidence).toBeGreaterThan(tuff.confidence);
  });
});

describe("dominance et pourcentages", () => {
  it("surtout de la terre avec un peu de roche", () => {
    const r = interpretChantier("surtout de la terre avec un peu de roche");
    expect(r.materials.find((m) => m.key === "terre")?.role).toBe("PRINCIPAL");
    expect(r.materials.find((m) => m.key === "roche")?.role).toBe("TRACE");
  });
  it("moitié terre moitié sable = proportions comparables", () => {
    const r = interpretChantier("moitié terre moitié sable");
    expect(r.materials.every((m) => m.role === "PRINCIPAL")).toBe(true);
  });
  it("aucun pourcentage inventé", () => {
    expect(interpretChantier("terre avec quelques cailloux").materials.every((m) => m.sharePct === null)).toBe(true);
  });
  it("pourcentage conservé s'il est écrit", () => {
    const r = interpretChantier("70 % terre et du sable");
    expect(r.materials.find((m) => m.key === "terre")?.sharePct).toBe(70);
  });
});

describe("fautes, accents manquants, familier", () => {
  const cases = [
    "TERRE SABLONEUSE avec glaize",
    "terre pi du sable",
    "de la tere avec des caillou",
    "sable pis roche mettons",
  ];
  it.each(cases)("« %s » reste interprétable ou demande de l'aide", (t) => {
    const r = interpretChantier(t);
    expect(r.materials.length > 0 || r.needsHumanHelp).toBe(true);
    expect(r.originalText).toBe(t);
  });
});

describe("sortie compatible matching V2 et apprentissage", () => {
  it("payload V2 avec matériaux, refus et grosseur", () => {
    const r = interpretChantier("400 tonnes de terre avec petite roche, pas de béton");
    const p = toMatchingV2Payload(r, { origin: { lat: 46.8, lng: -71.2 } });
    expect(p.offer.materials.map((m) => m.slug)).toEqual(expect.arrayContaining(["terre"]));
    expect(p.refusedSlugs).toContain("beton");
    expect(p.offer.quantityTonnes).toBe(400);
    expect(p.direction).toBe("EVACUATION");
  });
  it("les deux sens produisent la même structure", () => {
    const a = interpretChantier("terre et sable", { direction: "EVACUATION" });
    const b = interpretChantier("je peux recevoir terre et sable", { direction: "RECEPTION" });
    expect(a.materials.map((m) => m.key).sort()).toEqual(b.materials.map((m) => m.key).sort());
    expect(b.direction).toBe("RECEPTION");
  });
  it("apprentissage : texte original jamais écrasé", () => {
    const r = interpretChantier("terre avec tuff");
    const payload = buildLearningPayload({
      originalText: r.originalText, direction: "EVACUATION", proposed: r,
      correction: { materials: [] },
    });
    expect(payload.original_text).toBe("terre avec tuff");
    expect(payload.proposed_interpretation.originalText).toBe("terre avec tuff");
    expect(payload.human_correction).not.toBeNull();
    expect(payload.final_interpretation.correctedByHuman).toBe(true);
  });
  it("emplacements photo préparés sans analyse", () => {
    const slots = buildPhotoSlots(["a.jpg", "b.jpg"]);
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.analyzed === false)).toBe(true);
  });
  it("résumé simple sans identifiants ni scores", () => {
    const s = friendlySummary(interpretChantier("400 tonnes de terre et sable"));
    expect(s.materials.length).toBe(2);
    expect(s.quantity).toContain("400");
    expect(JSON.stringify(s)).not.toMatch(/confidence|0\.9|materiel_inconnu/);
  });
});
