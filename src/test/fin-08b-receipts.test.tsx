// FIN-08B — test d'interface isolé (services simulés, données fictives) : erreur lisible, reprise, réponses périmées, idempotence.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: h.from } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
import InvoiceReceipts from "@/components/finances/InvoiceReceipts";

const q = (res: unknown) => { const o: any = { select: () => o, eq: () => o, is: () => o, order: () => o, then: (r: any, j: any) => Promise.resolve(res).then(r, j) }; return o; }; // eslint-disable-line @typescript-eslint/no-explicit-any
const sum = (total: number, received: number) => ({ data: { total, legacy: 0, receipts: received, received, rest: total - received, unallocated: 0, paid: received >= total }, error: null });

beforeEach(() => { h.rpc.mockReset(); h.from.mockReset(); h.from.mockImplementation(() => q({ data: [], error: null })); });

describe("FIN-08B Encaissements (interface simulée)", () => {
  it("erreur de résumé : message et reprise, jamais de faux zéro", async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: "panne" } }).mockResolvedValueOnce(sum(1149.75, 400));
    render(<InvoiceReceipts invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} />);
    await screen.findByText(/Encaissements indisponibles/);
    expect(screen.queryByText(/0,00/)).toBeNull();
    fireEvent.click(screen.getByText("Réessayer"));
    await screen.findByText(/reste 749,75/);
  });

  it("réponse périmée d'une autre facture ignorée", async () => {
    let slow!: (v: unknown) => void;
    h.rpc.mockImplementationOnce(() => new Promise((r) => { slow = r; })).mockResolvedValueOnce(sum(500, 0));
    const { rerender } = render(<InvoiceReceipts invoiceId="A" companyId="c1" canWrite onChanged={() => {}} />);
    rerender(<InvoiceReceipts invoiceId="B" companyId="c1" canWrite onChanged={() => {}} />);
    await screen.findByText(/reste 500,00/);
    await act(async () => { slow(sum(1149.75, 400)); });
    expect(screen.queryByText(/749,75/)).toBeNull();
  });

  it("réponse perdue : même clé au réessai; clé et formulaire réinitialisés au changement de facture", async () => {
    const keys: string[] = [];
    h.rpc.mockImplementation((fn: string, a: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (fn === "fin_invoice_receipt_summary") return Promise.resolve(sum(1149.75, 0));
      keys.push(a._idem); return keys.length === 1 ? Promise.reject(new Error("réseau")) : Promise.resolve({ data: { rest: 749.75, unallocated: 0, replayed: false }, error: null });
    });
    const { rerender } = render(<InvoiceReceipts invoiceId="A" companyId="c1" canWrite onChanged={() => {}} />);
    fireEvent.click(await screen.findByText("Enregistrer un encaissement"));
    fireEvent.change(screen.getByPlaceholderText("1149.75"), { target: { value: "400" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    const retry = await screen.findByText("Réessayer le même envoi");
    expect((screen.getByPlaceholderText("1149.75").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true); // champs figés
    fireEvent.click(retry);
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).toBe(keys[1]);
    // nouvelle saisie sur une autre facture : formulaire vide, nouvelle clé
    fireEvent.click(await screen.findByText("Enregistrer un encaissement"));
    fireEvent.change(screen.getByPlaceholderText("1149.75"), { target: { value: "12" } });
    rerender(<InvoiceReceipts invoiceId="B" companyId="c1" canWrite onChanged={() => {}} />);
    fireEvent.click(await screen.findByText("Enregistrer un encaissement"));
    expect((screen.getByPlaceholderText("1149.75") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByPlaceholderText("1149.75"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("clé réutilisée pour une autre requête : refus explicite, aucune transformation silencieuse", async () => {
    h.rpc.mockImplementation((fn: string) => fn === "fin_invoice_receipt_summary" ? Promise.resolve(sum(100, 0))
      : Promise.resolve({ data: null, error: { code: "P0409", message: "Clé de saisie déjà utilisée pour un autre encaissement" } }));
    render(<InvoiceReceipts invoiceId="A" companyId="c1" canWrite onChanged={() => {}} />);
    fireEvent.click(await screen.findByText("Enregistrer un encaissement"));
    fireEvent.change(screen.getByPlaceholderText("100"), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    const { toast } = await import("@/hooks/use-toast");
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/déjà utilisée/) })));
    expect(screen.queryByText("Réessayer le même envoi")).toBeNull();
  });
});
