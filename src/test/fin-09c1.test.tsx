// FIN-09C1 — factures récurrentes : règles pures + écrans simulés (services simulés, promesses contrôlées, données fictives).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/useAuthReady", () => ({ useAuthReady: () => ({ user: null, isReady: true }) }));
import { decFr, canonLines, buildRule, keyFor, EMPTY_RULE } from "@/lib/finances/recurring";
import { OccurrenceEditor, RecurringDetail } from "@/components/finances/RecurringInvoices";
import { renderInvoicePdf } from "@/lib/finances/invoicePdf";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const deferred = () => { let res!: (v: A) => void; const p = new Promise<A>((r) => { res = r; }); return { p, res }; };
const tax = { subtotal: 100, taxable_base: 100, gst: 5, qst: 9.98, total: 114.98, gst_rate: 0.05, qst_rate: 0.09975, resolved: true };
const occ0 = { id: "o1", status: "brouillon", scheduled_on: "2026-10-01", planned_on: "2026-10-01", version: 1, issue_date: "2026-10-01", due_date: "2026-10-31",
  lines: [{ desc: "Location", unit: "mois", qty: "1", price: "100", tax: "taxable" }], rev: 1, hash: "h1", computed: { tax } };
beforeEach(() => { h.rpc.mockReset(); });

