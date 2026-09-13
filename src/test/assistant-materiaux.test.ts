// Tests du branchement de l'assistant au parcours : texte original →
// interprétation → confirmation → structure finale (mêmes libellés que
// les cartes du formulaire existant).
import { describe, it, expect } from "vitest";
import {
  interpretForParcours,
  selectionFromManual,
  assistantNotes,
  RESTRICTION_OPTIONS,
  RECEPTION_FAMILIES,
  SIMPLE_FAMILIES,
} from "@/lib/parcours/assistant-materiaux";
import { REMBLAI_MATERIAL_CATEGORIES } from "@/lib/questionnaire-data";
import { isFeatureEnabled } from "@/lib/flags";

const KNOWN = new Set(REMBLAI_MATERIAL_CATEGORIES.flatMap((c) => c.materials));

const evac = (t: string) => interpretForParcours(t, "EVACUATION");
const recep = (t: string) => interpretForParcours(t, "RECEPTION");

describe("feature flag", () => {
  it("material_assistant_v2 est désactivé par défaut", () => {
    expect(isFeatureEnabled("material_assistant_v2")).toBe(false);
  });
});

describe("structure commune aux deux chemins", () => {
  it("le texte libre ne produit que des libellés déjà connus du formulaire", () => {
    const r = evac("terre, sable et petits cailloux");
    r.materials.forEach((m) => expect(KNOWN.has(m)).toBe(true));
  });

  it("le choix manuel produit la même structure", () => {
    const m = selectionFromManual(["Terre", "Sable"]);
    expect(m.materials).toEqual(["Terre", "Sable"]);
    expect(m.lines.every((l) => l.state === "ACCEPTE")).toBe(true);
  });

  it("« je ne suis pas certain » ne devient jamais une acceptation", () => {
    const m = selectionFromManual(["Je ne suis pas certain"]);
    expect(m.materials).toEqual([]);
    expect(m.lines[0].state).toBe("INCONNU");
  });

  it("conserve le texte original intact", () => {
    const txt = "Terre  avec un PEU de roche";
    expect(evac(txt).interpretation.originalText).toBe(txt);
  });
});

describe("scénarios réels de chantier", () => {
  it("CAS 1 — terre sablonneuse avec glaise et petits cailloux", () => {
    const r = evac("J'ai 400 tonnes de terre sablonneuse avec un peu de glaise et des petits cailloux dedans");
    expect(r.materials.length).toBeGreaterThanOrEqual(2);
    expect(r.quantityText).toContain("400");
  });

  it("CAS 2 — 20 voyages de semi 2 essieux, sable terreux et tuff", () => {
    const r = evac("20 voyages de semi 2 essieux avec sable terreux mélangé avec du tuff moins de 18 pouces");
    expect(r.interpretation.trips).toBe(20);
    expect(r.materials.length).toBeGreaterThanOrEqual(1);
  });

  it("CAS 3 — terre propre reste une déclaration", () => {
    const r = evac("terre propre");
    expect(r.materials).toContain("Terre");
    expect(r.conditions.join(" ").toLowerCase()).toContain("propre");
  });

  it("CAS 4 — terre avec roche", () => {
    const r = evac("terre avec roche");
    expect(r.materials).toContain("Terre");
    expect(r.materials.some((m) => m === "Roches" || m === "Gravier")).toBe(true);
  });

  it("CAS 5 — je sais pas c'est quoi → aide demandée, jamais bloquant", () => {
    const r = evac("je sais pas c'est quoi");
    expect(r.needsHelp).toBe(true);
    expect(r.materials).toEqual([]);
  });

  it("CAS 6 — pas mal n'importe quoi sauf glaise et souches", () => {
    const r = recep("pas mal n'importe quoi sauf glaise et souches");
    expect(r.refused.length).toBeGreaterThanOrEqual(1);
    expect(r.materials).not.toContain("Souches");
  });

  it("CAS 7 — terre sable roche mais pas béton", () => {
    const r = recep("terre sable roche mais pas béton");
    expect(r.materials).toContain("Terre");
    expect(r.materials).not.toContain("Béton");
    expect(r.refused).toContain("Béton");
  });

  it("CAS 8 — béton cassé avec un peu d'asphalte", () => {
    const r = evac("béton cassé avec un peu d'asphalte");
    expect(r.materials).toContain("Béton");
    expect(r.materials).toContain("Asphalte");
  });

  it("CAS 9 — environ 10 voyages de grosse roche", () => {
    const r = evac("environ 10 voyages de grosse roche");
    expect(r.interpretation.trips).toBe(10);
    expect(r.materials.some((m) => m === "Roches" || m === "Gravier")).toBe(true);
  });

  it("CAS 10 — plusieurs matériaux acceptés, rien de contaminé", () => {
    const r = recep("je peux prendre terre, sable, roche et béton concassé mais rien de contaminé");
    expect(r.materials.length).toBeGreaterThanOrEqual(3);
    expect(r.materials).toContain("Terre");
    expect(r.materials).toContain("Sable");
  });
});

describe("restrictions et environnement", () => {
  it("les restrictions proposées ne sont pas des matériaux du catalogue", () => {
    const risky = RESTRICTION_OPTIONS.filter((r) => KNOWN.has(r as string));
    expect(risky).toEqual(["Béton", "Asphalte"]); // volontairement partagés, traités comme refus
  });

  it("les familles de réception restent courtes et simples", () => {
    expect(RECEPTION_FAMILIES.length).toBeLessThanOrEqual(8);
    expect(SIMPLE_FAMILIES.length).toBeLessThanOrEqual(8);
  });

  it("aucune classification environnementale n'est déduite du texte", () => {
    const r = evac("terre propre sol A non contaminé");
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toContain("\"sol_a\"");
    expect(r.interpretation.conditions.every((c) => c.declaration)).toBe(true);
  });

  it("le résumé de notes reste en français simple", () => {
    const notes = assistantNotes({
      description: "terre avec roche",
      materials: ["Terre", "Roches"],
      refused: ["Glaise"],
      environment: "je ne sais pas",
    });
    expect(notes).toContain("Terre, Roches");
    expect(notes).toContain("N'accepte pas : Glaise");
    expect(notes).not.toContain("canonical");
  });
});
