import { describe, expect, it } from "vitest";
import { annualEquivalents, csvCell, daysInclusive, freeAverages, resolvePeriod, sanitizeView, serverFilters, toCsv, DEFAULT_QUERY } from "@/lib/finances/query";

const r2 = (n: number) => Math.round(n * 100) / 100;

describe("FIN-04 périodes", () => {
  const today = "2026-09-29"; // mardi
  it("7 prochains jours = aujourd'hui + 6", () => expect(resolvePeriod({ kind: "next_7" }, today)).toEqual({ from: "2026-09-29", to: "2026-10-05" }));
  it("semaine du lundi au dimanche", () => {
    expect(resolvePeriod({ kind: "this_week" }, today)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(resolvePeriod({ kind: "next_week" }, today)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });
  it("mois courant / précédent / suivant", () => {
    expect(resolvePeriod({ kind: "month" }, today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod({ kind: "prev_month" }, today)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(resolvePeriod({ kind: "next_month" }, "2026-12-15")).toEqual({ from: "2027-01-01", to: "2027-01-31" });
  });
  it("semestre civil distinct de six mois glissants", () => {
    expect(resolvePeriod({ kind: "half_civil" }, today)).toEqual({ from: "2026-07-01", to: "2026-12-31" });
    expect(resolvePeriod({ kind: "six_rolling" }, today)).toEqual({ from: "2026-09-29", to: "2027-03-28" });
  });
  it("dates fixes conservées", () => expect(resolvePeriod({ kind: "fixed", from: "2026-09-01", to: "2026-09-30" }, "2027-05-01")).toEqual({ from: "2026-09-01", to: "2026-09-30" }));
  it("vue relative recalculée au mois courant", () => expect(resolvePeriod({ kind: "month" }, "2026-11-10").from).toBe("2026-11-01"));
  it("durée inclusive", () => { expect(daysInclusive("2026-09-01", "2026-09-30")).toBe(30); expect(daysInclusive("2028-01-01", "2028-12-31")).toBe(366); });
});

describe("FIN-04 moyennes", () => {
  it("scénario 1 : 12 000 $ en 2027", () => {
    const a = annualEquivalents(2027, { confirmed: 12000, estimated: 0, unknown_count: 0, count: 1 });
    expect(a.D).toBe(365);
    expect(r2(a.day)).toBe(32.88); expect(r2(a.week)).toBe(230.14); expect(r2(a.two_weeks)).toBe(460.27);
    expect(a.month).toBe(1000); expect(a.quarter).toBe(3000); expect(a.half).toBe(6000); expect(a.year).toBe(12000);
  });
  it("scénario 2 : 27 × 100 $ en 2026 → 225 $ / mois", () => expect(annualEquivalents(2026, { confirmed: 2700, estimated: 0, unknown_count: 0, count: 27 }).month).toBe(225));
  it("scénario 3 : 3 000 $ sur 30 jours, sans annualisation", () => {
    const b = freeAverages("2026-09-01", "2026-09-30", { confirmed: 3000, estimated: 0, unknown_count: 0, count: 3 });
    expect(b.D).toBe(30); expect(b.day).toBe(100); expect(b.week).toBe(700); expect(b.two_weeks).toBe(1400);
    expect("month" in b).toBe(false);
  });
  it("tout inconnu n'est pas un coût nul", () => expect(freeAverages("2026-09-01", "2026-09-30", { confirmed: 0, estimated: 0, unknown_count: 2, count: 2 }).allUnknown).toBe(true));
  it("précision gardée, arrondi seulement à l'affichage", () => expect(annualEquivalents(2027, { confirmed: 12000, estimated: 0, unknown_count: 0, count: 1 }).day).toBeCloseTo(32.8767, 4));
});

describe("FIN-04 contrat de requête et CSV", () => {
  it("filtres vides retirés, recherche ajoutée, montants invalides ignorés", () => {
    const q = { ...DEFAULT_QUERY("occ"), q: "  assur ", occ: { category_ids: [], settles: ["partielle"], amount_min: "abc", payee: "" } };
    expect(serverFilters(q)).toEqual({ settles: ["partielle"], q: "assur" });
  });
  it("vue d'un autre contexte ou invalide refusée", () => {
    expect(sanitizeView({ ...DEFAULT_QUERY("pay") }, "occ")).toBeNull();
    expect(sanitizeView({ ...DEFAULT_QUERY("occ"), period: { kind: "fixed" } }, "occ")).toBeNull();
    expect(sanitizeView(null, "occ")).toBeNull();
  });
  it("neutralise les formules, garde les nombres", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell(1234.5)).toBe("1234.5");
    expect(csvCell(null)).toBe("");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
  });
  it("BOM UTF-8 et résumé en tête", () => {
    const c = toCsv([["Entreprise", "Éco"]], ["a"], [[1]]);
    expect(c.startsWith("\uFEFFEntreprise;Éco")).toBe(true);
  });
});
