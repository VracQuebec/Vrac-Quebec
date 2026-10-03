import { describe, expect, it } from "vitest";
import { daysLeft, oblStatus, torontoToday } from "@/lib/obligations/status";

const base = { status: "ouvert", applicability: "applicable", due_date: "2026-11-30", due_source: "avis", due_confirmed: true };

describe("obligations — statut", () => {
  it("date manquante = à confirmer", () => expect(oblStatus({ ...base, due_date: null }, "2026-10-03")).toBe("a_confirmer"));
  it("prévisionnelle non confirmée = à confirmer", () => expect(oblStatus({ ...base, due_confirmed: false, due_source: "previsionnelle" }, "2026-10-03")).toBe("a_confirmer"));
  it("à venir / proche / dépassée", () => {
    expect(oblStatus(base, "2026-10-03")).toBe("a_venir");
    expect(oblStatus(base, "2026-11-10")).toBe("proche");
    expect(oblStatus(base, "2026-12-01")).toBe("depassee");
  });
  it("réalisée l'emporte sur le retard", () => expect(oblStatus({ ...base, status: "realise" }, "2027-01-01")).toBe("realisee"));
  it("non applicable", () => expect(oblStatus({ ...base, applicability: "non_applicable" }, "2026-10-03")).toBe("non_applicable"));
  it("jours restants", () => expect(daysLeft("2026-10-10", "2026-10-03")).toBe(7));
  it("jour à Toronto (minuit UTC = veille)", () => expect(torontoToday(new Date("2026-10-04T02:00:00Z"))).toBe("2026-10-03"));
});
