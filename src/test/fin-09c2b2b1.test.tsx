// FIN-09C2B2B1 — annulation d'erreur de saisie d'un paiement de retenue TEST : écran simulé (services simulés).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
const au = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({}) } } }));
vi.mock("@/hooks/useAuthReady", () => ({ useAuthReady: () => ({ user: au.user, isReady: true }) }));
vi.mock("@/lib/drafts/useDraft", () => ({ useDraft: () => ({ status: "idle", savedAt: null, restoredMeta: null, finalize: () => {}, discard: () => {}, sync: "off", synced: false, conflict: null, useServerVersion: () => {}, keepLocalVersion: () => {}, restartAsNew: () => {}, restartError: null, retrySave: () => {} }) }));
import ConstructionPayVoidTest from "@/components/finances/ConstructionPayVoidTest";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const rel = (x: A = {}) => ({ id: "l1", source: "paiement", amount: 4.48, released_on: "2026-09-25", voided_at: null, ...x });
const pvData = (hash = "H1") => ({ data: { errors: [], amount: 4.48, paid_on: "2026-09-25", reference: "B", expect_hash: hash, after: { retention_rest: 113.98, current_due: 0 } }, error: null });
const writes = () => h.rpc.mock.calls.filter((c) => c[0] === "fin_construction_pay_void");
beforeEach(() => { h.rpc.mockReset(); localStorage.clear(); au.user = { id: "u1" }; });
const fill = (why = "Doublon") => {
  fireEvent.click(screen.getByText(/Annuler une erreur de saisie/));
  fireEvent.change(screen.getByLabelText("Motif de l'annulation"), { target: { value: why } });
  fireEvent.click(screen.getByLabelText(/erreur de saisie$/)); fireEvent.click(screen.getByLabelText("Mode TEST"));
};
const preview = async () => { fireEvent.click(screen.getByText("Aperçu de l'annulation (aucune écriture)")); await screen.findByTestId("pvoid-preview"); };
const confirmAndVoid = () => { fireEvent.click(screen.getByLabelText(/Je confirme l'annulation/)); fireEvent.click(screen.getByText("Annuler l'erreur de saisie (TEST)")); };
const C = (p: A = {}) => <ConstructionPayVoidTest rel={rel()} rev={5} companyId="c1" canWrite onDone={() => {}} onReload={() => {}} {...p} />;

describe("FIN-09C2B2B1 — écran simulé", () => {
  it("aperçu = prévision sans écriture; modifier le motif retire aperçu et confirmation", async () => {
    h.rpc.mockImplementation(() => Promise.resolve(pvData()));
    render(<C />); fill(); await preview();
    expect(screen.getByTestId("pvoid-preview").textContent).toMatch(/Après confirmation en TEST \(prévision, aucune écriture/);
    fireEvent.click(screen.getByLabelText(/Je confirme l'annulation/));
    fireEvent.change(screen.getByLabelText("Motif de l'annulation"), { target: { value: "Autre" } });
    expect(screen.queryByTestId("pvoid-preview")).toBeNull(); expect(writes().length).toBe(0);
  });

  it("écrit + réponse perdue → remontage + nouvelle révision : rejeu exact, une seule annulation", async () => {
    const done = new Set<string>(); let lose = true;
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_construction_pay_void_preview") return Promise.resolve(pvData());
      done.add(a._key);
      if (lose) { lose = false; return Promise.resolve({ data: null, error: { message: "Failed to fetch", code: "" } }); }
      return Promise.resolve({ data: { id: "k", replayed: true }, error: null });
    });
    const ok = vi.fn();
    const r = render(<C onDone={ok} />); fill(); await preview(); confirmAndVoid();
    await screen.findByTestId("pvoid-pending"); r.unmount();
    render(<C rev={6} rel={rel({ voided_at: "2026-10-01" })} onDone={ok} />);
    await screen.findByTestId("pvoid-pending");
    fireEvent.click(screen.getByText(/Récupérer le résultat/));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const w = writes(); expect(w.length).toBe(2); expect(w[1][1]).toEqual(w[0][1]); expect(w[0][1]).toMatchObject({ _expect_rev: 5, _expect_hash: "H1" });
    expect(done.size).toBe(1); expect(localStorage.length).toBe(0); expect(ok).toHaveBeenCalled();
  });

  it("stockage indisponible : aucun envoi; 08007 conservé; P0001 corrigible", async () => {
    h.rpc.mockImplementation((fn: string) => fn === "fin_construction_pay_void_preview" ? Promise.resolve(pvData()) : Promise.resolve({ data: null, error: { message: "Annulation refusée", code: "P0001" } }));
    const sp = vi.spyOn(Object.getPrototypeOf(window.localStorage), "setItem").mockImplementation(() => { throw new DOMException("q", "QuotaExceededError"); });
    const r = render(<C />); fill(); await preview(); confirmAndVoid();
    await screen.findByText(/Stockage du navigateur indisponible/); sp.mockRestore();
    expect(writes().length).toBe(0); expect((screen.getByLabelText("Motif de l'annulation") as HTMLInputElement).value).toBe("Doublon");
    await preview(); confirmAndVoid(); await screen.findByText(/Annulation refusée/);
    expect(localStorage.length).toBe(0); expect(screen.queryByTestId("pvoid-pending")).toBeNull(); r.unmount();
    h.rpc.mockImplementation((fn: string) => fn === "fin_construction_pay_void_preview" ? Promise.resolve(pvData()) : Promise.resolve({ data: null, error: { message: "inconnu", code: "08007" } }));
    render(<C />); fill(); await preview(); confirmAndVoid();
    await screen.findByTestId("pvoid-pending"); expect(localStorage.length).toBe(1);
  });

  it("changement de compte pendant l'envoi : aucun rappel, rien affiché pour le nouveau compte; lecture seule / déjà annulé : rien", async () => {
    let res!: (v: A) => void; const p = new Promise<A>((r) => { res = r; });
    h.rpc.mockImplementation((fn: string) => fn === "fin_construction_pay_void" ? p : Promise.resolve(pvData()));
    const done = vi.fn(); const reload = vi.fn();
    const r = render(<C onDone={done} onReload={reload} />); fill(); await preview(); confirmAndVoid();
    await screen.findByTestId("pvoid-pending");
    au.user = { id: "u2" }; r.rerender(<C onDone={done} onReload={reload} />);
    expect(screen.queryByTestId("pvoid-pending")).toBeNull();
    await act(async () => { res({ data: { id: "k" }, error: null }); await p; await Promise.resolve(); });
    expect(done).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    expect(localStorage.getItem("vq.pending.ctax_pay_void:u1:c1:l1")).not.toBeNull();
    r.unmount(); au.user = { id: "u1" };
    const ro = render(<C canWrite={false} />); expect(ro.container.textContent).toBe(""); ro.unmount();
    localStorage.clear();
    const v = render(<C rel={rel({ voided_at: "x" })} />); expect(v.container.textContent).toBe("");
  });
});
