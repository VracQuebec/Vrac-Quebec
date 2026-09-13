// Tests du parcours d'aperçu (Lot 6) — scénarios A à J.
import { describe, it, expect } from "vitest";
import { interpretDescription } from "@/lib/matching/interpreter";
import {
  anonymizePayload, clearDraft, estimatedMinutes, groupResults, humanizeMissing,
  loadDraft, saveDraft, simpleMatchLabel, tripsSentence, truckLabelFor,
} from "@/lib/preview/parcours";
import type { MatchResult } from "@/lib/matching/engine";

function fakeResult(over: Partial<MatchResult> = {}): MatchResult {
  return {
    candidate: { id: "c1", city: "Québec" } as MatchResult["candidate"],
    material: { compatibility: "COMPATIBLE_CONFIRME", reason: "Matériau accepté" } as unknown as MatchResult["material"],
    availability: { state: "OUI", label: "Disponible" } as MatchResult["availability"],
    distance: { km: 12 } as MatchResult["distance"],
    access: { verdict: "ACCESSIBLE" } as MatchResult["access"],
    quantity: {} as MatchResult["quantity"],
    score: 85,
    factors: [],
    warnings: [],
    missingData: [],
    confidence: "ELEVEE",
    ...over,
  } as MatchResult;
}

describe("A — description simple", () => {
  it("comprend un matériau de base", () => {
    const it1 = interpretDescription("J'ai de la terre à sortir");
    expect(it1.materials.length).toBeGreaterThan(0);
    expect(it1.originalText).toContain("terre");
  });
});

describe("B — description complexe multi-matériaux", () => {
  it("détecte plusieurs matériaux", () => {
    const it1 = interpretDescription("de la terre sableuse avec de la glaise et des cailloux");
    expect(it1.materials.length).toBeGreaterThanOrEqual(2);
  });
});

describe("C — quantité et voyages", () => {
  it("extrait un nombre de voyages", () => {
    const it1 = interpretDescription("environ 20 voyages de semi de terre");
    expect(it1.trips).toBe(20);
  });
  it("formule une phrase de voyages déclarés", () => {
    expect(tripsSentence({ declaredTrips: 20 })).toEqual({ text: "Environ 20 voyages déclarés", kind: "DECLARE" });
  });
  it("formule une estimation quand rien n'est déclaré", () => {
    const s = tripsSentence({ tonnes: 100, trips: 5, truckLabel: "10 roues" });
    expect(s.kind).toBe("ESTIME");
    expect(s.text).toContain("5 voyages");
  });
  it("reste honnête quand tout est inconnu", () => {
    expect(tripsSentence({}).kind).toBe("INCONNU");
  });
});

describe("D — camion", () => {
  it("traduit les codes de camion", () => {
    expect(truckLabelFor("semi_3_essieux")).toBe("Semi 3 essieux");
    expect(truckLabelFor(null)).toBe("Non précisé");
  });
});

describe("E — regroupement des résultats", () => {
  it("classe les matchs sans en cacher aucun", () => {
    const results = [
      fakeResult({ score: 90 }),
      fakeResult({
        candidate: { id: "c2", city: "Lévis" } as MatchResult["candidate"],
        score: 50,
        material: { compatibility: "COMPATIBLE_PROBABLE", reason: "Probable" } as unknown as MatchResult["material"],
      }),
      fakeResult({
        candidate: { id: "c3", city: "Beauport" } as MatchResult["candidate"],
        score: 20,
        material: { compatibility: "INCONNU", reason: "À confirmer" } as unknown as MatchResult["material"],
      }),
    ];
    const g = groupResults(results);
    expect(g.meilleurs).toHaveLength(1);
    expect(g.possibles).toHaveLength(1);
    expect(g.a_confirmer).toHaveLength(1);
    expect(g.meilleurs.length + g.possibles.length + g.a_confirmer.length).toBe(results.length);
  });

  it("donne une étiquette simple sans score technique", () => {
    expect(simpleMatchLabel(fakeResult({ score: 90 }))).toBe("Excellent match");
    expect(simpleMatchLabel(fakeResult({ score: 30, material: { compatibility: "INCONNU", reason: "" } as unknown as MatchResult["material"] }))).toBe("À confirmer");
  });
});

describe("F — données manquantes en langage humain", () => {
  it("traduit les diagnostics techniques", () => {
    const h = humanizeMissing(["access_width_m", "clear_height_m", "access_width_m"]);
    expect(h).toContain("Largeur de l'entrée à confirmer");
    expect(h).toContain("Hauteur libre à confirmer");
    expect(h).toHaveLength(2);
  });
  it("ne laisse jamais un terme technique inconnu", () => {
    expect(humanizeMissing(["xyz_unknown_field"])[0]).toBe("Information à confirmer avec le site");
  });
});

describe("G — estimation de temps", () => {
  it("estime un temps de route prudent", () => {
    expect(estimatedMinutes(55)).toBe(60);
    expect(estimatedMinutes(null)).toBeNull();
  });
});

describe("H — brouillon temporaire", () => {
  it("sauvegarde et relit sans compte", () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    saveDraft({ step: 2, address: "Québec", lat: 46.8, lng: -71.2, description: "terre", truckCode: null, answers: {} }, store);
    expect(loadDraft(store)?.description).toBe("terre");
    clearDraft(store);
    expect(loadDraft(store)).toBeNull();
  });
});

describe("I — analytique anonyme", () => {
  it("retire toute donnée identifiante", () => {
    const out = anonymizePayload({
      count: 3, email: "a@b.ca", address: "123 rue X", description: "x".repeat(80), nom: "Jean", score: 77,
    });
    expect(out).toEqual({ count: 3, score: 77 });
  });
});

describe("J — « je ne sais pas » et incertitude", () => {
  it("pose au plus deux questions", () => {
    const it1 = interpretDescription("j'ai de la terre");
    expect(it1.questions.length).toBeLessThanOrEqual(2);
  });
  it("conserve toujours le texte original", () => {
    const text = "20 voyages de tuff pis un peu de glaise";
    expect(interpretDescription(text).originalText).toBe(text);
  });
});
