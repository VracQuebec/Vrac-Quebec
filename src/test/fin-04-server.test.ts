// FIN-04 — Recherche, agrégats, vues : vérifiés contre la vraie base d'essai (aucune simulation).
// Exécution : FIN_TEST_SESSION=/chemin/session.json FIN_TEST_COMPANY=<uuid TEST> bunx vitest run src/test/fin-04-server.test.ts
// Sans session fictive, la suite est IGNORÉE (et non réussie). Crée uniquement des éléments « TEST FIN-04 AUTO » dans l'entreprise TEST fournie.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const SESSION = process.env.FIN_TEST_SESSION;
const C = process.env.FIN_TEST_COMPANY ?? "";
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
async function rest(method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: { ...H, Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* vide */ }
  return { ok: r.ok, data: j };
}
const YEAR = { _from: "2026-01-01", _to: "2026-12-31" };
async function obligation(label: string, p: Record<string, unknown>) {
  const r = await rpc("fin_save_obligation", { _company: C, _id: null, _p: { label, nature: "charge", frequency: "once", anchor_date: "2026-08-31", amount_quality: "confirmed", short_month_policy: "last_day", ...p } });
  expect(r.msg).toBe("");
  const l = await rpc("fin_list", { _company: C, ...YEAR, _base: "due", _f: { q: label }, _sort: "date_asc", _limit: 100, _offset: 0 });
  return { id: r.data as string, occ: (l.data.rows as any[]).filter((o) => o.obligation_id === r.data) };
}

