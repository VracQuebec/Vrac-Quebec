// ============================================================
// LOT 15 — tests purs (fixtures uniquement, aucune donnée réelle).
// ============================================================
import { describe, it, expect } from "vitest";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import { buildQualifiedProfile, buildDecisionEntry } from "@/lib/qualification/lot14";
import {
  ENRICHMENT_VERSION, buildEnrichedProfile, stanceForMaterial, decomposeLoad,
  evaluateMixture, evaluateComponentSize, questionValue, summarizeEnrichment,
} from "@/lib/qualification/lot15";

const profileOf = (text: string, over: Partial<Parameters<typeof buildAcceptanceProfile>[0]> = {}) =>
  buildAcceptanceProfile({ submissionId: "s1", reference: "D-1", text, available: true, ...over });

const enriched = (text: string) => buildEnrichedProfile(profileOf(text));

describe("LOT 15 — profil d'acceptation enrichi", () => {
  it("expose les cinq états et conserve le texte original", () => {
    const p = enriched("j'accepte terre, sable et petite pierre, pas de béton");
    expect(p.version).toBe(ENRICHMENT_VERSION);
    expect(p.originalText).toBe("j'accepte terre, sable et petite pierre, pas de béton");
    expect(stanceForMaterial(p, "terre")).toBe("COMPATIBLE_PROBABLE");
    expect(stanceForMaterial(p, "beton")).toBe("REFUSE_CONFIRME");
    expect(stanceForMaterial(p, "asphalte")).toBe("INCONNU");
  });

  it("inconnu n'est jamais un refus", () => {
    const p = enriched("j'accepte de la terre");
    expect(stanceForMaterial(p, "argile")).toBe("INCONNU");
    expect(p.exclusions).not.toContain("argile");
  });

  it("une décision humaine passe le matériau en accepté confirmé", () => {
    const base = profileOf("terre et sable");
    const entry = buildDecisionEntry({
      submissionId: base.submissionId, category: "material", subject: "terre",
      decision: "ACCEPTED", confirmedValue: { status: "ACCEPTED" },
      author: { confirmedBy: "admin", now: new Date("2026-09-01T00:00:00Z") },
    });
    const q = buildQualifiedProfile(base, [{ ...entry, id: "j1", createdAt: entry.createdAt ?? new Date().toISOString() }]);
    const p = buildEnrichedProfile(base, q);
    expect(stanceForMaterial(p, "terre")).toBe("ACCEPTE_CONFIRME");
  });

  it("provenance et confiance sont exposées information par information", () => {
    const p = enriched("terre propre, 20 voyages");
    expect(p.provenance.some((x) => x.field.startsWith("matériau"))).toBe(true);
    expect(p.provenance.some((x) => x.field === "capacité")).toBe(true);
    expect(p.availability.freshness.state).toBe("JAMAIS_CONFIRMEE");
  });
});

describe("LOT 15 — raisonnement par composants", () => {
  it("décompose « terre sablonneuse avec un peu de glaise et petits cailloux »", () => {
    const load = decomposeLoad("terre sablonneuse avec un peu de glaise et petits cailloux");
    const keys = load.materials.map((m) => m.materialKey);
    expect(keys).toContain("terre");
    expect(keys).toContain("argile");
    expect(load.materials.every((m) => m.sharePct === null)).toBe(true);
    expect(load.originalText).toContain("sablonneuse");
  });

  it("conserve un pourcentage exprimé par le client", () => {
    const load = decomposeLoad("80% terre et 20% sable");
    expect(load.materials.some((m) => m.sharePct != null)).toBe(true);
  });
});

describe("LOT 15 — tolérance aux mélanges", () => {
  const demande = () => enriched("j'accepte terre, sable et petite pierre");

  it("matériau pur compatible", () => {
    const r = evaluateMixture(decomposeLoad("20 voyages de terre"), demande());
    expect(r.kind).toBe("MATERIAU_PUR");
  });

  it("mélange acceptable terre + sable", () => {
    const r = evaluateMixture(decomposeLoad("terre et sable"), demande());
    expect(r.kind).toBe("MELANGE_ACCEPTABLE");
  });

  it("glaise jamais documentée → à confirmer, jamais refusée", () => {
    const r = evaluateMixture(decomposeLoad("terre sablonneuse avec un peu de glaise"), demande());
    expect(r.kind).toBe("MELANGE_A_CONFIRMER");
    expect(r.blockers).toHaveLength(0);
    expect(r.toConfirm.join(" ")).toMatch(/glaise|argile/i);
  });

  it("« sans glaise » confirmé → incompatible", () => {
    const p = enriched("j'accepte terre et sable, pas de glaise");
    const r = evaluateMixture(decomposeLoad("terre avec de la glaise"), p);
    expect(r.kind).toBe("MELANGE_INCOMPATIBLE");
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("chaque composant reçoit une explication lisible", () => {
    const r = evaluateMixture(decomposeLoad("terre et béton"), demande());
    expect(r.components.every((c) => c.explanation.length > 0)).toBe(true);
  });
});

describe("LOT 15 — granulométrie", () => {
  const max18 = () => enriched("j'accepte roche maximum 18 pouces");

  it("accepte 12 po, refuse 24 po, met l'inconnu à confirmer", () => {
    const p = max18();
    expect(evaluateComponentSize(p, "roche", 12)).toBe("OK");
    expect(evaluateComponentSize(p, "roche", 24)).toBe("TROP_GROS");
    expect(evaluateComponentSize(p, "roche", null)).toBe("INCONNU");
  });

  it("une limite de roche ne s'applique pas à la terre", () => {
    expect(evaluateComponentSize(max18(), "terre", null)).toBe("NON_APPLICABLE");
  });

  it("aucune dimension n'est inventée", () => {
    const p = enriched("j'accepte de la roche");
    expect(p.granulometry.maxInches).toBeNull();
    expect(evaluateComponentSize(p, "roche", 24)).toBe("INCONNU");
  });
});

describe("LOT 15 — questions à forte valeur", () => {
  it("priorise la question qui débloque le plus de chargements", () => {
    const p = enriched("j'accepte terre et sable");
    const loads = [
      decomposeLoad("terre avec un peu de glaise", "l1"),
      decomposeLoad("terre sablonneuse avec glaise", "l2"),
      decomposeLoad("terre et sable", "l3"),
    ];
    const questions = questionValue(p, loads);
    expect(questions[0].unlocked).toBeGreaterThan(0);
    expect(questions[0].question).toMatch(/Acceptez-vous/);
  });

  it("propose camions et capacité quand l'information manque", () => {
    const ids = questionValue(enriched("j'accepte de la terre"), [decomposeLoad("terre")]).map((q) => q.id);
    expect(ids).toContain("truck:trucks");
    expect(ids).toContain("capacity:capacity");
  });

  it("synthèse interne : fiable ≠ potentiel ≠ incompatible", () => {
    const p = enriched("j'accepte terre et sable, pas de béton");
    const s = summarizeEnrichment(p, [
      decomposeLoad("terre", "a"), decomposeLoad("terre avec glaise", "b"), decomposeLoad("béton cassé", "c"),
    ]);
    expect(s.reliableMatches).toBe(1);
    expect(s.potentialMatches).toBe(1);
    expect(s.incompatible).toBe(1);
    expect(s.topQuestion).not.toBeNull();
  });
});
