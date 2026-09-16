import { describe, it, expect } from "vitest";
import { describeCapability, describeCapabilities, NEVER_INCLUDED } from "@/lib/platform/capabilities";
import { invoiceTaxLabel, taxGuidance, TAX_LABELS } from "@/lib/platform/tax";

describe("CRM-02B — services compréhensibles", () => {
  it("traduit les identifiants techniques en libellés lisibles", () => {
    expect(describeCapability("crm_demandes").label).toBe("Demandes et suivi");
    expect(describeCapability("carte_dompes").label).toBe("Carte des demandes de remblai");
    expect(describeCapability("annuaire_reseau").label).toBe("Annuaire des entrepreneurs");
    expect(describeCapability("exports").label).toMatch(/propres demandes/i);
  });

  it("chaque service ouvert pointe vers une destination existante", () => {
    for (const cap of describeCapabilities(["crm_demandes", "carte_dompes", "annuaire_reseau"])) {
      expect(cap.available).toBe(true);
      expect(cap.route).toMatch(/^\/entrepreneur\//);
      expect(cap.description.length).toBeGreaterThan(20);
    }
  });

  it("une fonction absente est signalée, jamais présentée comme ouverte", () => {
    const exports = describeCapability("exports");
    expect(exports.available).toBe(false);
    expect(exports.route).toBeNull();
    expect(exports.unavailableReason).toMatch(/administration/i);
  });

  it("les services ouverts sont listés avant ceux à venir", () => {
    const list = describeCapabilities(["exports", "crm_demandes"]);
    expect(list.map((c) => c.key)).toEqual(["crm_demandes", "exports"]);
  });

  it("une capacité inconnue reste visible sans invention", () => {
    const unknown = describeCapability("truc_inconnu");
    expect(unknown.label).toBe("truc_inconnu");
    expect(unknown.available).toBe(false);
  });

  it("l'abonnement n'ouvre jamais les accès protégés", () => {
    expect(NEVER_INCLUDED.join(" ")).toMatch(/notes privées/i);
    expect(NEVER_INCLUDED.join(" ")).toMatch(/administration/i);
  });
});

describe("CRM-02B — affichage des taxes", () => {
  it("un calcul absent n'est jamais affiché comme zéro", () => {
    expect(invoiceTaxLabel(null, null)).toBe("Taxes non calculées");
    expect(invoiceTaxLabel(0, null)).toBe("Taxes non calculées");
    expect(invoiceTaxLabel(0, "failed")).toBe("Taxes non calculées");
  });

  it("un zéro calculé est affiché comme zéro", () => {
    expect(invoiceTaxLabel(0, "complete", "CAD")).toContain("0");
  });

  it("un montant calculé est affiché tel quel", () => {
    expect(invoiceTaxLabel(150, "complete", "CAD")).toContain("1,50");
  });

  it("chaque état de taxe a un libellé et une conséquence claire", () => {
    for (const state of ["not_configured", "unavailable", "computed", "zero_justified"] as const) {
      expect(TAX_LABELS[state].length).toBeGreaterThan(5);
      expect(taxGuidance(state).length).toBeGreaterThan(20);
    }
    expect(TAX_LABELS.not_configured).toBe("Taxes non configurées dans cet environnement");
  });
});
