// FIN-09C2B1 — retenue construction à taxes différées (TEST) : règles pures, écran simulé, PDF fictif.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/useAuthReady", () => ({ useAuthReady: () => ({ user: null, isReady: true }) }));
import { ctaxPayload, EMPTY_CTAX } from "@/lib/finances/retention";
import ConstructionIssueTest from "@/components/finances/ConstructionIssueTest";
import Retentions from "@/components/finances/Retentions";
import { renderInvoicePdf } from "@/lib/finances/invoicePdf";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const FULL = { ...EMPTY_CTAX, pct: "10", reason: "R", basis: "written_agreement" as const, works: "construction", contract_ref: "C-1", contract_date: "2026-09-01", clause_ref: "Art. 7", release_condition: "Réception", contractual_due: "2027-01-15", test_confirm: true };
const SNAP = { base: 100, gst: 5, qst: 9.98, ttc: 114.98, current_part: 1034.77, immediate_gst: 45, immediate_qst: 89.77, invoice_gst: 50, invoice_qst: 99.75, invoice_total: 1149.75, invoice_pre_tax: 1000, mode: "percent", pct: 10, contractual_due: "2027-01-15", contract_ref: "C-1", contract_date: "2026-09-01", clause_ref: "Art. 7", basis: "written_agreement", release_condition: "Réception" };
beforeEach(() => { h.rpc.mockReset(); });
const writes = () => h.rpc.mock.calls.filter((c) => /issue|release|void|evaluate/.test(c[0]));

describe("FIN-09C2B1 — règles pures", () => {
  it("charge utile : tout requis, rien déduit, vide ≠ 0, dates strictes", () => {
    expect(ctaxPayload(FULL)).toMatchObject({ ok: true, p: { mode: "percent", pct: "10", basis: "written_agreement", test_confirm: "oui", contractual_due: "2027-01-15" } });
    for (const k of ["basis", "works", "contract_ref", "clause_ref", "release_condition", "reason"] as const) expect(ctaxPayload({ ...FULL, [k]: "" }).ok).toBe(false);
    expect(ctaxPayload({ ...FULL, test_confirm: false }).ok).toBe(false);
    expect(ctaxPayload({ ...FULL, contractual_due: "2027-02-30" }).ok).toBe(false);
    for (const v of ["", "0", "abc", "100,5"]) expect(ctaxPayload({ ...FULL, pct: v }).ok).toBe(false);
    expect(ctaxPayload({ ...FULL, mode: "amount", amount: "100,00" }).p.amount).toBe("100.00");
  });
});

