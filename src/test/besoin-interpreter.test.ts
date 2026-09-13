// ============================================================
// LOT 7 — TESTS DE LANGAGE « J'AI BESOIN DE MATÉRIAUX »
// Aucune écriture, aucune donnée réelle : fonctions pures seulement.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  interpretBesoin, scoreCompleteness, detectDuplicates, detectTrucks,
  toBesoinStructuredData, buildCapacity, suggestAdditionalMaterials,
} from "@/lib/besoin/interpreter";

const keys = (list: { key: string }[]) => list.map((m) => m.key);

describe("interprétation du langage québécois — demandes de remblai", () => {
  it("je peux prendre 3000 tonnes terre sable glaise petite roche semi rentre", () => {
    const r = interpretBesoin("je peux prendre 3000 tonnes terre sable glaise petite roche semi rentre");
    expect(keys(r.accepted)).toEqual(expect.arrayContaining(["terre", "sable", "argile", "pierre"]));
    expect(r.quantity).toBe(3000);
    expect(r.unit).toBe("tonnes");
    expect(r.trucks.semi_3_essieux).toBe("ACCEPTE");
    expect(r.access.semiAccess).toBe("OUI");
  });

  it("besoin 500 loads de terre pas de béton", () => {
    const r = interpretBesoin("besoin 500 loads de terre pas de béton");
    expect(r.trips).toBe(500);
    expect(keys(r.accepted)).toContain("terre");
    expect(keys(r.refused)).toContain("beton");
    expect(keys(r.accepted)).not.toContain("beton");
  });

  it("je cherche terre de remplissage 12 roues seulement", () => {
    const r = interpretBesoin("je cherche terre de remplissage 12 roues seulement");
    expect(keys(r.accepted)).toContain("terre");
    expect(r.trucks.porteur_12_roues).toBe("ACCEPTE");
    expect(r.trucks.porteur_10_roues).toBe("REFUSE");
    expect(r.trucks.semi_3_essieux).toBe("REFUSE");
  });

  it("j'ai besoin de terre pour monter mon terrain", () => {
    const r = interpretBesoin("j'ai besoin de terre pour monter mon terrain");
    expect(keys(r.accepted)).toContain("terre");
    expect(r.quantity).toBeNull();
    const c = scoreCompleteness(r, { hasLocation: false });
    expect(c.usable).toBe(true);
    expect(c.missing).toContain("Où est le site ?");
  });

  it("peut prendre terre sable pis petite roche pas d'asphalte", () => {
    const r = interpretBesoin("peut prendre terre sable pis petite roche pas d'asphalte");
    expect(keys(r.accepted)).toEqual(expect.arrayContaining(["terre", "sable", "pierre"]));
    expect(keys(r.refused)).toContain("asphalte");
  });

  it("environ 50 voyages de 12 roues, appelez avant", () => {
    const r = interpretBesoin("environ 50 voyages de 12 roues, appelez avant");
    expect(r.trips).toBe(50);
    expect(r.trucks.porteur_12_roues).toBe("ACCEPTE");
    expect(r.schedule.callBefore).toBe(true);
    expect(r.driverInstructions.length).toBeGreaterThan(0);
  });

  it("je prends pas mal n'importe quelle terre mais pas de grosse roche", () => {
    const r = interpretBesoin("je prends pas mal n'importe quelle terre mais pas de grosse roche");
    expect(keys(r.accepted)).toContain("terre");
    expect(keys(r.refused)).toContain("roche");
    expect(r.quantityLarge).toBe(true);
  });

  it("semi rentre mais c'est serré", () => {
    const r = interpretBesoin("semi rentre mais c'est serré");
    expect(r.access.semiAccess).toBe("OUI");
    expect(r.access.tight).toBe(true);
    expect(r.notes.join(" ")).toMatch(/serr/i);
  });

  it("je sais pas combien j'en ai besoin", () => {
    const r = interpretBesoin("je sais pas combien j'en ai besoin");
    expect(r.quantityUnknown).toBe(true);
    expect(r.quantity).toBeNull();
    expect(scoreCompleteness(r).usable).toBe(true);
  });

  it("beaucoup de terre, ouvert la semaine", () => {
    const r = interpretBesoin("beaucoup de terre, ouvert la semaine");
    expect(r.quantityLarge).toBe(true);
    expect(r.schedule.weekdays).toBe("OUI");
    expect(r.schedule.summary).toMatch(/Lundi au vendredi/);
    expect(r.schedule.originalText).toBeTruthy();
  });

  it("je prends pas mal de matériel sauf asphalte et béton", () => {
    const r = interpretBesoin("je prends pas mal de matériel sauf asphalte et béton");
    expect(keys(r.refused)).toEqual(expect.arrayContaining(["asphalte", "beton"]));
  });

  it("fautes et phrases incomplètes restent interprétables", () => {
    const r = interpretBesoin("terre pi du sable, 10 et 12 roues ok, glaize accepte");
    expect(keys(r.accepted)).toEqual(expect.arrayContaining(["terre", "sable", "argile"]));
    expect(r.trucks.porteur_10_roues).toBe("ACCEPTE");
    expect(r.trucks.porteur_12_roues).toBe("ACCEPTE");
  });
});

