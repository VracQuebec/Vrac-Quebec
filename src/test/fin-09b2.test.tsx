// FIN-09B2 — tests isolés (services simulés, données fictives) : saisie par ligne fr-CA, jalon suivant,
// avenant (confirmation explicite, rejeu après réponse perdue), lecture seule, PDF par lignes + avenants.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { writeFileSync } from "node:fs";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), storage: { from: () => ({}) } } }));
import ProgressPlanDialog from "@/components/finances/ProgressBilling";
import { parseQty } from "@/lib/finances/progress";
import { renderInvoicePdf } from "@/lib/finances/invoicePdf";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const P = (ht: number, gst: number, qst: number, pct?: number) => ({ bt: ht, bz: 0, be: 0, ht, gst, qst, total: Math.round((ht + gst + qst) * 100) / 100, pct });
const base = (x: A = {}) => ({ id: "p1", company_id: "c1", quote_id: "q1", client_name: "Client TEST", quote_number: "S-1", quote_version: 1,
  contract: { ...P(1000, 50, 99.75), gst_rate: 0.05, qst_rate: 0.09975 }, billed: { ht: 0, gst: 0, qst: 0, total: 0 }, situations: [],
  contract_version: 1, cap: { t: 1000, z: 0, e: 0, billed_t: 0, billed_z: 0, billed_e: 0, allocated: 0 }, initial: P(1000, 50, 99.75),
  lines: [{ id: "L1", desc: "Remblai", unit: "t", tax: "taxable", qty: 10, price: 100, disc_pct: null, amount: 1000, billed_qty: 0, billed_amt: 0 }],
  milestones: [], amendments: [], versions: [], ...x });
const draft = { id: "s1", status: "brouillon", kind: "situation", mode: "lines", value: '{"L1":"2.5"}', rev: 1, hash: "h1", draft_key: "k", issue_date: "2026-10-01", due_date: null,
  computed: { contract: P(1000, 50, 99.75), prev: P(0, 0, 0), cum: P(250, 12.5, 24.94, 25), new: P(250, 12.5, 24.94), remaining: { ht: 750, total: 862.31 },
    lines_detail: [{ id: "L1", desc: "Remblai", qty: 10, billed_qty: 0, new_qty: 2.5, rest_qty: 7.5, new_amt: 250 }] } };

beforeEach(() => { h.rpc.mockReset(); vi.spyOn(window, "alert").mockImplementation(() => {}); });
const ui = (canWrite = true) => render(<ProgressPlanDialog planId="p1" companyId="c1" canWrite={canWrite} onClose={() => {}} onOpenInvoice={() => {}} onChanged={() => {}} />);

describe("FIN-09B2 — quantités par ligne (UI simulée)", () => {
  it("quantités fr-CA : zéro permis, négatif/NaN/5 décimales refusés", () => {
    expect(parseQty("2,5")).toBe("2.5"); expect(parseQty("0")).toBe("0"); expect(parseQty("1 000")).toBe("1000");
    for (const bad of ["", "-1", "NaN", "Infinity", "1,12345", "1e3"]) expect(parseQty(bad)).toBeNull();
  });
  it("envoie les cumuls par ligne normalisés et affiche le détail de la situation", async () => {
    h.rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === "fin_progress_summary" ? base({ track: "lines" }) : draft, error: null }));
    ui();
    fireEvent.change(await screen.findByLabelText("Cumul réalisé L1"), { target: { value: "2,5" } });
    fireEvent.click(screen.getByText("Aperçu"));
    await screen.findByText("Émettre la facture");
    const c = h.rpc.mock.calls.find((x) => x[0] === "fin_progress_draft_save")!;
    expect(c[1]._mode).toBe("lines"); expect(c[1]._kind).toBe("situation"); expect(JSON.parse(c[1]._value)).toEqual({ L1: "2.5" });
    expect(screen.getByLabelText("Détail par ligne")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cumul réalisé L1"), { target: { value: "3" } });
    expect(screen.queryByText("Émettre la facture")).toBeNull();
  });
  it("quantité invalide : aucun appel serveur", async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: base({ track: "lines" }), error: null }));
    ui();
    fireEvent.change(await screen.findByLabelText("Cumul réalisé L1"), { target: { value: "-1" } });
    fireEvent.click(screen.getByText("Aperçu"));
    expect(await screen.findByText(/Quantité cumulée invalide/)).toBeTruthy();
    expect(h.rpc.mock.calls.some((x) => x[0] === "fin_progress_draft_save")).toBe(false);
  });
});

