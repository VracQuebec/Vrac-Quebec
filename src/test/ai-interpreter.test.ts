import { describe, expect, it } from "vitest";
import {
  interpretDescription,
  toStructuredData,
  estimateTonnesFromTrips,
  publicMatchLabel,
} from "@/lib/matching/interpreter";

const keys = (t: string) => interpretDescription(t).materials.map((m) => m.key).sort();

describe("Assistant IA — exemples obligatoires", () => {
  it("400 tonnes de terre sablonneuse avec un peu de glaise et des petits cailloux", () => {
    const r = interpretDescription(
      "J'ai 400 tonnes de terre sablonneuse avec un peu de glaise et des petits cailloux dedans.",
    );
    expect(r.quantity).toBe(400);
    expect(r.unit).toBe("tonnes");
    expect(r.materials.map((m) => m.key).sort()).toEqual(["argile", "pierre", "sable", "terre"]);
    expect(r.isMixture).toBe(true);
    expect(r.maxSizeLabel).toBe("petites pierres");
    expect(r.uncertainty).not.toBe("ELEVEE");
    expect(r.originalText).toContain("400 tonnes");
  });

  it("20 voyages de semi 2 essieux, sable terreux avec tuff de moins de 18 pouces", () => {
    const r = interpretDescription(
      "J'ai 20 voyages de semi 2 essieux avec du sable terreux mélangé avec du tuff de moins de 18 pouces.",
    );
    expect(r.trips).toBe(20);
    expect(r.truckConfigCode).toBe("semi_2_essieux");
    expect(r.axleCount).toBe(2);
    expect(r.maxSizeInches).toBe(18);
    expect(r.materials.map((m) => m.key)).toEqual(expect.arrayContaining(["sable", "terre", "roche"]));
    const est = estimateTonnesFromTrips(r.trips, 30);
    expect(est.tonnes).toBe(600);
    expect(est.isEstimate).toBe(true);
    expect(estimateTonnesFromTrips(r.trips, null).tonnes).toBeNull();
  });
});

describe("Langage de chantier québécois", () => {
  it("10 loads de 12 roues terre et roche", () => {
    const r = interpretDescription("10 loads de 12 roues terre et roche");
    expect(r.trips).toBe(10);
    expect(r.truckConfigCode).toBe("porteur_12_roues");
    expect(r.materials.map((m) => m.key)).toEqual(expect.arrayContaining(["terre", "roche"]));
  });

  it("environ 300 tonnes de terre noire", () => {
    const r = interpretDescription("environ 300 tonnes de terre noire");
    expect(r.quantity).toBe(300);
    expect(r.quantityIsApproximate).toBe(true);
    expect(r.materials.map((m) => m.key)).toContain("terre");
  });

  it("terre avec pas mal de roche dedans", () => {
    expect(keys("terre avec pas mal de roche dedans")).toEqual(["roche", "terre"]);
  });

  it("mélange de sable pis de terre", () => {
    const r = interpretDescription("mélange de sable pis de terre");
    expect(r.isMixture).toBe(true);
    expect(r.materials.map((m) => m.key).sort()).toEqual(["sable", "terre"]);
  });

  it("phrase floue : matériel sorti d'une excavation", () => {
    const r = interpretDescription("je sais pas exactement, matériel sorti d'une excavation");
    expect(r.materials.map((m) => m.key)).toContain("terre_excavation");
    expect(r.uncertainty).toBe("ELEVEE");
  });

  it("environ 5 camions, je sais pas quel type", () => {
    const r = interpretDescription("environ 5 camions, je sais pas quel type");
    expect(r.trips).toBe(5);
    expect(r.truckConfigCode).toBeNull();
    expect(r.questions.some((q) => q.id === "truck_type")).toBe(true);
  });

  it("matériel avec béton mélangé et sable avec roche", () => {
    expect(keys("matériel avec béton mélangé")).toContain("beton");
    expect(keys("sable avec roche").sort()).toEqual(["roche", "sable"]);
  });

  it("tolère fautes et accents manquants", () => {
    const r = interpretDescription("TERRE SABLONEUSE avec glaize, sans accent");
    expect(r.materials.map((m) => m.key)).toEqual(expect.arrayContaining(["terre", "argile"]));
  });

  it("phrase très courte", () => {
    expect(keys("sable")).toEqual(["sable"]);
  });
});

describe("IA = interprétation, pas certification", () => {
  it("terre propre reste une déclaration non vérifiée", () => {
    const r = interpretDescription("terre propre");
    expect(r.declaredClean).toBe(true);
    expect(r.declarations[0]).toContain("non vérifié");
    const s = toStructuredData(r);
    expect(s.original_user_description).toBe("terre propre");
    expect(s.normalized_structured_data.declarations[0]).toContain("non vérifié");
  });

  it("aucune donnée inconnue n'est transformée en NON", () => {
    const r = interpretDescription("400 tonnes de terre");
    expect(r.hasConcrete).toBe("INCONNU");
    expect(r.hasClay).toBe("INCONNU");
  });

  it("« je ne sais pas » ne bloque rien et conserve l'inconnu", () => {
    const r = interpretDescription("8 loads de 12 roues de terre avec pas mal de roche");
    const s = toStructuredData(r, { beton_asphalte: "Je ne sais pas", rock_size: "je ne sais pas" });
    expect(s.normalized_structured_data.has_concrete).toBe("INCONNU");
    expect(s.normalized_structured_data.answers.rock_size).toBe("je ne sais pas");
  });

  it("une réponse Non est enregistrée comme NON", () => {
    const r = interpretDescription("300 tonnes de terre noire");
    const s = toStructuredData(r, { beton_asphalte: "Non" });
    expect(s.normalized_structured_data.has_concrete).toBe("NON");
  });
});

describe("Questions et confiance", () => {
  it("pose au maximum deux questions", () => {
    const r = interpretDescription("terre avec roche");
    expect(r.questions.length).toBeLessThanOrEqual(2);
    expect(r.questions[0].id).toBe("rock_size");
  });

  it("calcule une confiance par champ", () => {
    const r = interpretDescription("400 tonnes de terre sablonneuse avec un peu de glaise et des petits cailloux");
    expect(r.fieldConfidence["quantite"]).toBe("ELEVEE");
    expect(r.fieldConfidence["terre"]).toBe("ELEVEE");
    expect(r.fieldConfidence["glaise / argile"]).toBe("ELEVEE");
    expect(r.fieldConfidence["grosseur"]).toBe("MOYENNE");
  });

  it("libellés publics sans score technique", () => {
    expect(publicMatchLabel(85, "ELEVEE")).toBe("MEILLEUR MATCH");
    expect(publicMatchLabel(70, "MOYENNE")).toBe("TRÈS BON MATCH");
    expect(publicMatchLabel(50, "MOYENNE")).toBe("MATCH POSSIBLE");
    expect(publicMatchLabel(90, "A_VALIDER")).toBe("À CONFIRMER");
  });
});