describe("FIN-09C1 — règles pures", () => {
  it("nombres fr-CA : jamais de 0 implicite", () => {
    expect(decFr("1 234,5")).toBe("1234.5");
    for (const v of ["", " ", "abc", "Infinity", "NaN", "1,23456", null, undefined]) expect(decFr(v as A)).toBeNull();
  });
  it("lignes : champs requis refusés, remise facultative", () => {
    const r = canonLines([{ desc: "", unit: "", qty: "", price: "", disc_pct: "150", tax: "" }]);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(5);
    expect(canonLines([{ desc: "A", unit: "h", qty: "2", price: "12,50", disc_pct: "", tax: "taxable" }])).toEqual({ ok: true, errors: [], lines: [{ desc: "A", unit: "h", qty: "2", price: "12.50", tax: "taxable" }] });
  });
  it("14 jours ≠ deux fois par mois; dates personnalisées sans montant", () => {
    expect(buildRule({ ...EMPTY_RULE, preset: "biweekly", anchor: "2027-01-01", max: "4" })).toMatchObject({ frequency: "weekly", interval_n: 2, max_count: "4" });
    expect(buildRule({ ...EMPTY_RULE, preset: "twice_monthly", anchor: "2027-01-01", month_day: "1", month_day2: "15" })).toMatchObject({ frequency: "twice_monthly", month_day: "1", month_day2: "15" });
    expect(buildRule({ ...EMPTY_RULE, preset: "schedule", dates: "2027-01-05, 2027-03-09" })).toEqual({ frequency: "schedule", schedule: [{ date: "2027-01-05" }, { date: "2027-03-09" }] });
    expect(buildRule({ ...EMPTY_RULE, preset: "monthly", anchor: "2027-01-31", seasons: "04-01 au 06-30" }).seasons).toEqual([{ from: "04-01", to: "06-30" }]);
  });
  it("clé d'idempotence stable pour la même demande, nouvelle si le contenu change", () => {
    const s = { current: null as A }; const k1 = keyFor(s, { a: 1 });
    expect(keyFor(s, { a: 1 })).toBe(k1); expect(keyFor(s, { a: 2 })).not.toBe(k1);
  });
  it("PDF fictif avec référence de récurrence", () => {
    const doc = renderInvoicePdf({ status: "emise", isTest: true, number: "F-TEST", issueDate: "2026-10-01", dueDate: "2026-10-31", terms: null, seller: { name: "TEST" }, client: { name: "Client" },
      lines: occ0.lines as A, tax: { ...tax, prices_include_tax: false, gst_status: "inscrit", qst_status: "inscrit" } as A, template: {},
      recurring: { label: "Location TEST", contract_ref: "CT-1", version: 1, scheduled_on: "2026-10-01", service_from: "2026-10-01", service_to: "2026-10-31" } });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});

describe("FIN-09C1 — écran simulé du brouillon d'occurrence", () => {
  it("modification après aperçu : confirmation retirée, émission bloquée; enregistrement puis bons rev/hash", async () => {
    h.rpc.mockImplementation((fn: string) => fn === "fin_rec_draft_save" ? Promise.resolve({ data: { ...occ0, lines: [{ ...occ0.lines[0], price: "120" }], rev: 2, hash: "h2" }, error: null })
      : Promise.resolve({ data: { invoice_id: "i1", number: "F-1" }, error: null }));
    render(<OccurrenceEditor occ={occ0} companyId="c1" canWrite onClose={() => {}} onChanged={() => {}} />);
    const box = () => screen.getByLabelText(/Je confirme l'émission/) as HTMLInputElement;
    const emit = () => screen.getByText("Émettre").closest("button") as HTMLButtonElement;
    fireEvent.click(box()); expect(emit().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Prix ligne 1"), { target: { value: "120" } });
    expect(box().checked).toBe(false); expect(box().disabled).toBe(true); expect(emit().disabled).toBe(true);
    fireEvent.click(emit());
    expect(h.rpc.mock.calls.some((c) => c[0] === "fin_rec_issue")).toBe(false);
    fireEvent.click(screen.getByText("Enregistrer et actualiser l'aperçu"));
    await waitFor(() => expect(box().disabled).toBe(false));
    expect(h.rpc.mock.calls.find((c) => c[0] === "fin_rec_draft_save")![1]._base_rev).toBe(1);
    fireEvent.click(box()); fireEvent.click(emit());
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[0] === "fin_rec_issue")).toBe(true));
    const is = h.rpc.mock.calls.find((c) => c[0] === "fin_rec_issue")![1];
    expect([is._occ, is._expect_rev, is._expect_hash]).toEqual(["o1", 2, "h2"]);
  });

  it("perte réseau : la reprise renvoie la même clé; conflit sans émission automatique", async () => {
    let n = 0;
    h.rpc.mockImplementation(() => { n += 1; return Promise.resolve(n === 1 ? { data: null, error: { message: "Failed to fetch" } } : { data: null, error: { message: "Profil changé", code: "P0409" } }); });
    render(<OccurrenceEditor occ={occ0} companyId="c1" canWrite onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Je confirme l'émission/)); fireEvent.click(screen.getByText("Émettre"));
    await screen.findByText(/Failed to fetch/);
    fireEvent.click(screen.getByLabelText(/Je confirme l'émission/)); fireEvent.click(screen.getByText("Émettre"));
    await screen.findByText(/aucune émission/);
    const calls = h.rpc.mock.calls.filter((c) => c[0] === "fin_rec_issue");
    expect(calls.length).toBe(2); expect(calls[0][1]._key).toBe(calls[1][1]._key);
    expect(screen.getByText("Refaire l'aperçu")).toBeTruthy();
  });

  it("réponse tardive après changement d'entreprise : aucun état ni rappel", async () => {
    const d = deferred(); const onChanged = vi.fn();
    h.rpc.mockImplementation(() => d.p);
    const r = render(<OccurrenceEditor occ={occ0} companyId="c1" canWrite onClose={() => {}} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText(/Je confirme l'émission/)); fireEvent.click(screen.getByText("Émettre"));
    r.rerender(<OccurrenceEditor occ={occ0} companyId="c2" canWrite onClose={() => {}} onChanged={onChanged} />);
    await act(async () => { d.res({ data: { invoice_id: "i1", number: "F-1" }, error: null }); await d.p; });
    expect(onChanged).not.toHaveBeenCalled(); expect(screen.queryByText(/Facture F-1 émise/)).toBeNull();
  });
});

describe("FIN-09C1 — écran simulé de la fiche récurrence", () => {
  const sum = (id: string, co: string) => ({ id, company_id: co, label: "Modèle " + id, status: "actif", rev: 1, current_version: 1, client_name: "Client", versions: [], events: [], occurrences: [],
    calendar: [{ key: "v1:2026-11", version: 1, scheduled: "2026-11-01", planned: "2026-11-01" }] });
  it("résumé tardif d'un modèle A après passage à B : ignoré", async () => {
    const dA = deferred();
    h.rpc.mockImplementation((_fn: string, a: A) => a._template === "tA" ? dA.p : Promise.resolve({ data: sum("tB", "c1"), error: null }));
    const r = render(<RecurringDetail id="tA" companyId="c1" canWrite onClose={() => {}} onChanged={() => {}} />);
    r.rerender(<RecurringDetail id="tB" companyId="c1" canWrite onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText(/Modèle tB/);
    await act(async () => { dA.res({ data: sum("tA", "c1"), error: null }); await dA.p; });
    expect(screen.queryByText(/Modèle tA/)).toBeNull();
  });
  it("résumé d'une autre entreprise refusé; lecture seule sans bouton de préparation", async () => {
    h.rpc.mockResolvedValueOnce({ data: sum("tA", "c9"), error: null });
    const r = render(<RecurringDetail id="tA" companyId="c1" canWrite onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText(/autre entreprise/);
    r.unmount();
    h.rpc.mockResolvedValue({ data: sum("tA", "c1"), error: null });
    render(<RecurringDetail id="tA" companyId="c1" canWrite={false} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText(/Modèle tA/);
    expect(screen.queryByText(/Préparer/)).toBeNull(); expect(screen.queryByText(/Mettre en pause/)).toBeNull();
  });
});
