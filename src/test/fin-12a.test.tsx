// FIN-12A — fournisseurs et achats : bascule d'entreprise, erreur réseau, saisie conservée, montants du document.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
const q: any = { select: () => q, eq: () => q, neq: () => q, is: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }), maybeSingle: () => Promise.resolve({ data: null }) };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => q, auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
import SupplierPurchases from "@/components/finances/SupplierPurchases";
import { taxGap, toPayload, emptyBill, taxComplete } from "@/lib/finances/purchases";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ok = (d: A) => Promise.resolve({ data: d, error: null });
const ov = (sup: string, rest: number, unknown = 0) => ({ total: 1, totals: { count: 1, confirmed_total: 1200, paid: 300, rest, rest_due_known: rest - unknown, rest_due_unknown: unknown, overpaid: 0, drafts: 0, tax_incomplete: 1 },
  rows: [{ id: "b-" + sup, supplier_id: sup, supplier: sup, reference: "INV-77", doc_date: "2026-09-28", due_date: null, status: "confirmed", total: 1200, paid: 300, rest, overpaid: 0, tax_status: "a_completer", replaced: true, estimate: 1000, occurrence_id: "o", file_id: null, created_at: "2026-10-01T23:00:00Z", updated_at: "2026-10-01T23:00:00Z" }] });
beforeEach(() => { h.rpc.mockReset(); localStorage.clear(); });

describe("FIN-12A — liste des achats", () => {
  it("affiche 900 $ à payer, ventilé en échéance inconnue (date fixe des données)", async () => {
    h.rpc.mockImplementation(() => ok(ov("Fournisseur A", 900, 900)));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect />);
    expect((await screen.findByTestId("rest")).textContent).toMatch(/900,00\s\$/);
    expect(screen.getByLabelText("Totaux filtrés").textContent).toMatch(/échéance inconnue 900,00\s\$/);
    expect(screen.getByText(/remplace une estimation de 1\s?000,00\s\$/)).toBeTruthy();
  });
  it("bascule A → B avec réponse tardive de A : rien de A sous B", async () => {
    let resolveA: (v: A) => void = () => {};
    h.rpc.mockImplementation((_f: string, a: A) => a._company === "A" ? new Promise((r) => { resolveA = r; }) : ok(ov("Fournisseur B", 50)));
    const { rerender } = render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect />);
    rerender(<SupplierPurchases companyId="B" companyName="B" canWrite canCorrect />);
    await screen.findByText("Fournisseur B");
    await act(async () => { resolveA({ data: ov("Fournisseur A", 900), error: null }); await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.queryByText("Fournisseur A")).toBeNull();
    expect(screen.getByTestId("rest").textContent).toMatch(/50,00\s\$/);
  });
  it("erreur réseau : état d'erreur, jamais un solde à 0", async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: "Failed to fetch" } }));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Failed to fetch/);
    expect(screen.queryByTestId("rest")).toBeNull();
    expect(screen.queryByText(/0,00\s\$/)).toBeNull();
  });
});

describe("FIN-12A — saisie", () => {
  it("erreur de sauvegarde : saisie conservée à l'écran et sur l'appareil", async () => {
    localStorage.setItem("vq.fin12a.bill.A.new", JSON.stringify({ form: { ...emptyBill("s1"), reference: "INV-9", total: "1200" }, createKey: "k-1" }));
    h.rpc.mockImplementation((fn: string) => fn === "fin_bill_save" ? Promise.resolve({ data: null, error: { message: "Failed to fetch" } }) : fn === "fin_bill_dups" ? ok({ exact: [], probable: [] }) : ok({ total: 0, totals: {}, rows: [] }));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect initialOcc="occ-1" />);
    fireEvent.click(await screen.findByText("Enregistrer le brouillon"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Votre saisie est conservée/);
    expect((screen.getByLabelText("Référence") as HTMLInputElement).value).toBe("INV-9");
    expect(JSON.parse(localStorage.getItem("vq.fin12a.bill.A.new")!).form.total).toBe("1200");
    const call = h.rpc.mock.calls.find((c) => c[0] === "fin_bill_save")!;
    expect(call[1]._create_key).toBe("k-1"); // même clé à la reprise : aucun deuxième brouillon
  });
  it("doublon exact signalé avec lien vers le document existant", async () => {
    localStorage.setItem("vq.fin12a.bill.A.new", JSON.stringify({ form: { ...emptyBill("s1"), reference: "INV-77", total: "1200" }, createKey: "k-2" }));
    h.rpc.mockImplementation((fn: string) => fn === "fin_bill_dups" ? ok({ exact: [{ id: "x", reference: "INV-77", status: "confirmed", total: 1200, doc_date: "2026-09-28", why: "reference" }], probable: [] })
      : fn === "fin_bill_save" ? Promise.resolve({ data: null, error: { message: "refus" } }) : ok({ total: 0, totals: {}, rows: [] }));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect initialOcc="o" />);
    fireEvent.click(await screen.findByText("Enregistrer le brouillon"));
    await waitFor(() => expect(screen.getByText("Déjà enregistré")).toBeTruthy());
    expect(screen.getByText("Ouvrir le document existant")).toBeTruthy();
  });
  it("montants du document conservés; taxes inconnues jamais mises à zéro", () => {
    const f = { ...emptyBill("s"), total: "1200" };
    expect(taxComplete(f)).toBe(false);
    expect(toPayload(f)).toMatchObject({ total: 1200, gst: null, qst: null, subtotal: null });
    expect(taxGap({ ...f, subtotal: "1000", gst: "50", qst: "99.75" })).toBe(50.25);
    expect(taxGap(f)).toBeNull();
  });
});
