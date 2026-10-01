// FIN-09A correctifs — tests isolés (services simulés, données fictives) : saisie fr-CA, aperçu invalidé, révision/empreinte,
// conflit sans réémission automatique, rafraîchissement du solde dans la fiche ouverte, PDF multipage.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: h.from, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
import CreditNotes, { creditItems, parseDecimal } from "@/components/finances/CreditNotes";
import Invoices from "@/components/finances/Invoices";
import { renderCreditNotePdf } from "@/lib/finances/creditNotePdf";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = (list: unknown, single?: unknown) => { const o: A = {}; for (const m of ["select", "eq", "is", "order", "lte", "limit", "in"]) o[m] = () => o;
  o.maybeSingle = () => Promise.resolve({ data: single ?? null, error: null }); o.single = o.maybeSingle; o.then = (r: A, j: A) => Promise.resolve({ data: list, error: null }).then(r, j); return o; };
const inv = { id: "A", number: "F-00001", is_test: true, lines: [{ desc: "Remblai TEST", qty: 10, unit: "t", price: 100, tax: "taxable" }] };
const preview = { taxable_base: 200, zero_rated_base: 0, exempt_base: 0, gst: 10, qst: 19.95, total: 229.95, errors: [], lines: [], available: { total: 1149.75, taxable_base: 1000, gst: 50, qst: 99.75 } };

beforeEach(() => { h.rpc.mockReset(); h.from.mockReset(); h.from.mockImplementation(() => q([])); });

async function openAmount(value: string) {
  fireEvent.click(await screen.findByText("Créer une note de crédit"));
  fireEvent.change(screen.getByLabelText("Motif"), { target: { value: "Rabais TEST" } });
  fireEvent.click(screen.getByLabelText(/Par montant/));
  fireEvent.change(screen.getByLabelText("Base taxable"), { target: { value } });
  fireEvent.click(screen.getByText(/Aperçu/));
}

describe("FIN-09A correctifs — saisie", () => {
  it("décimales fr-CA : 200,50 et 0,5; invalide jamais converti en 0", () => {
    expect(parseDecimal("200,50")).toBe(200.5); expect(parseDecimal("0,5")).toBe(0.5); expect(parseDecimal("1 234,5")).toBe(1234.5);
    expect(parseDecimal("")).toBeNull(); expect(Number.isNaN(parseDecimal("abc"))).toBe(true); expect(Number.isNaN(parseDecimal("-3"))).toBe(true);
    const f = { reason: "x", qty: {}, taxable: "", zero_rated: "", exempt: "" };
    expect(creditItems({ ...f, mode: "amount", taxable: "200,50" })).toEqual({ ok: true, items: { mode: "amount", taxable: 200.5, zero_rated: 0, exempt: 0 } });
    expect(creditItems({ ...f, mode: "lines", qty: { 0: "0,5", 1: "" } })).toEqual({ ok: true, items: { mode: "lines", lines: [{ i: 0, qty: 0.5 }] } });
    expect(creditItems({ ...f, mode: "amount", taxable: "abc" }).ok).toBe(false);
    expect(creditItems({ ...f, mode: "amount", taxable: "1,005" }).ok).toBe(false);
    expect(creditItems({ ...f, mode: "lines", qty: { 0: "x" } }).ok).toBe(false);
    expect(creditItems({ ...f, mode: "balance" })).toEqual({ ok: true, items: { mode: "balance" } });
  });
});

describe("FIN-09A correctifs — aperçu et émission", () => {
  it("toute modification après l'aperçu retire « Émettre »; l'aperçu envoie 200,50 en nombre", async () => {
    h.rpc.mockResolvedValue({ data: { id: "c1", rev: 1, hash: "h1", preview }, error: null });
    render(<CreditNotes invoice={inv} companyId="c1" canWrite onChanged={() => {}} />);
    await openAmount("200,50");
    await screen.findByText(/Émettre la note de crédit/);
    expect(h.rpc.mock.calls[0][1]._items).toEqual({ mode: "amount", taxable: 200.5, zero_rated: 0, exempt: 0 });
    fireEvent.change(screen.getByLabelText("Motif"), { target: { value: "Autre motif" } });
    expect(screen.queryByText(/Émettre la note de crédit/)).toBeNull();
    expect(screen.getByText(/Aucun aperçu à jour/)).toBeTruthy();
  });

  it("réponse perdue : même clé, révision et empreinte au réessai", async () => {
    const calls: A[] = [];
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_credit_save") return Promise.resolve({ data: { id: "c1", rev: 3, hash: "h3", preview }, error: null });
      calls.push(a); return calls.length === 1 ? Promise.reject(new Error("réseau")) : Promise.resolve({ data: { number: "NC-00001", replayed: true, balance: { rest: 519.8 } }, error: null });
    });
    render(<CreditNotes invoice={inv} companyId="c1" canWrite onChanged={() => {}} />);
    await openAmount("200");
    fireEvent.click(await screen.findByText(/Émettre la note de crédit/));
    fireEvent.click(await screen.findByText("Réessayer la même émission"));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]).toMatchObject({ _expect_rev: 3, _expect_hash: "h3", _expect_total: 229.95 });
  });

  it("conflit P0409 (brouillon modifié ailleurs) : aucun nouvel aperçu ni nouvelle émission automatique", async () => {
    h.rpc.mockImplementation((fn: string) => fn === "fin_credit_save"
      ? Promise.resolve({ data: { id: "c1", rev: 1, hash: "h1", preview }, error: null })
      : Promise.resolve({ data: null, error: { code: "P0409", message: "Brouillon modifié depuis l'aperçu (révision 2)" } }));
    render(<CreditNotes invoice={inv} companyId="c1" canWrite onChanged={() => {}} />);
    await openAmount("200");
    fireEvent.click(await screen.findByText(/Émettre la note de crédit/));
    await screen.findByText(/Conflit : Brouillon modifié/);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(["fin_credit_save", "fin_credit_issue"]);
    expect(screen.queryByText(/Émettre la note de crédit/)).toBeNull();
  });
});

