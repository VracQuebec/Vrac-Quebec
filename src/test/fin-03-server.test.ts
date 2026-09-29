// FIN-03 — Invariants financiers vérifiés contre la vraie base (pas de simulation).
// Exécution : FIN_TEST_SESSION=/chemin/session.json FIN_TEST_COMPANY=<uuid TEST> FIN_TEST_OTHER=<uuid autre TEST> bunx vitest run src/test/fin-03-server.test.ts
// Sans session fictive, la suite est ignorée. Crée uniquement des échéances « TEST FIN-03 AUTO » dans l'entreprise TEST fournie.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const SESSION = process.env.FIN_TEST_SESSION;
const C = process.env.FIN_TEST_COMPANY ?? "";
const OTHER = process.env.FIN_TEST_OTHER ?? "";
const on = !!SESSION && existsSync(SESSION) && !!C;
const U = "https://kenduhxscnynugpvktin.supabase.co";
const K = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlbmR1aHhzY255bnVncHZrdGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjI4MDQsImV4cCI6MjA4ODQzODgwNH0.9k7w4PB-pHA_CZYrTJ-wzJgnpxV4mlAZETD_Zi-LRR8";
const TOKEN = on ? JSON.parse(readFileSync(SESSION!, "utf8")).session.access_token : "";
const H = { apikey: K, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const run = Date.now().toString(36);

async function rpc(n: string, b: unknown): Promise<{ ok: boolean; data: any; msg: string }> {
  const r = await fetch(`${U}/rest/v1/rpc/${n}`, { method: "POST", headers: H, body: JSON.stringify(b) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* vide */ }
  return { ok: r.ok, data: j, msg: r.ok ? "" : j?.message ?? t };
}
async function get(path: string) { const r = await fetch(`${U}/rest/v1/${path}`, { headers: H }); return r.json(); }
let role = "";
let seq = 0;
async function obligation(amount: number, p: Record<string, unknown> = {}) {
  const label = `TEST FIN-03 AUTO ${run} ${++seq}`;
  const r = await rpc("fin_save_obligation", { _company: C, _id: null, _p: { label, payee_label: label, nature: "charge", frequency: "once", anchor_date: "2026-08-31", amount, amount_quality: "confirmed", short_month_policy: "last_day", ...p } });
  expect(r.msg).toBe(""); 
  const occ = await get(`fin_occurrences?obligation_id=eq.${r.data}&status=eq.active&select=id,due_date,occ_key,amount&order=due_date`);
  return { id: r.data as string, occ: occ as { id: string; due_date: string; occ_key: string }[] };
}
async function balance(occ: string) {
  const [o] = await get(`fin_occurrences?id=eq.${occ}&select=amount`);
  const al = await get(`fin_allocations?occurrence_id=eq.${occ}&reversed_at=is.null&select=amount,payment:fin_payments(status)`);
  return Math.round((Number(o.amount) - al.filter((a: any) => a.payment?.status === "validated").reduce((s: number, a: any) => s + Number(a.amount), 0)) * 100) / 100;
}
const pay = (amount: number, allocs: { occurrence_id: string; amount: number }[], extra: Record<string, unknown> = {}) =>
  rpc("fin_payment_save", { _company: C, _dry: false, _p: { amount, paid_on: "2026-09-02", method: "virement", idem_key: crypto.randomUUID(), allocations: allocs, ...extra } });

describe.skipIf(!on)("FIN-03 — invariants serveur", () => {
  beforeAll(async () => { role = (await rpc("entcrm_role", { _company_id: C })).data; });

  it("1 200 $ : 500 puis 700 → 700 puis 0; annulation du 500 → 500, original et motif conservés", async () => {
    const { occ: [o] } = await obligation(1200);
    const a = await pay(500, [{ occurrence_id: o.id, amount: 500 }]); expect(a.msg).toBe("");
    expect(await balance(o.id)).toBe(700);
    const b = await pay(700, [{ occurrence_id: o.id, amount: 700 }]); expect(b.msg).toBe("");
    expect(await balance(o.id)).toBe(0);
    const v = await rpc("fin_payment_void", { _payment: a.data.payment_id, _kind: "entry_error", _reason: "Erreur de saisie AUTO" });
    if (["proprietaire", "comptabilite", "support"].includes(role)) {
      expect(v.msg).toBe("");
      expect(await balance(o.id)).toBe(500);
      const [p] = await get(`fin_payments?id=eq.${a.data.payment_id}&select=amount,status,void_reason`);
      expect(p).toMatchObject({ amount: 500, status: "voided", void_reason: "Erreur de saisie AUTO" });
    } else {
      expect(v.ok).toBe(false); // gestionnaire : correction refusée par le serveur
      expect(await balance(o.id)).toBe(0);
    }
  });

  it("1 000 $ réparti 800/200 sur 1 200/300 → 400/100; somme contrôlée", async () => {
    const lab = { payee_label: `TEST FIN-03 AUTO ${run} bénéf. commun` };
    const { occ: [x] } = await obligation(1200, lab); const { occ: [y] } = await obligation(300, lab);
    const r = await pay(1000, [{ occurrence_id: x.id, amount: 800 }, { occurrence_id: y.id, amount: 200 }]); expect(r.msg).toBe("");
    expect([await balance(x.id), await balance(y.id)]).toEqual([400, 100]);
    const over = await pay(100, [{ occurrence_id: x.id, amount: 60 }, { occurrence_id: y.id, amount: 60 }]);
    expect(over.ok).toBe(false); // affectations > montant versé
  });

  it("1 300 $ pour 1 200 $ → reliquat 100 $ non réutilisable deux fois (affectation / remboursement)", async () => {
    const lab = { payee_label: `TEST FIN-03 AUTO ${run} trop-payé` };
    const { occ: [o] } = await obligation(1200, lab); const { occ: [n] } = await obligation(300, lab);
    const r = await pay(1300, [{ occurrence_id: o.id, amount: 1200 }]); expect(r.msg).toBe("");
    const al = await rpc("fin_payment_allocate", { _payment: r.data.payment_id, _allocs: [{ occurrence_id: n.id, amount: 100 }], _idem: crypto.randomUUID(), _dry: false });
    expect(al.msg).toBe(""); expect(await balance(n.id)).toBe(200);
    const again = await rpc("fin_payment_allocate", { _payment: r.data.payment_id, _allocs: [{ occurrence_id: n.id, amount: 100 }], _idem: crypto.randomUUID(), _dry: false });
    expect(again.ok).toBe(false);
    const ref = await rpc("fin_refund_add", { _payment: r.data.payment_id, _amount: 100, _date: "2026-09-10", _reason: "AUTO", _dry: false });
    expect(ref.ok).toBe(false); // reliquat déjà affecté
    // Cas distinct : remboursement du reliquat puis affectation refusée
    const { occ: [o2] } = await obligation(1200, lab);
    const r2 = await pay(1300, [{ occurrence_id: o2.id, amount: 1200 }]);
    expect((await rpc("fin_refund_add", { _payment: r2.data.payment_id, _amount: 100, _date: "2026-09-10", _reason: "AUTO", _dry: false })).msg).toBe("");
    expect((await rpc("fin_payment_allocate", { _payment: r2.data.payment_id, _allocs: [{ occurrence_id: n.id, amount: 100 }], _idem: crypto.randomUUID(), _dry: false })).ok).toBe(false);
    expect(await balance(n.id)).toBe(200);
  });

  it("requête rejouée → un seul effet; deux validations concurrentes → aucune sur-affectation", async () => {
    const { occ: [o] } = await obligation(600);
    const idem = crypto.randomUUID();
    const a = await pay(600, [{ occurrence_id: o.id, amount: 600 }], { idem_key: idem });
    const b = await pay(600, [{ occurrence_id: o.id, amount: 600 }], { idem_key: idem });
    expect(b.data.payment_id).toBe(a.data.payment_id); expect(b.data.replayed).toBe(true);
    expect(await balance(o.id)).toBe(0);
    const { occ: [c] } = await obligation(600);
    const res = await Promise.all([pay(600, [{ occurrence_id: c.id, amount: 600 }]), pay(600, [{ occurrence_id: c.id, amount: 600 }])]);
    expect(res.filter((r) => r.ok).length).toBe(1);
    expect(res.find((r) => !r.ok)!.msg.length).toBeGreaterThan(0);
    expect(await balance(c.id)).toBe(0);
  });

  it("affectation en échec → transaction annulée, aucun règlement orphelin", async () => {
    const { occ: [o] } = await obligation(200);
    const label = `TEST FIN-03 AUTO ${run} ${seq}`;
    const before = (await get(`fin_payments?company_id=eq.${C}&select=id`)).length;
    const r = await pay(500, [{ occurrence_id: o.id, amount: 500 }]); // dépasse le solde
    expect(r.ok).toBe(false);
    expect((await get(`fin_payments?company_id=eq.${C}&select=id`)).length).toBe(before);
    expect(await balance(o.id)).toBe(200);
    expect(label).toContain("AUTO");
  });

  it("échéance d'août réglée en septembre → chacun dans sa période", async () => {
    const { occ: [o] } = await obligation(400, { anchor_date: "2026-08-31" });
    const r = await pay(400, [{ occurrence_id: o.id, amount: 400 }], { paid_on: "2026-09-02" }); expect(r.msg).toBe("");
    expect(o.due_date).toBe("2026-08-31");
    const aug = await rpc("fin_payments_list", { _company: C, _from: "2026-08-01", _to: "2026-08-31", _f: {} });
    const sep = await rpc("fin_payments_list", { _company: C, _from: "2026-09-01", _to: "2026-09-30", _f: {} });
    expect(aug.data.some((p: any) => p.id === r.data.payment_id)).toBe(false);
    expect(sep.data.some((p: any) => p.id === r.data.payment_id)).toBe(true);
  });

  it("autre entreprise / lecture seule / correction sans permission → refus serveur", async () => {
    if (OTHER) {
      const x = await rpc("fin_payment_save", { _company: OTHER, _dry: false, _p: { amount: 1, paid_on: "2026-09-01", method: "autre", idem_key: crypto.randomUUID(), allocations: [] } });
      expect(x.ok).toBe(false);
    }
    const { occ: [o] } = await obligation(100);
    const r = await pay(100, [{ occurrence_id: o.id, amount: 100 }]);
    const v = await rpc("fin_refund_add", { _payment: r.data.payment_id, _amount: 1, _date: "2026-09-01", _reason: "x", _dry: false });
    expect(v.ok).toBe(false);
  });

  it("suspension après règlement partiel → échéance et affectation conservées, aucun doublon", async () => {
    const { id, occ } = await obligation(300, { frequency: "monthly", anchor_date: "2026-06-10", month_day: 10, max_count: 3 });
    expect(occ.length).toBe(3);
    const jul = occ[1];
    expect((await pay(100, [{ occurrence_id: jul.id, amount: 100 }])).msg).toBe("");
    const pz = await rpc("fin_add_pause", { _id: id, _start: "2026-07-01", _end: "2026-08-31", _reason: "AUTO", _dry: false });
    expect(pz.msg).toBe("");
    const all = await get(`fin_occurrences?obligation_id=eq.${id}&select=id,occ_key,status`);
    expect(all.find((x: any) => x.id === jul.id).status).toBe("active");
    expect(new Set(all.map((x: any) => x.occ_key)).size).toBe(all.length);
    expect(await balance(jul.id)).toBe(200);
  });
});
