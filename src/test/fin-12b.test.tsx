// FIN-12B — commandes fournisseurs : engagements séparés des dettes, états de rapprochement, saisie conservée, bascule d'entreprise.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
const sup = [{ client_id: "s1", archived_at: null, client: { id: "s1", name: "Fournisseur A" } }];
const q: any = { select: () => q, eq: () => q, neq: () => q, in: () => q, is: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }), maybeSingle: () => Promise.resolve({ data: null }),
  then: (r: (v: unknown) => unknown) => Promise.resolve({ data: sup, error: null }).then(r) };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => q, auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
import SupplierPurchases from "@/components/finances/SupplierPurchases";
import { lineState, linePayload, emptyLine } from "@/lib/finances/orders";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ok = (d: A) => Promise.resolve({ data: d, error: null });
const bills = { total: 0, rows: [], totals: { count: 2, confirmed_total: 1000, paid: 100, credited: 0, rest: 900, rest_due_known: 900, rest_due_unknown: 0, overpaid: 0, drafts: 0, tax_incomplete: 0 } };
const orders = (num: string, eng: number) => ({ total: 1, totals: { count: 1, engagement_open: eng, engagement_unknown_count: 0, engagement_due_unknown: eng, drafts: 0, confirmed: 1 },
  rows: [{ id: "p1", number: num, supplier_id: "s1", supplier: "Fournisseur A", supplier_ref: null, order_date: "2026-10-01", expected_date: null, status: "confirmed", total: 1000, engagement: eng, engagement_unknown: false, due_unknown: true,
    received_all: true, received_any: true, billed_all: false, billed_any: true, over_any: false, created_at: "2026-10-01T23:00:00Z" }] });
beforeEach(() => { h.rpc.mockReset(); localStorage.clear(); });
const openOrders = async () => { fireEvent.click(await screen.findByRole("tab", { name: "Commandes" })); };

describe("FIN-12B — commandes fournisseurs", () => {
  it("engagements non facturés séparés des factures à payer : 600 + 300 = 900 $ (avec dettes totales 900 $ ici)", async () => {
    h.rpc.mockImplementation((f: string) => ok(f === "fin_po_overview" ? orders("BC-00001", 600) : f === "fin_scr_list" ? [] : { ...bills, totals: { ...bills.totals, rest: 300 } }));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect />);
    await openOrders();
    expect((await screen.findByTestId("engagement-open")).textContent).toMatch(/600,00\s\$/);
    expect(screen.getByTestId("bills-rest").textContent).toMatch(/300,00\s\$/);
    expect(screen.getByTestId("outflows").textContent).toMatch(/900,00\s\$/);
    expect(screen.getByText(/réception : Reçue · facturation : Partiellement facturée/)).toBeTruthy();
  });
  it("erreur réseau sur les commandes : aucun total affiché (jamais 0 $)", async () => {
    h.rpc.mockImplementation((f: string) => f === "fin_po_overview" ? Promise.resolve({ data: null, error: { message: "Failed to fetch" } }) : ok(f === "fin_scr_list" ? [] : bills));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect />);
    await openOrders();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Failed to fetch.*Aucun total/);
    expect(screen.queryByTestId("engagement-open")).toBeNull();
  });
  it("erreur de sauvegarde d'une commande : saisie conservée sur l'appareil", async () => {
    h.rpc.mockImplementation((f: string) => f === "fin_po_save" ? Promise.resolve({ data: null, error: { message: "Failed to fetch" } }) : ok(f === "fin_po_overview" ? orders("BC-1", 0) : f === "fin_scr_list" ? [] : bills));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect />);
    await openOrders();
    const btn = await screen.findByText("Nouvelle commande fournisseur");
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    fireEvent.change(await screen.findByLabelText("Description de la ligne"), { target: { value: "Gravier" } });
    fireEvent.change(screen.getByLabelText("Quantité"), { target: { value: "100" } });
    await act(async () => { fireEvent.click(screen.getByText("Enregistrer le brouillon")); });
    expect((await screen.findByRole("alert")).textContent).toMatch(/Failed to fetch.*saisie est conservée/);
    expect((screen.getByLabelText("Quantité") as HTMLInputElement).value).toBe("100");
    expect(JSON.parse(localStorage.getItem("vq.fin12b.order.A.new")!).form.lines[0].qty).toBe("100");
  });
  it("bascule A → B : la réponse tardive de A n'apparaît jamais sous B", async () => {
    let lateA: (v: A) => void = () => {};
    h.rpc.mockImplementation((f: string, a: A) => {
      if (f === "fin_po_overview") return a._company === "A" ? new Promise((r) => { lateA = r; }) : ok(orders("BC-B", 10));
      return ok(f === "fin_scr_list" ? [] : bills);
    });
    const { rerender } = render(<SupplierPurchases key="A" companyId="A" companyName="A" canWrite canCorrect />);
    await openOrders();
    rerender(<SupplierPurchases key="B" companyId="B" companyName="B" canWrite canCorrect />);
    await openOrders();
    await screen.findByText("BC-B");
    await act(async () => { lateA({ data: orders("BC-A", 999), error: null }); await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.queryByText("BC-A")).toBeNull();
  });
  it("« Conforme » seulement si tout est connu; sinon « À vérifier »; avant réception signalé", () => {
    const base = { line_no: 1, qty: 100, line_total: 1000, accepted: 40, refused: 0, billed: 40, portion: 400, bill_amount: 400, amount_unknown: 0 };
    expect(lineState(base).label).toBe("Conforme (partiel)");
    expect(lineState({ ...base, bill_amount: null, amount_unknown: 1 }).label).toBe("À vérifier");
    expect(lineState({ ...base, line_total: null }).label).toBe("À vérifier");
    expect(lineState({ ...base, accepted: 0 }).label).toBe("Facturé avant réception");
    expect(lineState({ ...base, bill_amount: 420 }).label).toMatch(/Écart de montant 20.00/);
  });
  it("taxes vides restent inconnues (jamais 0)", () => {
    const p = linePayload({ ...emptyLine(), qty: "100", unit_price: "10" });
    expect(p.gst).toBeNull(); expect(p.qst).toBeNull(); expect(p.amount).toBeNull(); expect(p.qty).toBe(100);
  });
});