describe("FIN-09C2B1 — écran simulé", () => {
  it("aperçu sans écriture, confirmation liée à l'empreinte, rejeu même clé après réponse perdue", async () => {
    let n = 0;
    h.rpc.mockImplementation((fn: string) => fn === "fin_construction_preview" ? Promise.resolve({ data: { errors: [], snapshot: SNAP, expect_hash: "H" }, error: null })
      : Promise.resolve(++n === 1 ? { data: null, error: { message: "Réseau" } } : { data: { id: "r1" }, error: null }));
    const save = vi.fn(async () => true); const onIssued = vi.fn();
    render(<ConstructionIssueTest invoiceId="i1" companyId="c1" canWrite invSig="S1" beforePreview={save} onIssued={onIssued} />);
    fireEvent.click(screen.getByText(/Émettre en mode TEST/));
    fireEvent.change(screen.getByLabelText("Pourcentage HT"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Fondement"), { target: { value: "written_agreement" } });
    fireEvent.change(screen.getByLabelText("Nature des travaux"), { target: { value: "construction" } });
    for (const [l, v] of [["Référence du contrat", "C-1"], ["Date du contrat", "2026-09-01"], ["Clause de retenue", "Art. 7"], ["Condition de libération (construction)", "Réception"], ["Échéance contractuelle", "2027-01-15"], ["Motif (construction)", "R"]])
      fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
    fireEvent.click(screen.getByLabelText(/Je comprends : mode TEST/));
    fireEvent.click(screen.getByText(/Aperçu serveur/));
    const pv = await screen.findByTestId("ctax-preview");
    expect(pv.textContent).toMatch(/1\s?034,77/); expect(pv.textContent).toMatch(/114,98/); expect(writes().length).toBe(0); expect(save).toHaveBeenCalled();
    const btn = () => screen.getByText(/Émettre la facture TEST/).closest("button") as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Je confirme l'émission TEST/));
    fireEvent.click(btn()); await screen.findByText("Réseau");
    await act(async () => { fireEvent.click(btn()); });
    const calls = h.rpc.mock.calls.filter((c) => c[0] === "fin_construction_issue");
    expect(calls.length).toBe(2); expect(calls[0][1]._key).toBe(calls[1][1]._key); expect(calls[0][1]._expect_hash).toBe("H");
    expect(onIssued).toHaveBeenCalledTimes(1);
  });

  it("retenue construction : état fiscal séparé, pas d'annulation (B2), revue d'exigibilité appelée avec la révision", async () => {
    const ret = { id: "r1", kind: "construction_differee", amount: 114.98, rest: 64.98, rev: 2, status: "active", reason: "R", release_condition: "Réception", mode: "percent", pct: 10, base_amount: 1000, planned_release: "2027-01-15",
      releases: [{ id: "l1", amount: 50, released_on: "2026-12-01", reason: "x" }],
      ctax: { snapshot: SNAP, exigible: { ttc: 50, base: 43.49, gst: 2.17, qst: 4.34 }, deferred: { ttc: 64.98, base: 56.51, gst: 2.83, qst: 5.64 }, events: [{ id: "e1", source: "liberation", exigible_on: "2026-12-01", ttc: 50, base: 43.49, gst: 2.17, qst: 4.34 }] } };
    const pos = { total: 1149.75, credits: 0, net: 1149.75, collected: 0, rest: 1149.75, held: 64.98, released: 50, current_due: 1084.77 };
    h.rpc.mockImplementation((fn: string) => Promise.resolve(fn === "fin_retention_summary" ? { data: { position: pos, retentions: [ret], events: [] }, error: null } : { data: {}, error: null }));
    render(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} />);
    const st = await screen.findByTestId("ctax-state");
    expect(st.textContent).toMatch(/préparatoire/); expect(st.textContent).toMatch(/2,83/); expect(st.textContent).toMatch(/Libération effective/);
    expect(screen.queryByText("Annuler la retenue")).toBeNull(); expect(screen.queryByText("Annuler")).toBeNull();
    fireEvent.change(screen.getByLabelText("Date de revue d'exigibilité"), { target: { value: "2027-01-20" } });
    await act(async () => { fireEvent.click(screen.getByText(/Évaluer l'exigibilité/)); });
    const c = h.rpc.mock.calls.find((x) => x[0] === "fin_construction_evaluate")![1];
    expect([c._on, c._expect_rev, c._retention]).toEqual(["2027-01-20", 2, "r1"]);
  });
});

const fillAll = () => {
  fireEvent.click(screen.getByText(/Émettre en mode TEST/));
  fireEvent.change(screen.getByLabelText("Pourcentage HT"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Fondement"), { target: { value: "written_agreement" } });
  fireEvent.change(screen.getByLabelText("Nature des travaux"), { target: { value: "construction" } });
  for (const [l, v] of [["Référence du contrat", "C-1"], ["Date du contrat", "2026-09-01"], ["Clause de retenue", "Art. 7"], ["Condition de libération (construction)", "Réception"], ["Échéance contractuelle", "2027-01-15"], ["Motif (construction)", "R"]])
    fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
  fireEvent.click(screen.getByLabelText(/Je comprends : mode TEST/));
};
const pvRes = { data: { errors: [], snapshot: SNAP, expect_hash: "H" }, error: null };

describe("FIN-09C2B1 — correctifs de revue", () => {
  it("facture modifiée APRÈS l'aperçu : aperçu et confirmation retirés, aucune émission de l'ancien brouillon", async () => {
    h.rpc.mockImplementation(() => Promise.resolve(pvRes));
    const p = { invoiceId: "i1", companyId: "c1", canWrite: true, beforePreview: async () => true, onIssued: () => {} };
    const r = render(<ConstructionIssueTest {...p} invSig="S1" />);
    fillAll(); fireEvent.click(screen.getByText(/Aperçu serveur/));
    await screen.findByTestId("ctax-preview");
    fireEvent.click(screen.getByLabelText(/Je confirme l'émission TEST/));
    r.rerender(<ConstructionIssueTest {...p} invSig="S2" />);
    expect(screen.queryByTestId("ctax-preview")).toBeNull(); expect(screen.queryByText(/Émettre la facture TEST/)).toBeNull();
    expect(h.rpc.mock.calls.some((c) => c[0] === "fin_construction_issue")).toBe(false);
  });

  it("facture modifiée PENDANT l'aperçu : réponse tardive non liée, aucune émission; verrou parent signalé", async () => {
    const pend: ((v: A) => void)[] = []; h.rpc.mockImplementation(() => new Promise((r) => { pend.push(r); }));
    const onBusy = vi.fn();
    const p = { invoiceId: "i1", companyId: "c1", canWrite: true, beforePreview: async () => true, onIssued: () => {}, onBusy };
    const r = render(<ConstructionIssueTest {...p} invSig="S1" />);
    fillAll(); await act(async () => { fireEvent.click(screen.getByText(/Aperçu serveur/)); });
    expect(onBusy).toHaveBeenCalledWith(true);
    r.rerender(<ConstructionIssueTest {...p} invSig="S2" />);
    expect(pend.length).toBe(1);
    await act(async () => { pend[0](pvRes); });
    expect(screen.queryByTestId("ctax-preview")).toBeNull(); expect(screen.queryByText(/Émettre la facture TEST/)).toBeNull();
    expect(onBusy).toHaveBeenLastCalledWith(false);
  });

  it("conflit à l'émission : saisie conservée, situation rechargée, nouvel aperçu exigé", async () => {
    h.rpc.mockImplementation((fn: string) => Promise.resolve(fn === "fin_construction_preview" ? pvRes : { data: null, error: { message: "Brouillon modifié", code: "P0409" } }));
    const onReload = vi.fn();
    render(<ConstructionIssueTest invoiceId="i1" companyId="c1" canWrite invSig="S1" beforePreview={async () => true} onIssued={() => {}} onReload={onReload} />);
    fillAll(); fireEvent.click(screen.getByText(/Aperçu serveur/));
    fireEvent.click(await screen.findByLabelText(/Je confirme l'émission TEST/));
    await act(async () => { fireEvent.click(screen.getByText(/Émettre la facture TEST/)); });
    expect(await screen.findByText(/situation rechargée/)).toBeTruthy(); expect(onReload).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Pourcentage HT") as HTMLInputElement).value).toBe("10");
    expect(screen.queryByText(/Émettre la facture TEST/)).toBeNull();
  });

  it("retenue construction : base HT + TPS + TVQ = TTC (jamais « 10 % de » sur le TTC)", async () => {
    const ret = { id: "r1", kind: "construction_differee", amount: 114.98, rest: 114.98, rev: 1, status: "active", reason: "R", release_condition: "Réception", mode: "percent", pct: 10, base_amount: 1149.75, releases: [],
      ctax: { snapshot: SNAP, exigible: { ttc: 0, base: 0, gst: 0, qst: 0 }, deferred: { ttc: 114.98, base: 100, gst: 5, qst: 9.98 }, events: [] } };
    const pos = { total: 1149.75, credits: 0, net: 1149.75, collected: 0, rest: 1149.75, held: 114.98, released: 0, current_due: 1034.77 };
    h.rpc.mockImplementation(() => Promise.resolve({ data: { position: pos, retentions: [ret], events: [] }, error: null }));
    render(<Retentions invoiceId="i1" companyId="c1" canWrite={false} onChanged={() => {}} />);
    const t = (await screen.findByText(/TTC = base HT/)).textContent!.replace(/\s/g, " ");
    expect(t).toMatch(/base HT 100,00 \$ \(10 % de 1 000,00 \$ HT\) \+ TPS 5,00 \$ \+ TVQ 9,98 \$/);
  });
});

describe("FIN-09C2B1 — PDF fictif", () => {
  it("textes maximaux : section paginée par ligne avec titre « (suite) »", async () => {
    const long = "X".repeat(180) + " " + "clause ".repeat(45);
    const doc = renderInvoicePdf({ status: "emise", isTest: true, number: "F-TEST", issueDate: "2026-10-01", dueDate: "2026-10-31", terms: null, seller: { name: "Entreprise TEST" }, client: { name: "Client TEST" },
      lines: Array.from({ length: 14 }, (_, i) => ({ desc: `Travaux TEST ${i + 1}`, qty: 1, price: 1000 / 14, tax: "taxable" }) as A),
      tax: { subtotal: 1000, discount: 0, taxable_base: 1000, zero_rated_base: 0, exempt_base: 0, undetermined: 0, gst: 50, qst: 99.75, gst_rate: 0.05, qst_rate: 0.09975, pre_tax: 1000, total: 1149.75, prices_include_tax: false },
      template: {}, construction: { ...SNAP, contract_ref: "C".repeat(200), clause_ref: long.slice(0, 500), release_condition: long.slice(0, 500) } });
    if (process.env.PDF_OUT) (await import("node:fs")).writeFileSync(process.env.PDF_OUT, Buffer.from(doc.output("arraybuffer")));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect((doc.output() as string)).toMatch(/suite\\\)/);
  });

  it("distingue taxes totales, part courante, retenue et date; jamais « exigible » pour la part différée", () => {
    const doc = renderInvoicePdf({ status: "emise", isTest: true, number: "F-TEST", issueDate: "2026-10-01", dueDate: "2026-10-31", terms: null, seller: { name: "Entreprise TEST" }, client: { name: "Client TEST" },
      lines: [{ desc: "Travaux TEST", qty: 1, price: 1000, tax: "taxable" } as A],
      tax: { subtotal: 1000, discount: 0, taxable_base: 1000, zero_rated_base: 0, exempt_base: 0, undetermined: 0, gst: 50, qst: 99.75, gst_rate: 0.05, qst_rate: 0.09975, pre_tax: 1000, total: 1149.75, prices_include_tax: false },
      template: {}, construction: SNAP });
    const txt = (doc.output() as string).replace(/\s+/g, " ");
    expect(txt).toMatch(/Retenue de construction/); expect(txt).toMatch(/n'est pas exigible/); expect(txt).toMatch(/2027-01-15/);
  });
});