describe("FIN-09B2 — jalons et avenants (UI simulée)", () => {
  it("facture le prochain jalon réalisé (jamais un jalon prévu)", async () => {
    const ms = [{ id: "m2", ord: 2, title: "Remblai", share: 400, status: "realise", rev: 2 }, { id: "m1", ord: 1, title: "Excavation", share: 300, status: "facture", rev: 3 },
      { id: "m3", ord: 3, title: "Finition", share: 300, status: "prevu", rev: 1 }];
    h.rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === "fin_progress_summary" ? base({ track: "milestones", milestones: ms }) : { ...draft, mode: "jalon", value: "m2", computed: { ...draft.computed, lines_detail: undefined } }, error: null }));
    ui();
    expect(await screen.findByText(/Prochain jalon réalisé : 2\. Remblai/)).toBeTruthy();
    fireEvent.click(screen.getByText("Aperçu"));
    await screen.findByText("Émettre la facture");
    const c = h.rpc.mock.calls.find((x) => x[0] === "fin_progress_draft_save")!;
    expect(c[1]._mode).toBe("jalon"); expect(c[1]._value).toBe("m2");
  });
  it("approbation : confirmation explicite requise; rejeu identique après réponse perdue", async () => {
    const am = { id: "a1", seq: 1, status: "brouillon", reason: "Roc", changes: [], rev: 2, hash: "ha", draft_key: "dk", from_version: 1, to_version: null, approved_at: null, close_reason: null,
      approval_ref: "Courriel", approval_date: "2026-09-30", approver_name: "M. TEST", impact: { cap_before: 1000, cap_after: 1200, billed_cap: 300, delta: { cap: 200, ht: 200, gst: 10, qst: 19.95, total: 229.95 }, changes: [] } };
    const calls: A[] = [];
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_progress_summary") return Promise.resolve({ data: base({ amendments: [am] }), error: null });
      calls.push(a); return calls.length === 1 ? Promise.reject(new Error("Réseau indisponible")) : Promise.resolve({ data: { version: 2, already: true }, error: null });
    });
    ui();
    const btn = await screen.findByText("Approuver");
    expect((btn.closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/pas une signature électronique vérifiée/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Je confirme l'accord du client/));
    fireEvent.click(screen.getByText("Approuver"));
    fireEvent.click(await screen.findByText(/Réessayer : Approbation/));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1]).toEqual(calls[0]); expect(calls[0]._expect_rev).toBe(2); expect(calls[0]._expect_hash).toBe("ha");
  });
  it("lecture seule : aucun bouton de mutation", async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: base({ track: "milestones", milestones: [{ id: "m1", ord: 1, title: "X", share: 300, status: "prevu", rev: 1 }] }), error: null }));
    ui(false);
    await screen.findByText(/Suivi :/);
    for (const t of ["Appliquer", "Déclarer réalisé", "Ajouter le jalon", "Approuver", "Aperçu", "Enregistrer le brouillon (aperçu de l'impact)"]) expect(screen.queryByText(t)).toBeNull();
  });
});

describe("FIN-09B2 — PDF", () => {
  it("lignes facturées (qté de la facture + cumul), contrat initial, avenant, contrat révisé", () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ desc: `Ligne ${i + 1} — remblai classe B`, unit: "t", qty: 1, price: 30, tax: "taxable" as const,
      prog: { qty_new: 3, qty_cum: 7, qty_contract: 10, unit_price: 10, disc_pct: null } }));
    const doc = renderInvoicePdf({ status: "emise", isTest: true, number: "F-00009", issueDate: "2026-10-01", dueDate: null, terms: null,
      seller: { name: "Entreprise TEST", gst_number: "123456789RT0001", qst_number: "1234567890TQ0001" }, client: { name: "Client TEST" }, lines,
      tax: { subtotal: 1200, discount: 0, taxable_base: 1200, zero_rated_base: 0, exempt_base: 0, undetermined: 0, gst: 60, qst: 119.7, gst_rate: 0.05, qst_rate: 0.09975, pre_tax: 1200, total: 1379.7, prices_include_tax: false, gst_status: "inscrit", qst_status: "inscrit" },
      template: { color: "#7ED321" },
      progress: { kind: "situation", seq: 2, quote_number: "S-1", basis: "ht", contract_version: 2, initial: { ht: 1000, total: 1149.75 },
        amendments: [{ seq: 1, reason: "Supplément roc", delta: { cap: 200, total: 229.95 } }], milestone: { ord: 2, title: "Remblai" },
        contract: { ht: 1200, total: 1379.7 }, prev: { ht: 300, total: 344.93 }, cum: { ht: 1200, total: 1379.71, pct: 100 }, new: { ht: 900, total: 1034.78 },
        remaining: { ht: 0, total: -0.01, cap: 0 }, gap_vs_quote: { ht: 0, gst: 0, qst: 0, total: 0.01 }, previous: [{ number: "F-00008", total: 344.93 }] } });
    const txt = doc.output();
    for (const s of ["cumul 7 / 10", "Contrat initial", "Avenant 1", "Contrat r", "Jalon factur", "F-00008"]) expect(txt).toContain(s);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, Buffer.from(doc.output("arraybuffer")));
  });
});

