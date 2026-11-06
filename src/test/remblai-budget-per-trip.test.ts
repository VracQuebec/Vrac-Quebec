import { describe, expect, it } from "vitest";
import { budgetPerTripError, parseBudgetPerTrip, formatClientTripBudget, publicStepError, emptyParcoursDraft } from "@/lib/remblai/public-form";

describe("budget du client par voyage reçu", () => {
  it("est obligatoire : une absence de réponse est refusée", () => {
    expect(budgetPerTripError("")).not.toBeNull();
    expect(publicStepError("budget", emptyParcoursDraft)).not.toBeNull();
  });
  it("accepte 0 $ comme vraie réponse", () => {
    expect(budgetPerTripError("0")).toBeNull();
    expect(parseBudgetPerTrip("0")).toBe(0);
  });
  it("accepte les montants positifs avec deux décimales au plus", () => {
    expect(parseBudgetPerTrip("75")).toBe(75);
    expect(parseBudgetPerTrip("75,5")).toBe(75.5);
    expect(parseBudgetPerTrip("75.25")).toBe(75.25);
    expect(parseBudgetPerTrip("75.255")).toBeNull();
    expect(parseBudgetPerTrip("-5")).toBeNull();
  });
  it("affiche Non précisé pour les anciennes demandes sans montant, jamais 0 $", () => {
    expect(formatClientTripBudget(null, null)).toBe("Non précisé");
    expect(formatClientTripBudget("", "$ / voyage")).toBe("Non précisé");
    expect(formatClientTripBudget("0", "$ / voyage")).toBe("0 $ CA / voyage");
  });
});
