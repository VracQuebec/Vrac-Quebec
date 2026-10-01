// FIN-09A — tests isolés (services simulés, données fictives) : solde net, PDF « NOTE DE CRÉDIT », reprise et idempotence d'émission.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: h.from, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
import CreditNotes, { creditItems } from "@/components/finances/CreditNotes";
import { invoiceState, invoiceRest } from "@/components/finances/Invoices";
import { renderCreditNotePdf } from "@/lib/finances/creditNotePdf";

const q = (res: unknown) => { const o: any = { select: () => o, eq: () => o, is: () => o, order: () => o, then: (r: any, j: any) => Promise.resolve(res).then(r, j) }; return o; }; // eslint-disable-line @typescript-eslint/no-explicit-any
const inv = { id: "A", number: "F-00001", is_test: true, lines: [{ desc: "Remblai TEST", qty: 10, unit: "t", price: 100, tax: "taxable" }] };
const preview = { taxable_base: 200, zero_rated_base: 0, exempt_base: 0, gst: 10, qst: 19.95, total: 229.95, errors: [], available: { total: 1149.75, taxable_base: 1000, gst: 50, qst: 99.75 } };

beforeEach(() => { h.rpc.mockReset(); h.from.mockReset(); h.from.mockImplementation(() => q({ data: [], error: null })); });

describe("FIN-09A solde net", () => {
  it("1149,75 − avoir 229,95 − encaissé 400 = 519,80; soldée par avoir ≠ payée", () => {
    const i = { status: "emise", total: 1149.75, fin_expected_inflows: { received: 400 }, fin_credit_notes: [{ status: "emise", total: 229.95 }, { status: "brouillon", total: null }] };
    expect(invoiceRest(i)).toBeCloseTo(519.8, 2);
    expect(invoiceState({ ...i, fin_expected_inflows: { received: 0 }, fin_credit_notes: [{ status: "emise", total: 1149.75 }] }, "2026-10-01").label).toBe("Soldée par avoir");
    expect(invoiceState({ ...i, fin_expected_inflows: { received: 919.8 } }, "2026-10-01").label).toMatch(/^Payée/);
  });
  it("éléments du brouillon", () => {
    expect(creditItems({ reason: "x", mode: "lines", qty: { 0: "3", 1: "" }, taxable: "", zero_rated: "", exempt: "" })).toEqual({ mode: "lines", lines: [{ i: 0, qty: 3 }] });
    expect(creditItems({ reason: "x", mode: "amount", qty: {}, taxable: "200", zero_rated: "", exempt: "" })).toEqual({ mode: "amount", taxable: 200, zero_rated: 0, exempt: 0 });
  });
  it("PDF : NOTE DE CRÉDIT, facture source, numéros de taxes, montants", () => {
    const doc = renderCreditNotePdf({ status: "emise", isTest: true, number: "NC-00001", issuedAt: "2026-10-01T04:00:00Z", reason: "Rabais TEST",
      seller: { legal_name: "Entreprise TEST inc.", gst_number: "123456789RT0001", qst_number: "1234567890TQ0001" }, client: { name: "Client TEST" },
      invoice: { number: "F-00001", issue_date: "2026-10-01", total: 1149.75 }, template: {},
      credit: { mode: "amount", lines: [], taxable_base: 200, zero_rated_base: 0, exempt_base: 0, pre_tax: 200, gst: 10, qst: 19.95, total: 229.95, gst_rate: 0.05, qst_rate: 0.09975, gst_status: "inscrit", qst_status: "inscrit" } });
    const raw = doc.output();
    for (const t of ["NOTE DE CR", "F-00001", "NC-00001", "123456789RT0001", "1234567890TQ0001", "Client TEST", "229,95"]) expect(raw).toContain(t);
  });
});

describe("FIN-09A interface (simulée)", () => {
  it("réponse perdue à l'émission : même clé et même montant au réessai, une seule émission", async () => {
    const calls: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    h.rpc.mockImplementation((fn: string, a: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (fn === "fin_credit_save") return Promise.resolve({ data: { id: "c1", preview }, error: null });
      calls.push(a); return calls.length === 1 ? Promise.reject(new Error("réseau")) : Promise.resolve({ data: { number: "NC-00001", replayed: true, balance: { rest: 519.8 } }, error: null });
    });
    render(<CreditNotes invoice={inv} companyId="c1" canWrite onChanged={() => {}} />);
    fireEvent.click(await screen.findByText("Créer une note de crédit"));
    fireEvent.change(screen.getByLabelText("Motif"), { target: { value: "Rabais TEST" } });
    fireEvent.click(screen.getByLabelText(/Par montant/));
    fireEvent.change(screen.getByLabelText("Base taxable"), { target: { value: "200" } });
    fireEvent.click(screen.getByText(/Aperçu/));
    fireEvent.click(await screen.findByText(/Émettre la note de crédit/));
    fireEvent.click(await screen.findByText("Réessayer la même émission"));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1]._issue_key).toBe(calls[0]._issue_key);
    expect(calls[1]._expect_total).toBe(229.95);
  });
  it("erreur de lecture : reprise lisible; réponse d'une autre facture ignorée", async () => {
    let slow!: (v: unknown) => void;
    h.from.mockImplementationOnce(() => q({ data: null, error: { message: "panne" } }));
    const { rerender } = render(<CreditNotes invoice={inv} companyId="c1" canWrite onChanged={() => {}} />);
    await screen.findByText(/Notes de crédit indisponibles/);
    h.from.mockImplementationOnce(() => q(new Promise((r) => { slow = r; }))).mockImplementation(() => q({ data: [], error: null }));
    fireEvent.click(screen.getByText("Réessayer"));
    rerender(<CreditNotes invoice={{ ...inv, id: "B" }} companyId="c1" canWrite onChanged={() => {}} />);
    await screen.findByText("Aucune note de crédit.");
    await act(async () => { slow({ data: [{ id: "x", status: "emise", number: "NC-99", total: 5, credit_snapshot: {} }], error: null }); });
    expect(screen.queryByText("NC-99")).toBeNull();
  });
});