describe("FIN-09B2 relecture — sortir d'un conflit (UI simulée)", () => {
  it("avenant : approbation P0409 puis « Actualiser l'impact » renvoie le même contenu à la révision courante", async () => {
    const am = { id: "a1", seq: 1, status: "brouillon", reason: "Roc", changes: [{ id: "L1", qty: "12" }], rev: 3, hash: "ha", draft_key: "dk", from_version: 1, to_version: null, approved_at: null, close_reason: null,
      approval_ref: "Courriel", approval_date: "2026-09-30", approver_name: "M. TEST", impact: { cap_before: 1000, cap_after: 1200, billed_cap: 0, delta: { cap: 200, ht: 200, gst: 10, qst: 19.95, total: 229.95 }, changes: [] } };
    h.rpc.mockImplementation((fn: string) => {
      if (fn === "fin_progress_summary") return Promise.resolve({ data: base({ amendments: [am] }), error: null });
      if (fn === "fin_progress_amend_approve") return Promise.resolve({ data: null, error: { code: "P0409", message: "Impact changé depuis l'aperçu : enregistrez l'avenant de nouveau" } });
      return Promise.resolve({ data: { ...am, rev: 4, hash: "hb" }, error: null });
    });
    ui();
    fireEvent.click(await screen.findByLabelText(/Je confirme l'accord du client/));
    fireEvent.click(screen.getByText("Approuver"));
    expect(await screen.findByText(/Impact changé/)).toBeTruthy();
    fireEvent.click(screen.getByText("Actualiser l'impact"));
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[0] === "fin_progress_amend_save")).toBe(true));
    const c = h.rpc.mock.calls.find((x) => x[0] === "fin_progress_amend_save")!;
    expect(c[1]._base_rev).toBe(3); expect(c[1]._draft_key).toBe("dk"); expect(c[1]._reason).toBe("Roc"); expect(c[1]._changes).toEqual([{ id: "L1", qty: "12" }]);
  });
  it("situation : émission P0409 puis « Aperçu » renvoie la même saisie à la révision courante, sans émission automatique", async () => {
    const ms = [{ id: "m1", ord: 1, title: "Excavation", share: 350, status: "realise", rev: 3 }];
    let saves = 0;
    h.rpc.mockImplementation((fn: string) => {
      if (fn === "fin_progress_summary") return Promise.resolve({ data: base({ track: "milestones", milestones: ms }), error: null });
      if (fn === "fin_progress_issue") return Promise.resolve({ data: null, error: { code: "P0409", message: "Montants ou contrat changés depuis l'aperçu : refaites l'aperçu" } });
      saves++; return Promise.resolve({ data: { ...draft, mode: "jalon", value: "m1", rev: saves, hash: "h" + saves, computed: { ...draft.computed, lines_detail: undefined } }, error: null });
    });
    ui();
    fireEvent.click(await screen.findByText("Aperçu"));
    fireEvent.click(await screen.findByText("Émettre la facture"));
    expect(await screen.findByText(/refaites l'aperçu/)).toBeTruthy();
    fireEvent.click(screen.getByText("Aperçu"));
    await waitFor(() => expect(saves).toBe(2));
    const calls = h.rpc.mock.calls.filter((x) => x[0] === "fin_progress_draft_save");
    expect(calls[1][1]._base_rev).toBe(1); expect(calls[1][1]._draft_key).toBe(calls[0][1]._draft_key); expect(calls[1][1]._value).toBe("m1");
    expect(h.rpc.mock.calls.filter((x) => x[0] === "fin_progress_issue").length).toBe(1);
  });
});
