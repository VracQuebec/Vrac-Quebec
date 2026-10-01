// FIN-09C2B2B2A — analyse lecture seule (écran simulé).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
const au = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/useAuthReady", () => ({ useAuthReady: () => ({ user: au.user, isReady: true }) }));
import ConstructionPayAnalysisTest from "@/components/finances/ConstructionPayAnalysisTest";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const base = { label: "Analyse TEST — aucune annulation ni modification fiscale", is_test: true, invoice_number: "F-1", invoice_status: "emise", retention_status: "active", rev: 4,
  payment: { amount: 4.48, paid_on: "2026-09-10" }, receipt: { amount: 4.48, received_on: "2026-09-10", reference: "B" }, contractual_due: "2026-09-20",
  snapshot: { base: 100, gst: 5, qst: 9.98, ttc: 114.98 }, position: { rest: 110.5, held: 110.5, current_due: 0 }, later_tax_events: [], later_payments: [], corrections: [], missing: [], ambiguities: [] };
beforeEach(() => { h.rpc.mockReset(); au.user = { id: "u1" }; });
const ok = (d: A) => Promise.resolve({ data: d, error: null });

describe("FIN-09C2B2B2A — analyse", () => {
  it("paiement avant échéance + événement lié : raisons affichées, aucune action financière, seul RPC lecture", async () => {
    h.rpc.mockImplementation(() => ok({ ...base, route: "refused", reasons: ["Paiement antérieur à l'échéance contractuelle", "Un événement fiscal est lié à ce paiement"],
      linked_tax_events: [{ source: "paiement", exigible_on: "2026-09-10", base: 3.9, gst: 0.19, qst: 0.39, ttc: 4.48, cum_ttc: 4.48 }] }));
    render(<ConstructionPayAnalysisTest rel={{ id: "l1" }} companyId="c1" />);
    fireEvent.click(screen.getByText(/Analyser la correction/));
    const r = await screen.findByTestId("pcorr-analysis-result");
    expect(r.textContent).toMatch(/Analyse TEST — aucune annulation ni modification fiscale/);
    expect(screen.getByTestId("pcorr-reasons").textContent).toMatch(/échéance contractuelle/);
    expect(r.textContent).toMatch(/TPS 0,19/);
    expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.queryByText(/Je confirme/)).toBeNull();
    expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(["fin_ctax_pcorr_analyze"]);
  });
  it("cas B2B1 : routé vers le parcours existant", async () => {
    h.rpc.mockImplementation(() => ok({ ...base, route: "b2b1", reasons: [], linked_tax_events: [] }));
    render(<ConstructionPayAnalysisTest rel={{ id: "l1" }} companyId="c1" />);
    fireEvent.click(screen.getByText(/Analyser la correction/));
    expect((await screen.findByTestId("pcorr-analysis-result")).textContent).toMatch(/Cas admis par B2B1/);
  });
  it("données manquantes jamais affichées comme 0; ambiguïté expliquée", async () => {
    h.rpc.mockImplementation(() => ok({ ...base, route: "refused", reasons: ["Ordre ambigu"], snapshot: null, contractual_due: null, receipt: null, linked_tax_events: [],
      missing: ["Échéance contractuelle figée absente"], ambiguities: ["Autre paiement/libération actif de même date et même horodatage"] }));
    render(<ConstructionPayAnalysisTest rel={{ id: "l1" }} companyId="c1" />);
    fireEvent.click(screen.getByText(/Analyser la correction/));
    const r = await screen.findByTestId("pcorr-analysis-result");
    expect(r.textContent).toMatch(/base non disponible/); expect(r.textContent).not.toMatch(/0,00/);
    expect(screen.getByTestId("pcorr-missing")).toBeTruthy(); expect(screen.getByTestId("pcorr-amb")).toBeTruthy();
  });
  it("refus autre tenant affiché", async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: "Accès refusé", code: "42501" } }));
    render(<ConstructionPayAnalysisTest rel={{ id: "l1" }} companyId="c1" />);
    fireEvent.click(screen.getByText(/Analyser la correction/));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Accès refusé/);
  });
  it("changement de compte pendant la requête : réponse ancienne ignorée", async () => {
    let res: (v: A) => void = () => {};
    h.rpc.mockImplementation(() => new Promise((r) => { res = r; }));
    const { rerender } = render(<ConstructionPayAnalysisTest rel={{ id: "l1" }} companyId="c1" />);
    fireEvent.click(screen.getByText(/Analyser la correction/));
    au.user = { id: "u2" }; rerender(<ConstructionPayAnalysisTest rel={{ id: "l1" }} companyId="c1" />);
    await act(async () => { res({ data: { ...base, route: "refused", reasons: ["x"], linked_tax_events: [] }, error: null }); });
    expect(screen.queryByTestId("pcorr-analysis-result")).toBeNull();
  });
});
