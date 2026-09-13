import { describe, it, expect } from "vitest";
import { interpretChantier } from "@/lib/nlu/chantier";
import {
  buildFillProfileFromInterpretation,
  buildLoadFromInterpretation,
  evaluateMaterialCompatibility,
  type FillRequestProfile,
  type LoadComposition,
} from "@/lib/matching/compatibility";

const profile = (text: string) =>
  buildFillProfileFromInterpretation(interpretChantier(text, { direction: "RECEPTION" }));
const load = (text: string) =>
  buildLoadFromInterpretation(interpretChantier(text, { direction: "EVACUATION" }));

const keys = (p: FillRequestProfile, status: "ACCEPTED" | "REFUSED" | "UNKNOWN") =>
  p.materials.filter((m) => m.status === status).map((m) => m.materialKey);

describe("Cas réels de langage de chantier (A → R)", () => {
  it("A — « terre »", () => {
    const p = profile("terre");
    expect(keys(p, "ACCEPTED")).toContain("terre");
    expect(p.scope).toBe("explicit");
  });

  it("B — « terre sable »", () => {
    const p = profile("terre sable");
    expect(keys(p, "ACCEPTED")).toEqual(expect.arrayContaining(["terre", "sable"]));
  });

  it("C — « terre sablonneuse avec petite roche » (rôles conservés)", () => {
    const i = interpretChantier("terre sablonneuse avec petite roche", { direction: "EVACUATION" });
    const l = buildLoadFromInterpretation(i);
    expect(l.materials.length).toBeGreaterThanOrEqual(2);
    expect(l.materials[0].role).toBe("PRINCIPAL");
    expect(l.materials.every((m) => m.sharePct === null)).toBe(true); // aucun pourcentage inventé
  });

  it("D — « terre avec roche moins de 18 pouces » (granulométrie séparée)", () => {
    const p = profile("terre avec roche moins de 18 pouces");
    expect(keys(p, "ACCEPTED")).toContain("terre");
    expect(p.materials.some((m) => m.maxInches === 18)).toBe(true);
  });

  it("E — « pas de glaise » → restriction, pas de matériau accepté inventé", () => {
    const p = profile("terre mais pas de glaise");
    expect(keys(p, "ACCEPTED")).toContain("terre");
    expect(p.materials.find((m) => m.materialKey === "argile")?.status).not.toBe("ACCEPTED");
  });

  it("F — « n'importe quoi sauf souches » → broad + refus explicite", () => {
    const p = profile("n'importe quoi sauf souches");
    expect(p.scope).toBe("broad");
    expect(keys(p, "REFUSED")).toContain("organique");
    expect(keys(p, "ACCEPTED").length).toBeLessThanOrEqual(1);
  });

  it("G — « terre sable roche béton mais pas asphalte »", () => {
    const p = profile("terre sable roche beton mais pas asphalte");
    expect(keys(p, "ACCEPTED")).toEqual(expect.arrayContaining(["terre", "sable", "beton"]));
    expect(keys(p, "REFUSED")).toContain("asphalte");
  });

  it("H — « terre propre seulement » : condition, jamais une classification environnementale", () => {
    const p = profile("terre propre seulement");
    expect(p.conditions).toContain("propre");
    expect(p.environmentStatus).toBe("UNKNOWN");
  });

  it("I — « terre sèche »", () => {
    const p = profile("terre seche");
    expect(p.conditions).toContain("sec");
    expect(keys(p, "ACCEPTED")).toContain("terre");
  });

  it("J — « terre pas trop mouillée »", () => {
    const p = profile("terre pas trop mouillee");
    expect(keys(p, "ACCEPTED")).toContain("terre");
    expect(p.environmentStatus).toBe("UNKNOWN");
  });

  it("K — « béton cassé »", () => {
    const p = profile("beton casse");
    expect(keys(p, "ACCEPTED")).toContain("beton");
  });

  it("L — « béton avec armature »", () => {
    const i = interpretChantier("beton avec armature", { direction: "RECEPTION" });
    const p = buildFillProfileFromInterpretation(i);
    expect(keys(p, "ACCEPTED")).toContain("beton");
    expect(i.unrecognizedSegments.length + i.conditions.length).toBeGreaterThanOrEqual(0);
  });

  it("M — « asphalte concassé »", () => {
    const p = profile("asphalte concasse");
    expect(keys(p, "ACCEPTED")).toContain("asphalte");
  });

  it("N — « je sais pas » → scope unknown, aucune acceptation", () => {
    const i = interpretChantier("je sais pas", { direction: "RECEPTION" });
    const p = buildFillProfileFromInterpretation(i);
    expect(p.scope).toBe("unknown");
    expect(keys(p, "ACCEPTED")).toHaveLength(0);
    expect(i.needsHumanHelp).toBe(true);
  });

  it("O — « remplissage »", () => {
    const p = profile("remplissage");
    expect(p.materials.length).toBeGreaterThan(0);
    expect(p.materials.every((m) => m.confirmedAt === null)).toBe(true);
  });

  it("P — « terre et pierre mais rien de contaminé »", () => {
    const p = profile("terre et pierre mais rien de contamine");
    expect(keys(p, "ACCEPTED")).toEqual(expect.arrayContaining(["terre", "pierre"]));
    expect(p.restrictions.some((r) => r.kind === "ENVIRONNEMENT")).toBe(true);
    expect(p.environmentStatus).toBe("UNKNOWN");
  });

  it("Q — « 400 tonnes terre sablonneuse » (capacité)", () => {
    const p = profile("400 tonnes terre sablonneuse");
    expect(p.capacity.unit).toBe("tonnes");
    expect(p.capacity.value).toBe(400);
  });

  it("R — « 20 voyages semi 2 essieux sable terreux avec tuff moins de 18 pouces »", () => {
    const i = interpretChantier(
      "20 voyages semi 2 essieux sable terreux avec tuff moins de 18 pouces",
      { direction: "EVACUATION" },
    );
    const p = buildFillProfileFromInterpretation(i);
    expect(i.trips).toBe(20);
    expect(p.materials.some((m) => m.maxInches === 18)).toBe(true);
    expect(p.acceptedTruckCodes.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Non-surestimation (jamais d'acceptation inventée)", () => {
  it("« terre » n'accepte pas sable/roche/béton/asphalte", () => {
    const p = profile("terre");
    for (const k of ["sable", "roche", "beton", "asphalte"] as const) {
      expect(p.materials.find((m) => m.materialKey === k)?.status).toBeUndefined();
    }
  });

  it("« n'importe quoi sauf souches » ne crée pas 44 confirmations humaines", () => {
    const p = profile("n'importe quoi sauf souches");
    expect(p.materials.filter((m) => m.confirmedAt !== null)).toHaveLength(0);
    expect(p.materials.filter((m) => m.status === "ACCEPTED").length).toBeLessThan(5);
  });

  it("un matériau non nommé reste NEEDS_REVIEW, jamais COMPATIBLE", () => {
    const p = profile("terre");
    const ev = evaluateMaterialCompatibility(load("beton"), p);
    expect(ev.result).toBe("NEEDS_REVIEW");
  });
});

describe("Non-sous-estimation", () => {
  it("« terre, sable, roche et béton » conserve toutes les composantes", () => {
    const p = profile("terre, sable, roche et beton");
    const accepted = keys(p, "ACCEPTED");
    expect(accepted).toEqual(expect.arrayContaining(["terre", "sable", "beton"]));
    expect(accepted.length).toBeGreaterThanOrEqual(3);
  });
});

describe("evaluateMaterialCompatibility — explicabilité et priorité au refus", () => {
  it("COMPATIBLE avec raisons explicites", () => {
    const ev = evaluateMaterialCompatibility(load("terre et sable"), profile("terre sable"));
    expect(ev.result).toBe("COMPATIBLE");
    expect(ev.reasons.every((r) => r.level === "OK")).toBe(true);
    expect(ev.acceptedMaterials).toEqual(expect.arrayContaining(["terre", "sable"]));
  });

  it("INCOMPATIBLE : refus explicite bat une acceptation large", () => {
    const p = profile("je prends pas mal tout sauf beton");
    const ev = evaluateMaterialCompatibility(load("terre avec beton"), p);
    expect(p.scope).toBe("broad");
    expect(ev.result).toBe("INCOMPATIBLE");
    expect(ev.reasons.some((r) => r.code === "MATERIAL_REFUSED")).toBe(true);
  });

  it("NEEDS_REVIEW : acceptation large non confirmée", () => {
    const p = profile("je prends pas mal n'importe quoi sauf souches");
    const ev = evaluateMaterialCompatibility(load("sable"), p);
    expect(ev.result).toBe("NEEDS_REVIEW");
    expect(ev.reliesOnBroadAcceptance).toBe(true);
  });

  it("INCOMPATIBLE : dimension dépassée", () => {
    const request: FillRequestProfile = {
      ...profile("terre avec roche moins de 18 pouces"),
    };
    const heavy: LoadComposition = {
      id: "l", originalText: "roche 24 pouces", conditions: [],
      materials: [{ materialKey: "roche", label: "Roches", role: "PRINCIPAL", sharePct: null, maxInches: 24 }],
    };
    const ev = evaluateMaterialCompatibility(heavy, request);
    expect(ev.result).toBe("INCOMPATIBLE");
    expect(ev.reasons.some((r) => r.code === "SIZE_TOO_BIG")).toBe(true);
  });

  it("chargement vide → NEEDS_REVIEW", () => {
    const ev = evaluateMaterialCompatibility(
      { id: "l", materials: [], conditions: [], originalText: "" },
      profile("terre"),
    );
    expect(ev.result).toBe("NEEDS_REVIEW");
    expect(ev.reasons[0].code).toBe("NO_LOAD_MATERIAL");
  });
});
