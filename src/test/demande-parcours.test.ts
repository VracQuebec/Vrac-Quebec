import { describe, expect, it } from "vitest";
import { buildDemandeParcours, isTransportLinked } from "@/lib/parcours/demande-parcours";
import type { MySubmission } from "@/lib/parcours/mes-demandes";

const base = { id: "s1", material: "Terre tamisée", quantity: "30 tonnes", requestType: "remblai", parcoursDirection: null, deliverOrRemove: null, selectedSiteId: null, siteValidatedAt: null, dumpName: "Dompe X" } as unknown as MySubmission;
const val = (l: ReturnType<typeof buildDemandeParcours>, k: string) => l.find((x) => x.label === k)!.value;

describe("parcours réel d'une demande", () => {
  it("A/E/G sans site, transport ni voyage — dump_name seul ne crée pas de site", () => {
    const l = buildDemandeParcours(base, null, [], "Besoin identifié");
    expect(val(l, "Site / dompe")).toBe("Aucun site lié");
    expect(val(l, "Transport")).toBe("Aucun transport lié");
    expect(val(l, "Voyage")).toBe("Aucun voyage lié");
  });
  it("B/C site sélectionné puis validé", () => {
    expect(val(buildDemandeParcours({ ...base, selectedSiteId: "x" }, null, [], null), "Site / dompe")).toBe("Site sélectionné");
    expect(val(buildDemandeParcours({ ...base, selectedSiteId: "x", siteValidatedAt: "2026-01-01" }, null, [], null), "Site / dompe")).toBe("Site sélectionné · validé");
  });
  it("D/H transport lié par identifiant seulement, sans voyage", () => {
    expect(isTransportLinked({ origin_submission_id: "s1" }, "s1")).toBe(true);
    expect(isTransportLinked({ dump_submission_id: "s1" }, "s1")).toBe(true);
    expect(isTransportLinked({ origin_submission_id: null }, "s1")).toBe(false);
    const l = buildDemandeParcours(base, { request_number: "T-1" }, [], null);
    expect(val(l, "Transport")).toContain("T-1");
    expect(val(l, "Voyage")).toBe("Aucun voyage lié");
  });
  it("F voyages liés, côtés non additionnés, annulés et autres demandes ignorés", () => {
    const l = buildDemandeParcours(base, null, [
      { submission_id: "s1", voided_at: null, side: "recu", count: 2 },
      { submission_id: "s1", voided_at: null, side: "livre", count: 1 },
      { submission_id: "s1", voided_at: "2026-01-01", side: "recu", count: 5 },
      { submission_id: "s2", voided_at: null, side: "recu", count: 9 },
    ], null);
    expect(val(l, "Voyage")).toBe("2 reçus · 1 livré (enregistré)");
  });
  it("J informations partielles et sens absent", () => {
    const l = buildDemandeParcours({ ...base, material: null, quantity: null } as unknown as MySubmission, null, [], null);
    expect(val(l, "Matériau")).toBe("Non disponible");
    expect(val(l, "Quantité")).toBe("Non disponible");
    expect(val(l, "Sens du besoin")).toBe("Sens à confirmer");
    expect(val(l, "Étape actuelle")).toBe("Non disponible");
  });
});
