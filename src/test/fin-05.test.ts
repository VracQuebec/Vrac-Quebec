import { describe, it, expect } from "vitest";
import { applyScenario, forecast, remainingExpected, sourceHash, type Account, type Movement } from "@/lib/finances/treasury";

const A: Account[] = [{ id: "b1", name: "Banque", kind: "bank", currency: "CAD", included: true }, { id: "b2", name: "Épargne", kind: "bank", currency: "CAD", included: true }];
const bal = (amt1: number, amt2 = 0) => [{ account_id: "b1", amount: amt1, as_of: "2026-10-04", source: "relevé" }, { account_id: "b2", amount: amt2, as_of: "2026-10-04", source: "relevé" }];
const mv = (p: Partial<Movement>): Movement => ({ id: Math.random().toString(), date: "2026-10-06", cents: 0, dir: "out", kind: "occurrence", label: "x", ...p });

describe("FIN-05 — trésorerie", () => {
  it("10 000 − dette 700 − 1 000 + 3 000 = 11 300", () => {
    const f = forecast({ from: "2026-10-05", to: "2026-10-31", accounts: A, balances: bal(10000), moves: [
      mv({ cents: 70000, kind: "late", date: "2026-09-20" }), mv({ cents: 100000 }), mv({ cents: 300000, dir: "in", kind: "inflow" })] });
    expect(f.endC).toBe(1130000);
    expect(f.toReplan).toBe(1);
  });
  it("entrée 3 000 dont 1 000 encaissés : reste 2 000", () => expect(remainingExpected(3000, 1000)).toBe(200000));
  it("transfert entre deux comptes inclus : effet nul", () => {
    const f = forecast({ from: "2026-10-05", to: "2026-10-31", accounts: A, balances: bal(500, 500), moves: [mv({ kind: "transfer", cents: 200000, account_id: "b1", transfer_to: "b2" })] });
    expect(f.endC).toBe(100000); expect(f.outC).toBe(0);
  });
  it("point bas −1 000, solde final 3 000", () => {
    const f = forecast({ from: "2026-10-05", to: "2026-10-11", accounts: A, balances: bal(2000), moves: [mv({ date: "2026-10-05", cents: 300000 }), mv({ date: "2026-10-09", cents: 400000, dir: "in", kind: "inflow" })] });
    expect(f.low).toEqual({ date: "2026-10-05", c: -100000 }); expect(f.endC).toBe(300000); expect(f.firstShort).toBe("2026-10-05"); expect(f.neededC).toBe(100000);
  });
  it("réserve virtuelle : solde inchangé, disponible réduit, paiement lié non déduit deux fois", () => {
    const f = forecast({ from: "2026-10-05", to: "2026-10-10", accounts: A, balances: bal(5000), reserves: [{ id: "r", name: "Assurance", target: 1200, reserved: 1000, target_date: "2027-01-01", obligation_id: "o1" }],
      moves: [mv({ date: "2026-10-08", cents: 60000, obligation_id: "o1" })] });
    expect(f.days[0].closeC).toBe(500000); expect(f.days[0].availC).toBe(400000);
    expect(f.endC).toBe(440000); expect(f.days.at(-1)!.availC).toBe(400000);
  });
  it("mouvement déjà inclus dans le solde non recompté; carte hors encaisse; solde absent = inconnu", () => {
    const acc = [...A, { id: "c", name: "Carte", kind: "card", currency: "CAD", included: false } as Account];
    const f = forecast({ from: "2026-10-05", to: "2026-10-10", accounts: acc, balances: bal(1000), moves: [
      mv({ kind: "payment", date: "2026-10-03", cents: 5000 }), mv({ kind: "payment", date: "2026-10-05", cents: 1000 }), mv({ account_id: "c", cents: 9999 })] });
    expect(f.endC).toBe(99000);
    expect(forecast({ from: "2026-10-05", to: "2026-10-06", accounts: A, balances: bal(1000).slice(0, 1), moves: [] }).startC).toBeNull();
  });
  it("scénario : aucune modification des données réelles; empreinte change si la source change", () => {
    const base = [mv({ id: "a", cents: 120000, obligation_id: "o", date: "2026-11-01" }), mv({ id: "i", dir: "in", kind: "inflow", cents: 1000 })];
    const snap = JSON.stringify(base); const h = sourceHash(base);
    const s = applyScenario(base, [{ type: "annual_to_monthly", obligation_id: "o", months: 12 }, { type: "delay_inflow", days: 10 }]);
    expect(JSON.stringify(base)).toBe(snap);
    expect(s.filter((m) => m.dir === "out").reduce((t, m) => t + m.cents!, 0)).toBe(120000);
    expect(sourceHash([...base, mv({ id: "z", cents: 1 })])).not.toBe(h);
  });
});
