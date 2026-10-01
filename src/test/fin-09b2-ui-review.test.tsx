// FIN-09B2 relecture UI — services simulés, promesses contrôlées, données fictives (aucun parcours réel).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), storage: { from: () => ({}) } } }));
import ProgressPlanDialog from "@/components/finances/ProgressBilling";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const P = (ht: number) => ({ bt: ht, bz: 0, be: 0, ht, gst: 0, qst: 0, total: ht });
const am0 = { id: "a1", seq: 1, status: "brouillon", reason: "Roc", changes: [{ id: "L1", qty: "12" }], rev: 3, hash: "h3", draft_key: "dk", from_version: 1, to_version: null,
  approved_at: null, close_reason: null, approval_ref: "Courriel", approval_date: "2026-09-30", approver_name: "M. TEST",
  impact: { cap_before: 1000, cap_after: 1200, billed_cap: 0, delta: { cap: 200 }, changes: [] } };
const sumOf = (id: string, company: string, x: A = {}) => ({ id, company_id: company, quote_id: "q-" + id, client_name: "Client " + id, quote_number: "S-" + id, quote_version: 1,
  contract: { ...P(1000), gst_rate: 0.05, qst_rate: 0.09975 }, billed: { ht: 0, gst: 0, qst: 0, total: 0 }, situations: [], contract_version: 1,
  cap: { t: 1000, z: 0, e: 0, billed_t: 0, billed_z: 0, billed_e: 0, allocated: 0 }, initial: P(1000),
  lines: [{ id: "L1", desc: "Remblai", unit: "t", tax: "taxable", qty: 10, price: 100, amount: 1000, billed_qty: 0, billed_amt: 0 }], milestones: [], amendments: [], versions: [], ...x });
const deferred = () => { let res!: (v: A) => void; const p = new Promise<A>((r) => { res = r; }); return { p, res }; };

beforeEach(() => { h.rpc.mockReset(); vi.spyOn(window, "alert").mockImplementation(() => {}); });
const ui = (p: { planId?: string; companyId?: string; canWrite?: boolean; onChanged?: () => void } = {}) => {
  const props = { planId: "pA", companyId: "c1", canWrite: true, onChanged: () => {}, ...p };
  const el = (q: typeof props) => <ProgressPlanDialog planId={q.planId} companyId={q.companyId} canWrite={q.canWrite} onClose={() => {}} onOpenInvoice={() => {}} onChanged={q.onChanged} />;
  const r = render(el(props));
  return { ...r, update: (q: Partial<typeof props>) => r.rerender(el({ ...props, ...q })) };
};