describe("FIN-09A correctifs — fiche ouverte", () => {
  it("émettre l'avoir 229,95 met à jour la fiche déjà ouverte : net à recevoir 519,80", async () => {
    let credited = false;
    const invoice = { id: "A", company_id: "co", status: "emise", number: "F-00001", is_test: true, total: 1149.75, issued_at: "2026-10-01T04:00:00Z", lines: inv.lines,
      tax_snapshot: { taxable_base: 1000, zero_rated_base: 0, exempt_base: 0, pre_tax: 1000, gst: 50, qst: 99.75, total: 1149.75, gst_rate: 0.05, qst_rate: 0.09975, gst_status: "inscrit", qst_status: "inscrit" },
      seller_snapshot: {}, template_snapshot: { version: 1 }, fin_expected_inflows: { id: "e1", amount: 1149.75, received: 400, archived_at: null } };
    h.from.mockImplementation((t: string) => t === "fin_invoices" ? q([], invoice) : q([]));
    h.rpc.mockImplementation((fn: string) => {
      if (fn === "fin_invoice_receipt_summary") return Promise.resolve({ data: credited
        ? { total: 1149.75, credits: 229.95, net: 919.8, legacy: 0, receipts: 400, collected: 400, received: 400, rest: 519.8, unallocated: 0, paid: false }
        : { total: 1149.75, credits: 0, net: 1149.75, legacy: 0, receipts: 400, collected: 400, received: 400, rest: 749.75, unallocated: 0, paid: false }, error: null });
      if (fn === "fin_credit_save") return Promise.resolve({ data: { id: "c1", rev: 1, hash: "h1", preview }, error: null });
      if (fn === "fin_credit_issue") { credited = true; return Promise.resolve({ data: { number: "NC-00001", replayed: false, balance: { rest: 519.8 } }, error: null }); }
      return Promise.resolve({ data: null, error: null });
    });
    render(<MemoryRouter initialEntries={["/?facture=A"]}><Invoices companyId="co" companyName="TEST" canWrite /></MemoryRouter>);
    await screen.findAllByText(/749,75/);
    await openAmount("200");
    fireEvent.click(await screen.findByText(/Émettre la note de crédit/));
    await waitFor(() => expect(screen.getByText(/net à recevoir 519,80/)).toBeTruthy());
    expect(screen.getByText(/notes de crédit − 229,95/)).toBeTruthy();
    expect(screen.queryByText(/net à recevoir 749,75/)).toBeNull();
  });
});

describe("FIN-09A correctifs — PDF", () => {
  it("motif et descriptions longs : plusieurs pages, en-tête du tableau répété", () => {
    const long = "Retour partiel de matériaux TEST non conformes au devis, constaté sur chantier fictif. ".repeat(30);
    const lines = Array.from({ length: 40 }, (_, i) => ({ desc: `Ligne ${i + 1} ${"description détaillée ".repeat(i % 5 === 0 ? 40 : 2)}`, unit: "t", qty: 1, tax: "taxable", gross: 1, base: 1 }));
    const doc = renderCreditNotePdf({ status: "emise", isTest: true, number: "NC-00009", issuedAt: "2026-10-01T04:00:00Z", reason: long,
      seller: { legal_name: "Entreprise TEST inc.", gst_number: "123456789RT0001", qst_number: "1234567890TQ0001" }, client: { name: "Client TEST" },
      invoice: { number: "F-00001", issue_date: "2026-10-01", total: 1149.75 }, template: {},
      credit: { mode: "lines", lines, taxable_base: 40, zero_rated_base: 0, exempt_base: 0, pre_tax: 40, gst: 2, qst: 3.99, total: 45.99, gst_rate: 0.05, qst_rate: 0.09975, gst_status: "inscrit", qst_status: "inscrit" } });
    const pages = doc.getNumberOfPages(); expect(pages).toBeGreaterThan(3);
    const raw = doc.output(); expect((raw.match(/Description cr/g) ?? []).length).toBeGreaterThanOrEqual(pages - 1);
  });
});