describe("multi-matériaux et trois états", () => {
  it("propose des élargissements sans jamais les accepter d'office", () => {
    const r = interpretBesoin("je peux prendre de la terre");
    expect(r.toConfirm.length).toBeGreaterThan(0);
    expect(r.toConfirm.every((m) => m.stance === "A_CONFIRMER")).toBe(true);
    expect(keys(r.accepted)).not.toContain("sable");
  });

  it("ne suggère jamais un matériau explicitement refusé", () => {
    const r = interpretBesoin("terre, pas de sable");
    expect(keys(r.toConfirm)).not.toContain("sable");
    const s = suggestAdditionalMaterials(r.accepted, r.refused);
    expect(keys(s)).not.toContain("sable");
  });

  it("une information inconnue reste à confirmer, jamais refusée", () => {
    const r = interpretBesoin("terre et sable");
    expect(r.trucks.semi_4_essieux).toBe("A_CONFIRMER");
  });
});

describe("camions", () => {
  it("comprend « tout rentre »", () => {
    const t = detectTrucks("tout rentre");
    expect(Object.values(t).every((s) => s === "ACCEPTE")).toBe(true);
  });
  it("comprend « pas de semi »", () => {
    const t = detectTrucks("10 roues ok mais pas de semi");
    expect(t.semi_2_essieux).toBe("REFUSE");
    expect(t.porteur_10_roues).toBe("ACCEPTE");
  });
  it("comprend « petit camion seulement »", () => {
    const t = detectTrucks("petit camion seulement");
    expect(t.porteur_6_roues).toBe("ACCEPTE");
    expect(t.semi_3_essieux).toBe("REFUSE");
  });
});

describe("déclarations, capacité et complétude", () => {
  it("« seulement du propre » reste une déclaration non vérifiée", () => {
    const r = interpretBesoin("terre seulement du propre");
    expect(r.declarations.join(" ")).toMatch(/non vérifiée/);
  });

  it("la capacité restante n'est jamais diminuée automatiquement", () => {
    const r = interpretBesoin("je peux prendre 1000 tonnes de terre");
    const cap = buildCapacity(r);
    expect(cap.initialQuantity).toBe(1000);
    expect(cap.remainingQuantity).toBe(1000);
    expect(cap.autoDecrement).toBe(false);
  });

  it("score de complétude sans bloquer la demande", () => {
    const r = interpretBesoin("je peux prendre environ 3000 tonnes de terre, sable et glaise, semi rentre, ouvert la semaine");
    const c = scoreCompleteness(r, { hasLocation: true });
    expect(["EXCELLENT", "BON"]).toContain(c.level);
    expect(c.usable).toBe(true);
  });

  it("données structurées identiques en mode simple et détaillé", () => {
    const r = interpretBesoin("terre et sable, 12 roues");
    const simple = toBesoinStructuredData(r, { address: "1 rue X", lat: 46.8, lng: -71.2 });
    const detaille = toBesoinStructuredData(r, {
      address: "1 rue X", lat: 46.8, lng: -71.2,
      confirmations: { argile: "ACCEPTE" },
    });
    expect(simple.structured.address_visibility).toBe("PRIVEE");
    expect(simple.original_user_description).toBe(r.originalText);
    expect(detaille.structured.accepted_materials).toContain("argile");
    expect(simple.structured.accepted_materials).not.toContain("argile");
  });
});

describe("dédoublonnage", () => {
  const existing = [
    { id: "a", address: "123 rue des Pins", city: "Québec", latitude: 46.8, longitude: -71.2, status: "actif", createdAt: null },
    { id: "b", address: "999 ailleurs", city: "Lévis", latitude: 46.9, longitude: -71.5, status: "perdu", createdAt: null, isArchived: true },
  ];

  it("détecte une demande existante au même endroit sans fusionner", () => {
    const hits = detectDuplicates({ address: "123 rue des Pins", lat: 46.8001, lng: -71.2001 }, existing);
    expect(hits.length).toBe(1);
    expect(hits[0].request.id).toBe("a");
    expect(hits[0].suggestReviewOnly).toBe(true);
  });

  it("ne retourne rien quand le site est loin", () => {
    expect(detectDuplicates({ address: "5 autre rue", lat: 45.5, lng: -73.5 }, existing)).toEqual([]);
  });
});
