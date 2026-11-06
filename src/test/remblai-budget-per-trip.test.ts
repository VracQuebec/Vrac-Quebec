import { describe, expect, it } from "vitest";
import { budgetPerTripError, parseBudgetPerTrip, formatClientTripBudget, clientTripBudgetFromAnswers, publicStepError, emptyParcoursDraft } from "@/lib/remblai/public-form";

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
  it("accepte 75,25 et 75.25", () => {
    expect(budgetPerTripError("75,25")).toBeNull();
    expect(budgetPerTripError("75.25")).toBeNull();
    expect(parseBudgetPerTrip("75,25")).toBe(75.25);
  });
  it("affiche Non précisé pour les anciennes demandes, jamais 0 $ ni leur ancien budget max", () => {
    expect(clientTripBudgetFromAnswers(null)).toBe("Non précisé");
    expect(clientTripBudgetFromAnswers({ mode: "x" })).toBe("Non précisé");
    expect(formatClientTripBudget("")).toBe("Non précisé");
    expect(clientTripBudgetFromAnswers({ client_trip_budget_cad: 0 })).toBe("0 $ CA / voyage");
    expect(clientTripBudgetFromAnswers({ client_trip_budget_cad: 75.25 })).toBe("75,25 $ CA / voyage");
  });
});

describe("budget proposé après l'enregistrement", () => {
  it("distingue montant positif, 0 $, sans contribution et absence de réponse", () => {
    expect(clientTripBudgetFromAnswers({ client_trip_budget_cad: 40, client_trip_budget_choice: "montant" })).toBe("40 $ CA / voyage");
    expect(clientTripBudgetFromAnswers({ client_trip_budget_cad: 0, client_trip_budget_choice: "montant" })).toBe("0 $ CA / voyage");
    expect(clientTripBudgetFromAnswers({ client_trip_budget_choice: "sans_contribution" })).toBe("Sans contribution (choix du client)");
    expect(clientTripBudgetFromAnswers({ client_trip_budget_token_sha256: "abc" })).toBe("Non précisé");
  });
  it("accepte 75,25 et 75.25 mais refuse trois décimales", () => {
    expect(parseBudgetPerTrip("75,25")).toBe(75.25);
    expect(parseBudgetPerTrip("75.25")).toBe(75.25);
    expect(parseBudgetPerTrip("75,255")).toBeNull();
  });
});
