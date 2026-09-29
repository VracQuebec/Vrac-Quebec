import { describe, it, expect } from "vitest";
import { compareRankedDumps } from "@/lib/entrepreneur/comparateur-candidates";

type R = { id: string; distance_km: number | null; fit: number };
// fit : 0 = entièrement compatible, 1 = camions à confirmer, ≥ 20 = incompatible (exclu de la liste principale)
const order = (rows: R[]) => [...rows].sort(compareRankedDumps).map((r) => r.id);
const main = (rows: R[]) => [...rows].sort(compareRankedDumps).filter((r) => r.fit < 20).map((r) => r.id);

describe("comparateur — ordre de classement", () => {
  it("Cas A : 7,6 km puis 18,5 km, puis trajet inconnu (même si l'inconnue est plus compatible)", () => {
    const rows: R[] = [
      { id: "inconnue", distance_km: null, fit: 0 },
      { id: "587", distance_km: 18.5, fit: 1 },
      { id: "167", distance_km: 7.6, fit: 0 },
    ];
    expect(order(rows)).toEqual(["167", "587", "inconnue"]);
  });

  it("Cas B : une dompe incompatible plus proche n'entre pas dans les résultats principaux", () => {
    const rows: R[] = [
      { id: "incompatible", distance_km: 1.0, fit: 22 },
      { id: "167", distance_km: 7.6, fit: 0 },
    ];
    expect(main(rows)).toEqual(["167"]);
  });

  it("Cas C : toutes les distances inconnues restent après toutes les distances connues", () => {
    const rows: R[] = [
      { id: "u1", distance_km: null, fit: 0 },
      { id: "k3", distance_km: 56.4, fit: 1 },
      { id: "u2", distance_km: null, fit: 1 },
      { id: "k1", distance_km: 7.6, fit: 0 },
      { id: "k2", distance_km: 22.0, fit: 1 },
    ];
    const ids = order(rows);
    expect(ids.slice(0, 3).sort()).toEqual(["k1", "k2", "k3"]);
    expect(ids.slice(3).sort()).toEqual(["u1", "u2"]);
  });

  it("à trajet connu égal en compatibilité, la plus proche d'abord", () => {
    expect(order([
      { id: "b", distance_km: 15.6, fit: 0 },
      { id: "a", distance_km: 15.3, fit: 0 },
    ])).toEqual(["a", "b"]);
  });
});