describe.skipIf(!on)("FIN-04 — serveur", () => {
  let catA = "", catB = "";
  beforeAll(async () => {
    const a = await rest("POST", "fin_categories", { company_id: C, name: `TEST FIN-04 AUTO Entretien ${run}` });
    const b = await rest("POST", "fin_categories", { company_id: C, name: `TEST FIN-04 AUTO Logiciels ${run}` });
    catA = a.data?.[0]?.id; catB = b.data?.[0]?.id;
  });

  it("scénario 4 : 1 000 $ affecté 800 Entretien / 200 Logiciels — compté une fois, part affectée par catégorie", async () => {
    expect(catA && catB).toBeTruthy();
    const payee = `TEST FIN-04 AUTO Fournisseur ${run}`;
    const e = await obligation(`TEST FIN-04 AUTO Entretien ${run}`, { payee_label: payee, amount: 800, category_id: catA });
    const s = await obligation(`TEST FIN-04 AUTO Logiciel ${run}`, { payee_label: payee, amount: 200, category_id: catB });
    const p = await rpc("fin_payment_save", { _company: C, _dry: false, _p: { amount: 1000, paid_on: "2026-09-02", method: "virement", reference: `REF-${run}`, idem_key: crypto.randomUUID(), allocations: [{ occurrence_id: e.occ[0].id, amount: 800 }, { occurrence_id: s.occ[0].id, amount: 200 }] } });
    expect(p.msg).toBe("");
    const all = await rpc("fin_payments_search", { _company: C, _from: "2026-09-02", _to: "2026-09-02", _f: { reference: `REF-${run}` }, _sort: "paid_desc", _limit: 25, _offset: 0 });
    expect(all.data.totals.declared).toBe(1000); expect(all.data.totals.declared_count).toBe(1); expect(all.data.totals.scoped).toBe(false);
    const fa = await rpc("fin_payments_search", { _company: C, _from: "2026-09-02", _to: "2026-09-02", _f: { reference: `REF-${run}`, category_ids: [catA] }, _sort: "paid_desc", _limit: 25, _offset: 0 });
    expect(fa.data.totals.selected).toBe(800); expect(fa.data.totals.declared).toBe(1000); expect(fa.data.rows[0].selected).toBe(800);
    const fb = await rpc("fin_payments_search", { _company: C, _from: "2026-09-02", _to: "2026-09-02", _f: { reference: `REF-${run}`, category_ids: [catB] }, _sort: "paid_desc", _limit: 25, _offset: 0 });
    expect(fb.data.totals.selected).toBe(200);
    const both = await rpc("fin_payments_search", { _company: C, _from: "2026-09-02", _to: "2026-09-02", _f: { reference: `REF-${run}`, category_ids: [catA, catB] }, _sort: "paid_desc", _limit: 25, _offset: 0 });
    expect(both.data.totals.selected).toBe(1000); expect(both.data.total).toBe(1); // OU dans la famille, pas de doublon
    const ex = await rpc("fin_allocations_export", { _company: C, _from: "2026-09-02", _to: "2026-09-02", _f: { reference: `REF-${run}`, category_ids: [catA] }, _limit: 500, _offset: 0 });
    expect(ex.data.length).toBe(2);
    expect(ex.data.filter((r: any) => r.in_selection).reduce((a: number, r: any) => a + Number(r.amount), 0)).toBe(800);
    // Vue échéances : août (date contractuelle), versement en septembre
    const occAug = await rpc("fin_period_totals", { _company: C, _from: "2026-08-01", _to: "2026-08-31", _base: "due", _f: { q: `TEST FIN-04 AUTO Entretien ${run}` } });
    expect(Number(occAug.data.known)).toBe(800); expect(Number(occAug.data.paid_on_these)).toBe(800); expect(Number(occAug.data.remaining)).toBe(0);
    // Recherche insensible aux accents et à la casse
    const acc = await rpc("fin_list", { _company: C, ...YEAR, _base: "due", _f: { q: `test fin-04 auto logiciel ${run}`.toUpperCase().replace("E", "É") }, _sort: "date_asc", _limit: 10, _offset: 0 });
    expect(acc.data.total).toBe(1);
  });

  it("scénario 5 : pagination à tri égal sans doublon, totaux sur toute la sélection", async () => {
    const label = `TEST FIN-04 AUTO Page ${run}`;
    await obligation(label, { payee_label: label, frequency: "monthly", interval_n: 1, anchor_date: "2026-01-15", month_day: 15, amount: 50, max_count: 12 });
    const seen = new Set<string>(); let total = 0;
    for (let off = 0; off < 40; off += 5) {
      const r = await rpc("fin_list", { _company: C, ...YEAR, _base: "due", _f: { q: label }, _sort: "amount_desc", _limit: 5, _offset: off });
      total = r.data.total; r.data.rows.forEach((o: any) => { expect(seen.has(o.id)).toBe(false); seen.add(o.id); });
    }
    expect(total).toBe(12); expect(seen.size).toBe(12);
    const t = await rpc("fin_period_totals", { _company: C, ...YEAR, _base: "due", _f: { q: label } });
    expect(Number(t.data.known)).toBe(600); expect(t.data.count).toBe(12);
  });

  it("scénarios 1–2 : moteur de récurrence (aperçu, rien créé)", async () => {
    const a = await rpc("fin_preview", { _company: C, _p: { frequency: "once", anchor_date: "2027-03-01", amount: 12000, amount_quality: "confirmed" }, _from: "2027-01-01", _to: "2027-12-31" });
    expect(a.msg).toBe(""); expect(a.data.count).toBe(1); expect(Number(a.data.confirmed)).toBe(12000);
    const apr = await rpc("fin_preview", { _company: C, _p: { frequency: "once", anchor_date: "2027-03-01", amount: 12000, amount_quality: "confirmed" }, _from: "2027-04-01", _to: "2027-04-30" });
    expect(apr.data.count).toBe(0);
    const b = await rpc("fin_preview", { _company: C, _p: { frequency: "every_n_days", interval_n: 14, anchor_date: "2026-01-01", amount: 100, amount_quality: "confirmed" }, _from: "2026-01-01", _to: "2026-12-31" });
    expect(b.msg).toBe(""); expect(b.data.count).toBe(27); expect(Number(b.data.confirmed)).toBe(2700);
  });

  it("scénario 7 : inconnu, zéro et estimation comptés séparément", async () => {
    const base = `TEST FIN-04 AUTO Qualité ${run}`;
    await obligation(`${base} inconnu`, { payee_label: base, amount: null, amount_quality: "unknown" });
    await obligation(`${base} zéro`, { payee_label: base, amount: 0 });
    await obligation(`${base} estimé`, { payee_label: base, amount: 75, amount_quality: "estimated" });
    const t = await rpc("fin_period_totals", { _company: C, ...YEAR, _base: "due", _f: { q: base } });
    expect(t.data.count).toBe(3); expect(t.data.unknown_count).toBe(1); expect(Number(t.data.estimated)).toBe(75); expect(Number(t.data.known)).toBe(75);
    const z = await rpc("fin_list", { _company: C, ...YEAR, _base: "due", _f: { q: base, quality: "zero" }, _sort: "date_asc", _limit: 10, _offset: 0 });
    expect(z.data.total).toBe(1);
    const srt = await rpc("fin_list", { _company: C, ...YEAR, _base: "due", _f: { q: base }, _sort: "amount_asc", _limit: 10, _offset: 0 });
    expect(srt.data.rows[srt.data.rows.length - 1].amount_quality).toBe("unknown"); // inconnu toujours en dernier
  });

  it("scénario 8 : droits — entreprise inconnue refusée, vue d'équipe réservée", async () => {
    const x = await rpc("fin_payments_search", { _company: crypto.randomUUID(), _from: "2026-01-01", _to: "2026-12-31", _f: {}, _sort: "paid_desc", _limit: 5, _offset: 0 });
    expect(x.ok).toBe(false);
    const role = (await rpc("entcrm_role", { _company_id: C })).data;
    const mine = await rest("POST", "fin_saved_views", { company_id: C, context: "occ", name: `TEST FIN-04 AUTO vue ${run}`, params: { ctx: "occ", period: { kind: "month" } } });
    expect(mine.ok).toBe(["proprietaire", "gestionnaire", "comptabilite", "support"].includes(role));
    const team = await rest("POST", "fin_saved_views", { company_id: C, context: "occ", name: `TEST FIN-04 AUTO équipe ${run}`, shared: true, params: {} });
    expect(team.ok).toBe(["proprietaire", "comptabilite", "support"].includes(role));
    if (mine.ok) { const d = await rest("DELETE", `fin_saved_views?id=eq.${mine.data[0].id}`); expect(d.ok).toBe(true); }
    if (team.ok) await rest("DELETE", `fin_saved_views?id=eq.${team.data[0].id}`);
  });
});
