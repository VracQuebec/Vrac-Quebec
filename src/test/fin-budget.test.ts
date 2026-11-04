import { describe, expect, it } from "vitest";
import { budgetGap, byMonth, payStatus, summarize } from "@/lib/finances/budgetSchedule";

const today = "2026-11-04";
const o = (p: any) => ({ id: "x", obligation_id: "o", label: "L", payee: null, category: null, frequency: "monthly", planned_override: false, amount_override: false, cancel_reason: null, status: "active", amount_quality: "confirmed", amount: 100, due_date: p.ref_date, planned_date: p.ref_date, ...p });

describe("statut d'échéance", () => {
  it("échéance passée non réglée = en retard, jamais payée", () => expect(payStatus(o({ ref_date: "2026-11-01", settle: "non_reglee" }), today)).toBe("en_retard"));
  it("prélèvement automatique à confirmer passé = en retard, pas payé", () => expect(payStatus(o({ ref_date: "2026-11-03", settle: "a_confirmer" }), today)).toBe("en_retard"));
  it("règlement confirmé = payé", () => expect(payStatus(o({ ref_date: "2026-11-01", settle: "reglee" }), today)).toBe("paye"));
  it("dans 7 jours = à payer", () => expect(payStatus(o({ ref_date: "2026-11-11" }), today)).toBe("a_payer"));
  it("dans 8 jours = à venir", () => expect(payStatus(o({ ref_date: "2026-11-12" }), today)).toBe("a_venir"));
  it("annulée = annulé", () => expect(payStatus(o({ ref_date: "2026-11-01", status: "cancelled" }), today)).toBe("annule"));
});

describe("totaux", () => {
  it("sépare confirmé/estimé, exclut annulées, payé + restant", () => {
    const s = summarize([o({ ref_date: "2026-11-30", paid: 100, balance: 0, settle: "reglee" }), o({ ref_date: "2026-11-30", amount_quality: "estimated", amount: 50, balance: 50 }), o({ ref_date: "2026-11-30", status: "cancelled", amount: 999 })], today);
    expect(s).toMatchObject({ confirmed: 100, estimated: 50, planned: 150, paid: 100, remaining: 50, lateCount: 0 });
  });
  it("fin de mois groupée dans son mois", () => expect(Object.keys(byMonth([o({ ref_date: "2026-02-28" }), o({ ref_date: "2026-03-31" })]))).toEqual(["2026-02", "2026-03"]));
  it("écart négatif = dépassement", () => expect(budgetGap(100, 80, 40)).toBe(-20));
  it("règlement anticipé : l'échéance de décembre payée en novembre compte comme payée dans le budget de décembre", () => {
    const s = summarize([o({ ref_date: "2026-12-31", amount: 250, paid: 250, balance: 0, settle: "reglee" }), o({ ref_date: "2026-12-01", amount: 1200, paid: 0, balance: 1200, settle: "non_reglee" })], today);
    expect(s.paid).toBe(250); expect(s.remaining).toBe(1200); expect(budgetGap(300, s.paid, s.remaining)).toBe(-1150);
  });
});
