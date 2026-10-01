// FIN-09C2B2A — paiement TEST d'une retenue construction : règles pures + écran simulé (services simulés, données fictives).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/useAuthReady", () => ({ useAuthReady: () => ({ user: null, isReady: true }) }));
import { cpayPayload, EMPTY_CPAY } from "@/lib/finances/retention";
import ConstructionPayTest from "@/components/finances/ConstructionPayTest";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ret = (x: A = {}) => ({ id: "r1", rev: 3, rest: 114.98, status: "active", ...x });
const pvData = (hash = "H1") => ({ data: { errors: [], amount: 4.48, paid_on: "2026-09-05", expect_hash: hash, tax: { ttc: 4.48, base: 3.9, gst: 0.19, qst: 0.39, exigible_on: "2026-09-05", date_basis: "paiement" }, after: { retention_rest: 110.5, current_due: 0 } }, error: null });
const writes = () => h.rpc.mock.calls.filter((c) => c[0] === "fin_construction_pay");
beforeEach(() => { h.rpc.mockReset(); });
const fill = (amount = "4,48") => {
  fireEvent.click(screen.getByText(/Paiement reçu sur la retenue/));
  fireEvent.change(screen.getByLabelText("Montant payé"), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText("Date de réception"), { target: { value: "2026-09-05" } });
  fireEvent.change(screen.getByLabelText("Référence de preuve"), { target: { value: "VIR-1" } });
  fireEvent.change(screen.getByLabelText("Motif du paiement"), { target: { value: "Retenue" } });
  fireEvent.click(screen.getByLabelText(/aucun paiement réel/));
};
const preview = async () => { fireEvent.click(screen.getByText("Aperçu du paiement (aucune écriture)")); await screen.findByTestId("cpay-preview"); };
const confirmAndPay = () => { fireEvent.click(screen.getByLabelText(/Je confirme ce paiement/)); fireEvent.click(screen.getByText("Enregistrer le paiement TEST")); };

describe("FIN-09C2B2A — règles pures", () => {
  it("charge utile : fr-CA canonique, jamais 0 implicite, borne restant, TEST obligatoire", () => {
    const ok = cpayPayload({ ...EMPTY_CPAY, amount: "4,48", paid_on: "2026-09-05", reference: "V", reason: "R", test_confirm: true }, 114.98);
    expect(ok).toMatchObject({ ok: true, p: { amount: "4.48", paid_on: "2026-09-05", method: "virement", test_confirm: "oui" } });
    for (const a of ["", "0", "abc", "1,234", "-1"]) expect(cpayPayload({ ...EMPTY_CPAY, amount: a, paid_on: "2026-09-05", reference: "V", reason: "R", test_confirm: true }).ok).toBe(false);
    expect(cpayPayload({ ...EMPTY_CPAY, amount: "114,99", paid_on: "2026-09-05", reference: "V", reason: "R", test_confirm: true }, 114.98).errors[0]).toMatch(/mêlant part courante/);
    expect(cpayPayload({ ...EMPTY_CPAY, amount: "1", paid_on: "2026-09-31", reference: "V", reason: "R", test_confirm: false }).errors.length).toBe(2);
  });
});

describe("FIN-09C2B2A — écran simulé", () => {
  it("aperçu sans écriture; modification après aperçu retire aperçu et confirmation", async () => {
    h.rpc.mockImplementation(() => Promise.resolve(pvData()));
    render(<ConstructionPayTest ret={ret()} companyId="c1" invoiceId="i1" canWrite onDone={() => {}} onReload={() => {}} />);
    fill(); await preview();
    expect(screen.getByTestId("cpay-preview").textContent).toMatch(/TPS 0,19/);
    expect(writes().length).toBe(0);
    fireEvent.change(screen.getByLabelText("Montant payé"), { target: { value: "5" } });
    expect(screen.queryByTestId("cpay-preview")).toBeNull();
    expect(writes().length).toBe(0);
  });

  it("réseau perdu → même clé; références A→B→A → clé A réutilisée; conflit P0409 → saisie conservée + rechargement", async () => {
    let n = 0; const reload = vi.fn();
    h.rpc.mockImplementation((fn: string) => fn === "fin_construction_pay_preview" ? Promise.resolve(pvData())
      : Promise.resolve(++n <= 2 ? { data: null, error: { message: "Réseau" } } : { data: null, error: { message: "Retenue modifiée", code: "P0409" } }));
    render(<ConstructionPayTest ret={ret()} companyId="c1" invoiceId="i1" canWrite onDone={() => {}} onReload={reload} />);
    fill(); await preview(); confirmAndPay(); await screen.findByText("Réseau");
    // B
    fireEvent.change(screen.getByLabelText("Référence de preuve"), { target: { value: "VIR-2" } }); await preview(); confirmAndPay();
    await act(async () => { await Promise.resolve(); });
    // retour A
    fireEvent.change(screen.getByLabelText("Référence de preuve"), { target: { value: "VIR-1" } }); await preview(); confirmAndPay();
    await screen.findByText(/saisie conservée/);
    const k = writes().map((c) => c[1]._key);
    expect(k.length).toBe(3); expect(k[0]).not.toBe(k[1]); expect(k[2]).toBe(k[0]);
    expect((screen.getByLabelText("Montant payé") as HTMLInputElement).value).toBe("4,48");
    expect(reload).toHaveBeenCalled();
    expect(screen.queryByTestId("cpay-preview")).toBeNull();
  });

  it("révision changée après aperçu : confirmation retirée; lecture seule / retenue soldée : aucune action", async () => {
    h.rpc.mockImplementation(() => Promise.resolve(pvData()));
    const r = render(<ConstructionPayTest ret={ret()} companyId="c1" invoiceId="i1" canWrite onDone={() => {}} onReload={() => {}} />);
    fill(); await preview();
    r.rerender(<ConstructionPayTest ret={ret({ rev: 4 })} companyId="c1" invoiceId="i1" canWrite onDone={() => {}} onReload={() => {}} />);
    expect(screen.queryByTestId("cpay-preview")).toBeNull();
    r.unmount();
    const ro = render(<ConstructionPayTest ret={ret()} companyId="c1" invoiceId="i1" canWrite={false} onDone={() => {}} onReload={() => {}} />);
    expect(ro.container.textContent).toBe(""); ro.unmount();
    const z = render(<ConstructionPayTest ret={ret({ rest: 0 })} companyId="c1" invoiceId="i1" canWrite onDone={() => {}} onReload={() => {}} />);
    expect(z.container.textContent).toBe("");
  });

  it("démontage pendant l'enregistrement : aucun rappel tardif", async () => {
    let res!: (v: A) => void; const p = new Promise<A>((r) => { res = r; }); const done = vi.fn();
    h.rpc.mockImplementation((fn: string) => fn === "fin_construction_pay" ? p : Promise.resolve(pvData()));
    const r = render(<ConstructionPayTest ret={ret()} companyId="c1" invoiceId="i1" canWrite onDone={done} onReload={() => {}} />);
    fill(); await preview(); confirmAndPay(); r.unmount();
    await act(async () => { res({ data: { id: "l1" }, error: null }); await p; });
    expect(done).not.toHaveBeenCalled();
  });
});
