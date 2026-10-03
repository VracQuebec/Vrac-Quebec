import { describe, it, expect } from "vitest";
import { payCalc } from "@/lib/payroll/engine";
const p = {
  qpp_rate: 0.063, qpp_base_rate: 0.053, qpp_exempt: 3500, qpp_max_pensionable: 74600, qpp2_rate: 0.04, qpp2_ceiling: 85000, qpp2_max: 416,
  qpip_rate: 0.0043, qpip_employer_rate: 0.00602, qpip_max: 103000, ei_rate: 0.013, ei_employer_factor: 1.4, ei_max_insurable: 68900,
  qc_brackets: [[0, 0.14], [54345, 0.19], [108680, 0.24], [132245, 0.2575]], qc_basic: 18952, qc_credit_rate: 0.14, qc_worker_ded_rate: null, qc_worker_ded_max: null,
  fed_brackets: [[0, 0.14], [58523, 0.205], [117045, 0.26], [181440, 0.29], [258482, 0.33]], fed_credit_rate: 0.14, fed_abatement: 0.165,
  fed_bpa: { max: 16452, min: 14829, from: 181440, to: 258482 }, fed_cea: null,
  fss: { low: 1000000, low_rate: 1.65, high: 7800000, high_rate: 4.26, base: 1.2662, slope: 0.3838 }, normes_rate: 0.0006, normes_max: 103000, fdrcmo_threshold: 2000000,
};
const b = { np: 26, sector: "ordinaire" as const, total_payroll: 800000, ccq_applicable: false };
describe("paie 2026 — cotisations selon les paramètres", () => {
  it("paie régulière", () => { const r = payCalc(p, { ...b, regular: 2000 }); expect([r.qpp1, r.ei, r.qpip, r.employer.ei, r.employer.fss]).toEqual([117.52, 26, 8.6, 36.4, 33]); });
  it("faible rémunération sous l'exemption", () => { const r = payCalc(p, { ...b, regular: 120 }); expect([r.qpp1, r.fed_tax, r.qc_tax]).toEqual([0, 0, 0]); });
  it("plafonds RRQ, RRQ2 et AE", () => {
    const r = payCalc(p, { ...b, regular: 4000, ytd: { ins: 72000, qpp1: 4311, ei: 895.7 } });
    expect([r.qpp1, r.qpp2, r.ei]).toEqual([168.3, 56, 0]);
    expect(payCalc(p, { ...b, regular: 4000, ytd: { ins: 84000, qpp1: 4479.3, qpp2: 376 } }).qpp2).toBe(40);
  });
  it("impôt marginal : jamais un seul taux sur le brut, prime au taux marginal", () => {
    const r = payCalc(p, { ...b, regular: 2000, bonus: 5000 }), s = payCalc(p, { ...b, regular: 2000 });
    expect(r.fed_tax - s.fed_tax).toBeCloseTo(r.fed.bonus_tax, 2);
    expect(r.fed.bonus_tax / 5000).toBeGreaterThan(0.14 * 0.835 - 1e-9);
  });
  it("valeurs inconnues signalées manquantes", () => {
    const r = payCalc(p, { ...b, regular: 2000, sector: "inconnu", ccq_applicable: null });
    expect(r.employer.fss).toBeNull(); expect(r.missing).toEqual(expect.arrayContaining(["fss", "cnesst", "ccq", "fed_cea", "qc_worker_deduction"]));
  });
  it("FSS progressif entre 1 M$ et 7,8 M$", () => { expect(payCalc(p, { ...b, regular: 2000, total_payroll: 3000000 }).employer.fss_rate_pct).toBeCloseTo(2.4176, 4); });
});
