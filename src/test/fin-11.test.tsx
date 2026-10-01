// FIN-11 — écran prestataire (simulation) + réserves FIN-10 (bascule d'entreprise, erreur réseau, échéance inconnue).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }) };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => q, auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
import PaymentProviderSim from "@/components/finances/PaymentProviderSim";
import ClientAccounts from "@/components/finances/ClientAccounts";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ok = (d: A) => Promise.resolve({ data: d, error: null });
beforeEach(() => { h.rpc.mockReset(); vi.useRealTimers(); });

const sums = (rest: number, extra: A = {}) => ({ rest, unallocated: 0, not_due: 0, due_today: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90: 0, overdue: 0, due_now: 0, future_ret: 0, partial: false, invoices: 1, ...extra });
const acc = (name: string, rest: number, extra: A = {}) => ({ on: "2026-11-15", currency: "CAD", count: 1, q: "", filter: "all", totals: sums(rest, extra),
  rows: [{ client_key: "c:" + name, client_id: name, client_name: name, ...sums(rest, extra) }] });

describe("FIN-11 — prestataire simulé", () => {
  const tx = { id: "t1", payment_ref: "sim-1", invoice_id: "i1", invoice_number: "F-1", currency: "CAD", gross: 1000, fee: 30, net: 970, status: "succeeded", receipt_id: "r1", receipt_voided: false,
    refunded: 0, returned: 0, disputed: 0, paid_out: 970, review: [], events: [{ id: "e", event_id: "ev1", type: "payment.succeeded", outcome: "applied", note: null, received_at: "2026-09-20T15:00:00Z", payload: {} }] };
  it("affiche « Non connecté — simulation seulement », brut/frais/net et aucun scénario si non autorisé", async () => {
    h.rpc.mockImplementation(() => ok({ connected: false, sim_allowed: false, transactions: [tx, { ...tx, id: "t2", payment_ref: "sim-2", fee: null, net: null, status: "pending", receipt_id: null, paid_out: 0 }], orphans: [] }));
    render(<PaymentProviderSim companyId="A" />);
    expect(screen.getByTestId("psp-status").textContent).toMatch(/Non connecté — simulation seulement/);
    const items = await screen.findAllByTestId("psp-tx");
    expect(items[0].textContent).toMatch(/Brut 1\s?000,00\s\$ · Frais 30,00\s\$ · Net 970,00\s\$/);
    expect(items[1].textContent).toMatch(/Frais inconnus · Net inconnu/);
    expect(items[1].textContent).toMatch(/En cours \(non confirmé\)/);
    expect(screen.queryByTestId("psp-scenario")).toBeNull();
    expect(screen.queryByText("Remboursement")).toBeNull();
    expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(["fin_psp_overview"]);
  });
  it("erreur réseau : message visible, aucun journal vide présenté comme réel", async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: "Failed to fetch" } }));
    render(<PaymentProviderSim companyId="A" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Failed to fetch/);
    expect(screen.queryByText("Aucune transaction.")).toBeNull();
  });
});

describe("FIN-10 — réserves complétées", () => {
  it("bascule A → B avec réponse tardive de A : rien de A sous B", async () => {
    let resolveA: (v: A) => void = () => {};
    h.rpc.mockImplementation((_fn: string, args: A) => args._company === "A" ? new Promise((r) => { resolveA = r; }) : ok(acc("ClientB", 70)));
    const { rerender } = render(<ClientAccounts companyId="A" canWrite />);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    rerender(<ClientAccounts companyId="B" canWrite />);
    await screen.findByText("ClientB");
    await act(async () => { resolveA({ data: acc("ClientA", 500), error: null }); await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByText("ClientA")).toBeNull();
    expect(screen.getByText("ClientB")).toBeTruthy();
  });
  it("erreur réseau : état d'erreur, jamais un solde à 0", async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: "Failed to fetch" } }));
    render(<ClientAccounts companyId="A" canWrite />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Failed to fetch/);
    expect(screen.queryByText(/0,00\s\$/)).toBeNull();
  });
  it("échéance inconnue : montant conservé dans le solde, ventilation indéterminée affichée", async () => {
    h.rpc.mockImplementation(() => ok(acc("Y", 70, { not_due: 50, partial: true })));
    render(<ClientAccounts companyId="A" canWrite />);
    await waitFor(() => expect(screen.getByTestId("ar-unknown-due").textContent).toMatch(/20,00\s\$/));
    expect(screen.getAllByText(/70,00\s\$/).length).toBeGreaterThan(0);
  });
});
