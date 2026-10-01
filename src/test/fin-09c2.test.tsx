// FIN-09C2 — retenues : règles pures + écran simulé (services simulés, promesses contrôlées, données fictives).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/useAuthReady", () => ({ useAuthReady: () => ({ user: null, isReady: true }) }));
import { retPayload, splitInflow, EMPTY_RET } from "@/lib/finances/retention";
import Retentions from "@/components/finances/Retentions";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const deferred = () => { let res!: (v: A) => void; const p = new Promise<A>((r) => { res = r; }); return { p, res }; };
const pos = { total: 1149.75, credits: 0, net: 1149.75, collected: 0, rest: 1149.75, held: 0, released: 0, current_due: 1149.75 };
const summary = (extra: A = {}) => ({ data: { position: pos, retentions: [], events: [], ...extra }, error: null });
const pvOk = { data: { errors: [], mode: "amount", amount: 114.98, base: 1149.75, expect_hash: "H1", after: { held: 114.98, current_due: 1034.77 } }, error: null };
beforeEach(() => { h.rpc.mockReset(); });
const fill = () => {
  fireEvent.click(screen.getByText("Nouvelle retenue"));
  fireEvent.change(screen.getByLabelText("Montant retenu"), { target: { value: "114,98" } });
  fireEvent.change(screen.getByLabelText("Motif"), { target: { value: "Garantie" } });
  fireEvent.change(screen.getByLabelText("Condition de libération"), { target: { value: "Réception" } });
};
const writes = () => h.rpc.mock.calls.filter((c) => /create|release|void/.test(c[0]));

describe("FIN-09C2 — règles pures", () => {
  it("charge utile : montants fr-CA canoniques, jamais de 0 implicite, construction différée bloquée", () => {
    expect(retPayload({ ...EMPTY_RET, amount: "114,98", reason: "G", release_condition: "R" })).toMatchObject({ ok: true, p: { kind: "taxes_exigibles", mode: "amount", amount: "114.98" } });
    for (const v of ["", "abc", "0", "1,234", "Infinity", "-5"]) expect(retPayload({ ...EMPTY_RET, amount: v, reason: "G", release_condition: "R" }).ok).toBe(false);
    expect(retPayload({ ...EMPTY_RET, mode: "percent", pct: "10", reason: "G", release_condition: "R" }).p.pct).toBe("10");
    expect(retPayload({ ...EMPTY_RET, mode: "percent", pct: "100,5", reason: "G", release_condition: "R" }).ok).toBe(false);
    const c = retPayload({ ...EMPTY_RET, kind: "construction_differee", amount: "10", reason: "G", release_condition: "R" });
    expect(c.ok).toBe(false); expect(c.errors[0]).toMatch(/Revenu Québec/);
  });
  it("trésorerie : 1149,75 = 1034,77 à l'échéance + 114,98 à la date prévue; sans date = à compléter; jamais compté deux fois", () => {
    const sp = splitInflow({ amount: 1149.75, received: 0, expected_on: "2026-10-31", retention_schedule: [{ id: "r1", date: "2027-01-15", amount: 114.98 }] });
    expect(sp.parts).toEqual([{ date: "2026-10-31", cents: 103477 }, { date: "2027-01-15", cents: 11498, retention: "r1" }]);
    expect(sp.parts.reduce((a, p) => a + p.cents, 0) + sp.undated).toBe(sp.left);
    const u = splitInflow({ amount: 1149.75, received: 1034.77, expected_on: "2026-10-31", retention_schedule: [{ id: "r1", date: null, amount: 114.98 }] });
    expect(u.parts).toEqual([]); expect(u.undated).toBe(11498); expect(u.left).toBe(11498);
    expect(splitInflow({ amount: 100, received: 0, expected_on: "2026-10-31" }).parts).toEqual([{ date: "2026-10-31", cents: 10000 }]);
  });
});

