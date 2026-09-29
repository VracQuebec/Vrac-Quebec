import { describe, it, expect } from "vitest";
import { monthlyDate, previewMonthly, periodBounds, totals, addDays } from "@/lib/finances/period";

describe("FIN-01 — récurrence mensuelle et périodes", () => {
  it("31 janvier → dernier jour de février → 31 mars", () => {
    expect(previewMonthly("2027-01-31", 31, 3)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(monthlyDate("2028-01-31", 31, 1)).toBe("2028-02-29");
  });
  it("fin de série incluse", () => {
    expect(previewMonthly("2026-10-15", 15, 10, "2026-12-15")).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
  });
  it("bornes calendaires exactes", () => {
    expect(periodBounds("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds("quarter", "2026-11-03")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodBounds("year", "2026-05-05")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(periodBounds("week", "2026-10-01")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("totaux : annulées exclues, à compléter compté à part (jeu Entreprise A, octobre)", () => {
    const r = [
      { amount: 1200, amount_quality: "confirmed", status: "active" }, { amount: 85, amount_quality: "confirmed", status: "active" },
      { amount: 2400, amount_quality: "confirmed", status: "active" }, { amount: 600, amount_quality: "estimated", status: "active" },
      { amount: null, amount_quality: "unknown", status: "active" },
    ] as const;
    expect(totals(r as any)).toEqual({ confirmed: 3685, estimated: 600, known: 4285, unknown_count: 1, count: 5 });
    const cancelled = r.map((x) => x.amount_quality === "estimated" ? { ...x, status: "cancelled" } : x);
    expect(totals(cancelled as any).known).toBe(3685);
  });
});
