// FIN-09C1 — factures récurrentes : règles pures + écrans simulés (services simulés, promesses contrôlées, données fictives).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/useAuthReady", () => ({ useAuthReady: () => ({ user: null, isReady: true }) }));
import { decFr, canonLines, buildRule, keyFor, ruleToForm, EMPTY_RULE } from "@/lib/finances/recurring";
import RecurringInvoices, { OccurrenceEditor, RecurringDetail, TemplateForm } from "@/components/finances/RecurringInvoices";
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
    expect(buildRule({ ...EMPTY_RULE, preset: "biweekly", anchor: "2027-01-01", max: "4" }).rule).toMatchObject({ frequency: "weekly", interval_n: 2, max_count: "4" });
    expect(buildRule({ ...EMPTY_RULE, preset: "twice_monthly", anchor: "2027-01-01", month_day: "1", month_day2: "15" }).rule).toMatchObject({ frequency: "twice_monthly", month_day: "1", month_day2: "15" });
    expect(buildRule({ ...EMPTY_RULE, preset: "schedule", dates: "2027-01-05, 2027-03-09" }).rule).toEqual({ frequency: "schedule", schedule: [{ date: "2027-01-05" }, { date: "2027-03-09" }] });
    expect(buildRule({ ...EMPTY_RULE, preset: "monthly", anchor: "2027-01-31", seasons: "04-01 au 06-30" }).rule.seasons).toEqual([{ from: "04-01", to: "06-30" }]);
  });
  it("N invalide jamais normalisé; deux fois par mois sans « mois courts »; préchargement fidèle", () => {
    for (const n of ["abc", "-2", "0", "1.5", ""]) {
      const r = buildRule({ ...EMPTY_RULE, preset: "every_n_days", anchor: "2027-01-01", n });
      expect(r.errors).toContain("Intervalle N : nombre entier positif requis");
    }
    expect(buildRule({ ...EMPTY_RULE, preset: "every_n_days", anchor: "2027-01-01", n: "3" }).rule).toMatchObject({ frequency: "daily", interval_n: 3 });
    expect(buildRule({ ...EMPTY_RULE, preset: "monthly", anchor: "2027-01-01", month_day: "0" }).errors).toContain("Jour du mois : entier de 1 à 31");
    expect(buildRule({ ...EMPTY_RULE, preset: "twice_monthly", anchor: "2027-01-01", month_day: "1", month_day2: "15" }).rule.short_month_policy).toBeUndefined();
    const rule = { frequency: "weekly", interval_n: 3, anchor_date: "2027-01-04", end_date: "2027-06-30", planned_shift: "next_weekday" };
    expect(buildRule(ruleToForm(rule)).rule).toMatchObject(rule);
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
    expect(screen.getByText(/Recharger la version serveur/)).toBeTruthy();
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

describe("FIN-09C1 relecture — écrans simulés", () => {
  const tpl = { id: "tA", company_id: "c1", label: "Location", client_id: "k1", rev: 4, current_version: 1, status: "actif",
    versions: [{ version: 1, rule: { frequency: "monthly", interval_n: 1, anchor_date: "2026-10-01", month_day: "1", short_month_policy: "last_day", planned_shift: "none" }, lines: [{ desc: "Location", qty: "1", price: "100", tax: "taxable" }], prices_include_tax: false, due_days: 30 }] };
  it("nouvelle version : règle préchargée, prix seul conserve l'aperçu; date d'effet changée l'invalide; confirmation exigée", async () => {
    h.rpc.mockImplementation((fn: string, a: A) => fn === "fin_rec_rule_preview" ? Promise.resolve({ data: { dates: [{ key: "x", scheduled: a._effective, planned: a._effective }], total: 1, truncated: false }, error: null })
      : fn === "fin_rec_version_add" ? Promise.resolve({ data: { version: 2 }, error: null }) : Promise.resolve({ data: [], error: null }));
    render(<TemplateForm companyId="c1" canWrite version={{ template: tpl }} onClose={() => {}} onSaved={() => {}} />);
    expect((screen.getByLabelText("Jour du mois (31 = dernier)") as HTMLInputElement).value).toBe("1");
    fireEvent.change(screen.getByLabelText("Date d'effet"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByText("Aperçu des dates (lecture seule)"));
    await screen.findByText(/Je confirme cet effet/);
    const pv = h.rpc.mock.calls.find((c) => c[0] === "fin_rec_rule_preview")![1];
    expect(pv._effective).toBe("2026-12-01"); expect(pv._rule).toMatchObject({ frequency: "monthly", month_day: "1" });
    const saveBtn = () => screen.getByText("Enregistrer la version").closest("button") as HTMLButtonElement;
    expect(saveBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Prix ligne 1"), { target: { value: "120" } });
    expect(screen.getByText(/Je confirme cet effet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Date d'effet"), { target: { value: "2027-01-01" } });
    expect(screen.queryByText(/Je confirme cet effet/)).toBeNull(); expect(saveBtn().disabled).toBe(true);
    fireEvent.click(screen.getByText("Aperçu des dates (lecture seule)"));
    fireEvent.click(await screen.findByLabelText(/Je confirme cet effet/));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[0] === "fin_rec_version_add")).toBe(true));
    const va = h.rpc.mock.calls.find((c) => c[0] === "fin_rec_version_add")![1];
    expect([va._effective, va._expect_rev, va._lines[0].price]).toEqual(["2027-01-01", 4, "120"]);
  });

  it("retrait des droits pendant l'enregistrement : aucun onSaved, boutons retirés", async () => {
    const d = deferred(); const onSaved = vi.fn();
    h.rpc.mockImplementation((fn: string, a: A) => fn === "fin_rec_rule_preview" ? Promise.resolve({ data: { dates: [], total: 0, truncated: false }, error: null }) : fn === "fin_rec_version_add" ? d.p : Promise.resolve({ data: [], error: null }));
    const el = (cw: boolean) => <TemplateForm companyId="c1" canWrite={cw} version={{ template: tpl }} onClose={() => {}} onSaved={onSaved} />;
    const r = render(el(true));
    fireEvent.change(screen.getByLabelText("Date d'effet"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByText("Aperçu des dates (lecture seule)"));
    fireEvent.click(await screen.findByLabelText(/Je confirme cet effet/));
    fireEvent.click(screen.getByText("Enregistrer la version"));
    r.rerender(el(false));
    await act(async () => { d.res({ data: { version: 2 }, error: null }); await d.p; });
    expect(onSaved).not.toHaveBeenCalled(); expect(screen.queryByText("Enregistrer la version")).toBeNull();
    expect(screen.getByText(/Lecture seule/)).toBeTruthy();
  });

  it("conflit rév. 1/2 : recharge en conservant la saisie, réapplication explicite → rév. 3, nouvelle confirmation", async () => {
    const srv2 = { ...occ0, rev: 2, hash: "h2", issue_date: "2026-10-05", template_id: "tA" };
    let saves = 0;
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_rec_draft_save") { saves += 1; return Promise.resolve(saves === 1 ? { data: null, error: { message: "Brouillon modifié ailleurs", code: "P0409" } } : { data: { ...srv2, ...{ lines: a._lines, rev: 3, hash: "h3" } }, error: null }); }
      return Promise.resolve({ data: { invoice_id: "i1", number: "F-1" }, error: null });
    });
    const onReload = vi.fn(async () => srv2);
    render(<OccurrenceEditor occ={{ ...occ0, template_id: "tA" }} companyId="c1" canWrite onReload={onReload} onClose={() => {}} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText("Prix ligne 1"), { target: { value: "150" } });
    fireEvent.click(screen.getByText("Enregistrer et actualiser l'aperçu"));
    fireEvent.click(await screen.findByText(/Recharger la version serveur/));
    await screen.findByText(/Version serveur rechargée \(révision 2\)/);
    expect((screen.getByLabelText("Prix ligne 1") as HTMLInputElement).value).toBe("150");
    expect(saves).toBe(1);
    fireEvent.click(screen.getByText("Réappliquer ma saisie sur la révision 2"));
    await waitFor(() => expect(saves).toBe(2));
    expect(h.rpc.mock.calls.filter((c) => c[0] === "fin_rec_draft_save")[1][1]._base_rev).toBe(2);
    await screen.findByText(/révision 3/);
    const box = screen.getByLabelText(/Je confirme l'émission/) as HTMLInputElement;
    expect(box.checked).toBe(false); fireEvent.click(box); fireEvent.click(screen.getByText("Émettre"));
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[0] === "fin_rec_issue")).toBe(true));
    const is = h.rpc.mock.calls.find((c) => c[0] === "fin_rec_issue")![1];
    expect([is._expect_rev, is._expect_hash]).toEqual([3, "h3"]);
  });

  it("vieux brouillon hors calendrier accessible; calendrier tronqué annoncé; période suivante atteignable", async () => {
    const old = { ...occ0, id: "old", occ_key: "v1:2024-01", scheduled_on: "2024-01-01", template_id: "tA" };
    h.rpc.mockImplementation((_fn: string, a: A) => Promise.resolve({ data: { ...tpl, client_name: "C", events: [], occurrences: [old],
      window: { from: a._from, to: a._to, total: 431, shown: 300, truncated: true }, calendar: [{ key: "v1:" + a._from, version: 1, scheduled: a._from, planned: a._from }] }, error: null }));
    render(<RecurringDetail id="tA" companyId="c1" canWrite onClose={() => {}} onChanged={() => {}} />);
    expect((await screen.findByTestId("rec-window")).textContent).toMatch(/431 dates, seules les 300 premières/);
    fireEvent.click(screen.getByText("Reprendre"));
    await screen.findByText(/Occurrence du 1 janvier 2024|Occurrence du 2024/);
    const first = h.rpc.mock.calls[0][1];
    fireEvent.click(screen.getAllByText("Fermer")[0]);
    fireEvent.click(screen.getByText("Période suivante"));
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[1]._from === first._to)).toBe(true));
  });

  it("reprise après rechargement : l'adresse rouvre la récurrence et l'occurrence", async () => {
    window.history.replaceState(null, "", "/entrepreneur/finances?company=c1&tab=factures&sous=recurrences&rec=tA&occ=o1");
    h.rpc.mockImplementation((fn: string) => fn === "fin_rec_list" ? Promise.resolve({ data: [], error: null })
      : Promise.resolve({ data: { ...tpl, client_name: "C", events: [], occurrences: [{ ...occ0, template_id: "tA", occ_key: "v1:2026-10" }], window: { from: "2026-09-01", to: "2027-11-01", total: 0, shown: 0, truncated: false }, calendar: [] }, error: null }));
    render(<RecurringInvoices companyId="c1" canWrite />);
    await screen.findByText(/Occurrence du/);
    expect(h.rpc.mock.calls.filter((c) => c[0] === "fin_rec_template_create" || c[0] === "fin_rec_prepare").length).toBe(0);
    expect(window.location.search).toContain("occ=o1");
    window.history.replaceState(null, "", "/");
  });
});
