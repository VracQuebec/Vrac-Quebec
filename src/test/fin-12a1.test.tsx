// FIN-12A1 — crédits fournisseurs et échéances inconnues : affichage, saisie conservée, bascule d'entreprise.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
const sup = [{ client_id: "s1", archived_at: null, client: { id: "s1", name: "Fournisseur A" } }];
const q: any = { select: () => q, eq: () => q, neq: () => q, is: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }), maybeSingle: () => Promise.resolve({ data: null }),
  then: (r: (v: unknown) => unknown) => Promise.resolve({ data: sup, error: null }).then(r) };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => q, auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
import SupplierPurchases from "@/components/finances/SupplierPurchases";
import { creditPayload, emptyCredit } from "@/lib/finances/purchases";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ok = (d: A) => Promise.resolve({ data: d, error: null });
const ov = (name: string, rest: number) => ({ total: 1, totals: { count: 1, confirmed_total: 1200, paid: 300, credited: 200, rest, rest_due_known: 0, rest_due_unknown: rest, overpaid: 0, drafts: 0, tax_incomplete: 0, credit_available: 300 },
  rows: [{ id: "b1", supplier_id: "s1", supplier: name, reference: "INV-1", doc_date: "2026-09-20", due_date: null, due_unknown: true, status: "confirmed", total: 1200, paid: 300, credited: 200, rest, overpaid: 0, tax_status: "detaillee", replaced: false, estimate: null, occurrence_id: "o", file_id: null, created_at: "2026-10-01T23:00:00Z", updated_at: "2026-10-01T23:00:00Z" }] });
const crs = (name: string) => [{ id: "c1", supplier_id: "s1", supplier: name, reference: "CR-" + name, doc_date: "2026-09-25", status: "confirmed", total: 1000, tax_status: "a_completer", linked_bill_id: null, file_id: null, allocated: 700, available: 300, created_at: "2026-10-01T23:00:00Z" }];
beforeEach(() => { h.rpc.mockReset(); localStorage.clear(); });

describe("FIN-12A1 — crédits fournisseurs", () => {
  it("affiche crédits affectés, crédit disponible séparé et reste 700 $ en échéance inconnue", async () => {
    h.rpc.mockImplementation((f: string) => ok(f === "fin_scr_list" ? crs("A") : ov("Fournisseur A", 700)));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect />);
    expect((await screen.findByTestId("rest")).textContent).toMatch(/700,00\s\$/);
    expect(screen.getByTestId("credited").textContent).toMatch(/200,00\s\$/);
    expect(screen.getByTestId("credit-available").textContent).toMatch(/300,00\s\$/);
    expect(screen.getByLabelText("Totaux filtrés").textContent).toMatch(/échéance inconnue 700,00\s\$/);
    expect(await screen.findByText(/disponible 300,00\s\$/)).toBeTruthy();
  });
  it("erreur de sauvegarde d'une note : saisie conservée, aucun montant inventé", async () => {
    h.rpc.mockImplementation((f: string) => f === "fin_scr_save" ? Promise.resolve({ data: null, error: { message: "Failed to fetch" } }) : ok(f === "fin_scr_list" ? [] : ov("Fournisseur A", 900)));
    render(<SupplierPurchases companyId="A" companyName="A" canWrite canCorrect />);
    const btn = await screen.findByText("Ajouter une note de crédit");
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    fireEvent.change(await screen.findByLabelText("Numéro de la note"), { target: { value: "CR-9" } });
    fireEvent.change(screen.getByLabelText("Total du crédit"), { target: { value: "200" } });
    await act(async () => { fireEvent.click(screen.getByText("Enregistrer le brouillon")); });
    expect((await screen.findByRole("alert")).textContent).toMatch(/Failed to fetch.*saisie est conservée/);
    expect((screen.getByLabelText("Numéro de la note") as HTMLInputElement).value).toBe("CR-9");
    expect(JSON.parse(localStorage.getItem("vq.fin12a1.credit.A.new")!).form.total).toBe("200");
  });
  it("bascule A → B : la liste de crédits tardive de A n'apparaît jamais sous B", async () => {
    let lateA: (v: A) => void = () => {};
    h.rpc.mockImplementation((f: string, a: A) => {
      if (f === "fin_scr_list") return a._company === "A" ? new Promise((r) => { lateA = r; }) : ok(crs("B"));
      return ok(ov(a._company === "A" ? "Fournisseur A" : "Fournisseur B", 50));
    });
    const { rerender } = render(<SupplierPurchases key="A" companyId="A" companyName="A" canWrite canCorrect />);
    rerender(<SupplierPurchases key="B" companyId="B" companyName="B" canWrite canCorrect />);
    await screen.findByText("CR-B");
    await act(async () => { lateA({ data: crs("A"), error: null }); await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.queryByText("CR-A")).toBeNull();
  });
  it("montants inconnus restent inconnus (jamais 0)", () => {
    const p = creditPayload({ ...emptyCredit("s1"), total: "200" });
    expect(p.total).toBe(200); expect(p.gst).toBeNull(); expect(p.qst).toBeNull(); expect(p.subtotal).toBeNull();
  });
});