describe("FIN-09B2 relecture UI — approbation d'un avenant repris", () => {
  it("édition après reprise : approbation impossible jusqu'à l'impact recalculé, puis bon id/rev/hash", async () => {
    let cur: A = am0;
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_progress_summary") return Promise.resolve({ data: sumOf("pA", "c1", { amendments: [cur] }), error: null });
      if (fn === "fin_progress_amend_save") { cur = { ...am0, changes: a._changes, rev: 4, hash: "h4" }; return Promise.resolve({ data: cur, error: null }); }
      return Promise.resolve({ data: { version: 2 }, error: null });
    });
    ui();
    const box = () => screen.getByLabelText(/Je confirme l'accord du client/) as HTMLInputElement;
    const approveBtn = () => screen.getByText("Approuver").closest("button") as HTMLButtonElement;
    fireEvent.click(await screen.findByLabelText(/Je confirme l'accord du client/));
    expect(approveBtn().disabled).toBe(false);
    fireEvent.click(screen.getByText("Reprendre"));
    fireEvent.change(screen.getByLabelText("Nouvelle quantité contractuelle"), { target: { value: "13" } });
    expect(box().checked).toBe(false); expect(box().disabled).toBe(true); expect(approveBtn().disabled).toBe(true);
    expect(screen.getByText(/Brouillon modifié : enregistrez-le/)).toBeTruthy();
    fireEvent.click(approveBtn()); // garde du gestionnaire
    expect(h.rpc.mock.calls.some((c) => c[0] === "fin_progress_amend_approve")).toBe(false);
    fireEvent.click(screen.getByText("Enregistrer le brouillon (aperçu de l'impact)"));
    await waitFor(() => expect(screen.queryByText(/Brouillon modifié : enregistrez-le/)).toBeNull());
    await waitFor(() => expect(box().disabled).toBe(false));
    expect(box().checked).toBe(false); // nouvelle confirmation exigée pour la nouvelle version
    const save = h.rpc.mock.calls.find((c) => c[0] === "fin_progress_amend_save")!;
    expect(save[1]._base_rev).toBe(3); expect(save[1]._changes).toEqual([{ id: "L1", qty: "13" }]);
    fireEvent.click(box()); fireEvent.click(approveBtn());
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[0] === "fin_progress_amend_approve")).toBe(true));
    const ap = h.rpc.mock.calls.find((c) => c[0] === "fin_progress_amend_approve")!;
    expect([ap[1]._amend, ap[1]._expect_rev, ap[1]._expect_hash]).toEqual(["a1", 4, "h4"]);
  });

  it("confirmation liée à la version : nouvelle rév. serveur au rechargement = confirmation retirée", async () => {
    let cur: A = am0;
    h.rpc.mockImplementation(() => Promise.resolve({ data: sumOf("pA", "c1", { amendments: [cur] }), error: null }));
    ui();
    fireEvent.click(await screen.findByLabelText(/Je confirme l'accord du client/));
    cur = { ...am0, rev: 5, hash: "h5" };
    fireEvent.click(screen.getByText("Actualiser l'impact")); // l'appel renvoie la nouvelle version et recharge
    await waitFor(() => expect((screen.getByLabelText(/Je confirme l'accord du client/) as HTMLInputElement).checked).toBe(false));
  });
});

describe("FIN-09B2 relecture UI — réponses différées après changement de contexte", () => {
  const setup = (fnDeferred: string, extra: A = {}) => {
    const d = deferred();
    const summaries: string[] = [];
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_progress_summary") {
        summaries.push(a._plan);
        const company = a._plan === "pC" ? "c2" : "c1";
        return Promise.resolve({ data: sumOf(a._plan, company, { amendments: a._plan === "pA" ? [am0] : [], ...extra }), error: null });
      }
      if (fn === fnDeferred) return d.p;
      return Promise.resolve({ data: {}, error: null });
    });
    return { d, summaries };
  };
  const expectNoLeak = async (summaries: string[], onChanged: A, shown: string) => {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(onChanged).not.toHaveBeenCalled();
    expect(summaries.filter((p) => p === "pA").length).toBe(1); // aucun ancien rechargement
    expect(screen.getByText(new RegExp(`Client ${shown}`))).toBeTruthy();
  };

  it("approbation différée puis dossier A→B (même entreprise)", async () => {
    const { d, summaries } = setup("fin_progress_amend_approve");
    const onChanged = vi.fn();
    const r = ui({ onChanged });
    fireEvent.click(await screen.findByLabelText(/Je confirme l'accord du client/));
    fireEvent.click(screen.getByText("Approuver"));
    r.update({ planId: "pB" });
    await screen.findByText(/Client pB/);
    await act(async () => { d.res({ data: { version: 2 }, error: null }); });
    await expectNoLeak(summaries, onChanged, "pB");
  });

  it("changement de suivi différé puis changement d'entreprise", async () => {
    const { d, summaries } = setup("fin_progress_set_track");
    const onChanged = vi.fn();
    const r = ui({ onChanged });
    fireEvent.change(await screen.findByLabelText("Choix du suivi"), { target: { value: "milestones" } });
    fireEvent.click(screen.getByText("Appliquer"));
    r.update({ planId: "pC", companyId: "c2" });
    await screen.findByText(/Client pC/);
    await act(async () => { d.res({ data: { track: "milestones" }, error: null }); });
    await expectNoLeak(summaries, onChanged, "pC");
  });

  it("création (avenant) différée puis retrait du droit d'écriture", async () => {
    const { d, summaries } = setup("fin_progress_amend_save", { amendments: [] });
    const onChanged = vi.fn();
    const r = ui({ onChanged });
    fireEvent.change(await screen.findByLabelText("Motif de l'avenant"), { target: { value: "Ajout" } });
    fireEvent.click(screen.getByText("+ Nouvelle ligne"));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Extra" } });
    fireEvent.change(screen.getByLabelText("Quantité"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Prix unitaire"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Traitement fiscal"), { target: { value: "taxable" } });
    fireEvent.click(screen.getByText("Enregistrer le brouillon (aperçu de l'impact)"));
    r.update({ canWrite: false });
    await act(async () => { d.res({ data: { ...am0, rev: 1 }, error: null }); });
    await act(async () => { await new Promise((x) => setTimeout(x, 0)); });
    expect(onChanged).not.toHaveBeenCalled();
    expect(summaries.length).toBe(1);
    expect(screen.queryByText("Enregistrer le brouillon (aperçu de l'impact)")).toBeNull();
  });

  it("perte réseau puis réessai : même clé, même contenu, dans le même contexte", async () => {
    const calls: A[] = [];
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_progress_summary") return Promise.resolve({ data: sumOf("pA", "c1"), error: null });
      calls.push(a);
      return calls.length === 1 ? Promise.reject(new Error("Réseau indisponible")) : Promise.resolve({ data: { track: "milestones" }, error: null });
    });
    const onChanged = vi.fn();
    ui({ onChanged });
    fireEvent.change(await screen.findByLabelText("Choix du suivi"), { target: { value: "milestones" } });
    fireEvent.click(screen.getByText("Appliquer"));
    fireEvent.click(await screen.findByText(/Réessayer/));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls[1]).toEqual(calls[0]);
  });
});
