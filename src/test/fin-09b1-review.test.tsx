// FIN-09B1 relecture — tests isolés (services simulés, données fictives) : saisie pendant l'aperçu,
// changement d'entreprise pendant un retour asynchrone, abandon après réponse perdue et après modification distante.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), storage: { from: () => ({}) } } }));
import ProgressPlanDialog from "@/components/finances/ProgressBilling";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const P = (ht: number, gst: number, qst: number, pct?: number) => ({ bt: ht, bz: 0, be: 0, ht, gst, qst, total: Math.round((ht + gst + qst) * 100) / 100, pct });
const contract = { ...P(1000, 50, 99.75), gst_rate: 0.05, qst_rate: 0.09975 };
const sum = (situations: A[] = [], company = "c1") => ({ id: "p1", company_id: company, quote_id: "q1", client_name: "Client TEST", quote_number: "S-1", quote_version: 1, contract, billed: { ht: 0, gst: 0, qst: 0, total: 0 }, situations });
const draft = (v: string, ht: number, rev = 1, hash = "h1") => ({ id: "s1", status: "brouillon", kind: "acompte", mode: "pct", value: v, rev, hash, draft_key: "kd", issue_date: "2026-10-01", due_date: null,
  computed: { contract: P(1000, 50, 99.75), prev: P(0, 0, 0), cum: P(ht, ht * 0.05, ht * 0.09975, Number(v)), new: P(ht, ht * 0.05, Math.round(ht * 9.975) / 100), remaining: { ht: 1000 - ht, total: 0, cap: 1000 - ht } } });
const deferred = <T,>() => { let res!: (v: T) => void; const p = new Promise<T>((r) => { res = r; }); return { p, res }; };

beforeEach(() => { h.rpc.mockReset(); vi.spyOn(window, "alert").mockImplementation(() => {}); });

describe("FIN-09B1 relecture — formulaire et contexte", () => {
  it("saisie bloquée pendant l'aperçu en attente : l'aperçu reçu correspond au cumul envoyé", async () => {
    const d = deferred<A>();
    h.rpc.mockImplementation((fn: string) => fn === "fin_progress_summary" ? Promise.resolve({ data: sum(), error: null }) : d.p);
    render(<ProgressPlanDialog planId="p1" companyId="c1" canWrite onClose={() => {}} onOpenInvoice={() => {}} onChanged={() => {}} />);
    const input = await screen.findByLabelText("Cumul contractuel");
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.click(screen.getByText("Aperçu"));
    await waitFor(() => expect((screen.getByLabelText("Cumul contractuel") as HTMLInputElement).closest("fieldset")!.disabled).toBe(true));
    fireEvent.change(screen.getByLabelText("Cumul contractuel"), { target: { value: "90" } }); // ignorée : mutation en cours
    await act(async () => { d.res({ data: draft("30", 300), error: null }); });
    await screen.findByText("Émettre la facture");
    expect((screen.getByLabelText("Cumul contractuel") as HTMLInputElement).value).toBe("30");
    expect(h.rpc.mock.calls.filter((c) => c[0] === "fin_progress_draft_save").length).toBe(1);
  });

  it("changement d'entreprise pendant l'aperçu : la réponse de l'ancien contexte est ignorée", async () => {
    const d = deferred<A>();
    h.rpc.mockImplementation((fn: string) => fn === "fin_progress_summary" ? Promise.resolve({ data: sum([], "c1"), error: null }) : d.p);
    const r = render(<ProgressPlanDialog planId="p1" companyId="c1" canWrite onClose={() => {}} onOpenInvoice={() => {}} onChanged={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Cumul contractuel"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Aperçu"));
    r.rerender(<ProgressPlanDialog planId="p1" companyId="c2" canWrite onClose={() => {}} onOpenInvoice={() => {}} onChanged={() => {}} />);
    await act(async () => { d.res({ data: draft("30", 300), error: null }); });
    expect(await screen.findByText(/n'appartient pas à l'entreprise sélectionnée/)).toBeTruthy();
    expect(screen.queryByText("Émettre la facture")).toBeNull();
  });
});

describe("FIN-09B1 relecture — abandon", () => {
  it("réponse perdue : réessai avec exactement la même clé, le même motif, la même révision et empreinte", async () => {
    const calls: A[] = [];
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_progress_summary") return Promise.resolve({ data: sum([draft("30", 300, 4, "h4")]), error: null });
      calls.push(a); return calls.length === 1 ? Promise.reject(new Error("réseau")) : Promise.resolve({ data: { ...draft("30", 300, 4, "h4"), status: "abandonnee" }, error: null });
    });
    render(<ProgressPlanDialog planId="p1" companyId="c1" canWrite onClose={() => {}} onOpenInvoice={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText("Abandonner…"));
    fireEvent.change(screen.getByLabelText("Motif de l'abandon"), { target: { value: "Erreur de cumul" } });
    fireEvent.click(screen.getByText("Confirmer l'abandon"));
    fireEvent.click(await screen.findByText("Réessayer l'abandon"));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]).toMatchObject({ _situation: "s1", _reason: "Erreur de cumul", _expect_rev: 4, _expect_hash: "h4" });
  });

  it("brouillon modifié ailleurs : conflit explicite, rechargement, aucun nouvel abandon automatique", async () => {
    let n = 0; let summaries = 0;
    h.rpc.mockImplementation((fn: string) => {
      if (fn === "fin_progress_summary") { summaries++; return Promise.resolve({ data: sum([draft(summaries > 1 ? "40" : "30", 300, summaries > 1 ? 5 : 4, summaries > 1 ? "h5" : "h4")]), error: null }); }
      n++; return Promise.resolve({ data: null, error: { code: "P0409", message: "Brouillon modifié ailleurs depuis son affichage" } });
    });
    render(<ProgressPlanDialog planId="p1" companyId="c1" canWrite onClose={() => {}} onOpenInvoice={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText("Abandonner…"));
    fireEvent.change(screen.getByLabelText("Motif de l'abandon"), { target: { value: "Doublon" } });
    fireEvent.click(screen.getByText("Confirmer l'abandon"));
    expect(await screen.findByText(/Le brouillon actuel a été rechargé/)).toBeTruthy();
    await waitFor(() => expect(summaries).toBeGreaterThan(1));
    expect(n).toBe(1); expect(screen.queryByText("Réessayer l'abandon")).toBeNull();
  });
});