describe("FIN-09C2 — écran simulé", () => {
  it("affiche brut/avoirs/encaissements/solde/courant/retenu; aperçu sans écriture; confirmation liée à l'aperçu", async () => {
    h.rpc.mockImplementation((fn: string) => fn === "fin_retention_summary" ? Promise.resolve(summary()) : fn === "fin_retention_preview" ? Promise.resolve(pvOk) : Promise.resolve({ data: { id: "r1" }, error: null }));
    render(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} />);
    expect((await screen.findByTestId("ret-position")).textContent).toMatch(/Part exigible courante/);
    fill(); fireEvent.click(screen.getByText("Aperçu (aucune écriture)"));
    await screen.findByTestId("ret-preview");
    expect(writes().length).toBe(0);
    const btn = () => screen.getByText("Créer la retenue").closest("button") as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Je confirme cette retenue/)); expect(btn().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Montant retenu"), { target: { value: "100" } });
    expect(screen.queryByTestId("ret-preview")).toBeNull(); // saisie modifiée : aperçu et confirmation retirés
    expect(writes().length).toBe(0);
  });

  it("réponse perdue puis réessai : même clé, même contenu; conflit P0409 : saisie conservée, rechargement, nouvel aperçu exigé", async () => {
    let n = 0;
    h.rpc.mockImplementation((fn: string) => fn === "fin_retention_summary" ? Promise.resolve(summary()) : fn === "fin_retention_preview" ? Promise.resolve(pvOk)
      : fn === "fin_retention_create" ? Promise.resolve(++n === 1 ? { data: null, error: { message: "Réseau" } } : { data: null, error: { message: "Solde modifié", code: "P0409" } }) : Promise.resolve({ data: null, error: null }));
    render(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} />);
    await screen.findByTestId("ret-position");
    fill(); fireEvent.click(screen.getByText("Aperçu (aucune écriture)"));
    fireEvent.click(await screen.findByLabelText(/Je confirme cette retenue/)); fireEvent.click(screen.getByText("Créer la retenue"));
    await screen.findByText("Réseau");
    fireEvent.click(screen.getByText("Créer la retenue"));
    await screen.findByText(/saisie conservée/);
    const cr = h.rpc.mock.calls.filter((c) => c[0] === "fin_retention_create");
    expect(cr.length).toBe(2); expect(cr[0][1]._key).toBe(cr[1][1]._key); expect(cr[0][1]._p).toEqual(cr[1][1]._p);
    expect((screen.getByLabelText("Montant retenu") as HTMLInputElement).value).toBe("114,98");
    expect(screen.queryByText("Créer la retenue")).toBeNull();
    expect(h.rpc.mock.calls.filter((c) => c[0] === "fin_retention_summary").length).toBeGreaterThanOrEqual(2);
  });

  it("construction différée : choix visible mais bloqué, aucun appel serveur d'écriture ni d'aperçu", async () => {
    h.rpc.mockImplementation(() => Promise.resolve(summary()));
    render(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} />);
    await screen.findByTestId("ret-position");
    fill(); fireEvent.click(screen.getByLabelText(/Retenue de construction avec taxes différées/));
    expect(screen.getByRole("alert").textContent).toMatch(/sous-lot FIN-09C2 restant/);
    expect((screen.getByText("Aperçu (aucune écriture)").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(h.rpc.mock.calls.some((c) => c[0] !== "fin_retention_summary")).toBe(false);
  });

  it("lecture seule : aucune action; démontage pendant une libération différée : aucun rappel", async () => {
    const ret = { id: "r1", amount: 114.98, rest: 114.98, rev: 1, status: "active", reason: "G", release_condition: "R", releases: [], mode: "amount" };
    h.rpc.mockImplementation(() => Promise.resolve(summary({ retentions: [ret] })));
    const ro = render(<Retentions invoiceId="i1" companyId="c1" canWrite={false} onChanged={() => {}} />);
    await screen.findByText(/reste retenu/);
    expect(screen.queryByText("Nouvelle retenue")).toBeNull(); expect(screen.queryByText("Libérer…")).toBeNull();
    ro.unmount();
    const d = deferred(); const onChanged = vi.fn();
    h.rpc.mockImplementation((fn: string) => fn === "fin_retention_release" ? d.p : Promise.resolve(summary({ retentions: [ret] })));
    const r = render(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={onChanged} />);
    fireEvent.click(await screen.findByText("Libérer…"));
    fireEvent.change(screen.getByLabelText("Montant à libérer"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Motif de libération"), { target: { value: "Réception partielle" } });
    fireEvent.click(screen.getByText("Libérer"));
    const call = h.rpc.mock.calls.find((c) => c[0] === "fin_retention_release")![1];
    expect([call._amount, call._expect_rev]).toEqual(["50", 1]);
    r.unmount();
    await act(async () => { d.res({ data: { id: "l1" }, error: null }); await d.p; });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("libération au-delà du restant refusée à l'écran (validation finale serveur)", async () => {
    const ret = { id: "r1", amount: 114.98, rest: 64.98, rev: 2, status: "active", reason: "G", release_condition: "R", releases: [], mode: "amount" };
    h.rpc.mockImplementation(() => Promise.resolve(summary({ retentions: [ret] })));
    render(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} />);
    fireEvent.click(await screen.findByText("Libérer…"));
    fireEvent.change(screen.getByLabelText("Montant à libérer"), { target: { value: "64,99" } });
    fireEvent.change(screen.getByLabelText("Motif de libération"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Libérer"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/supérieure à la retenue restante/));
    expect(writes().length).toBe(0);
  });
});

describe("FIN-09C2 — correctifs de relecture", () => {
  it("échéancier incohérent : projection refusée, jamais plafonnée", () => {
    expect(() => splitInflow({ amount: 100, received: 50, expected_on: "2026-10-31", retention_schedule: [{ id: "r1", date: null, amount: 60 }] })).toThrow(/retenu 60.00 \$ > reste dû 50.00 \$/);
    for (const s of [{}, [{ id: "r1", date: null, amount: "abc" }], [{ id: "r1", date: "31/12/2026", amount: 1 }], [{ date: null, amount: 1 }], [{ id: "r1", date: null, amount: 0 }]])
      expect(() => splitInflow({ amount: 100, received: 0, expected_on: "2026-10-31", retention_schedule: s })).toThrow(/Prévision refusée/);
  });

  it("lectures dans le désordre : seule la plus récente s'applique, ancienne erreur ignorée", async () => {
    const d1 = deferred(); const d2 = deferred(); let n = 0;
    h.rpc.mockImplementation(() => (++n === 1 ? d1.p : d2.p));
    const r = render(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} refreshKey={0} />);
    r.rerender(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} refreshKey={1} />);
    await act(async () => { d2.res(summary({ position: { ...pos, held: 7 } })); await d2.p; });
    await act(async () => { d1.res({ data: null, error: { message: "Ancienne erreur" } }); await d1.p; });
    expect(screen.getByTestId("ret-position").textContent).toMatch(/7,00/);
    expect(screen.queryByText(/Ancienne erreur/)).toBeNull();
  });

  it("retenue active entièrement libérée : « Annuler la retenue » reste accessible, pas de « Libérer… »", async () => {
    const ret = { id: "r1", amount: 114.98, rest: 0, rev: 3, status: "active", reason: "G", release_condition: "R", releases: [], mode: "amount" };
    h.rpc.mockImplementation(() => Promise.resolve(summary({ retentions: [ret] })));
    render(<Retentions invoiceId="i1" companyId="c1" canWrite onChanged={() => {}} />);
    expect(await screen.findByText("Annuler la retenue")).toBeTruthy();
    expect(screen.queryByText("Libérer…")).toBeNull();
  });
});
