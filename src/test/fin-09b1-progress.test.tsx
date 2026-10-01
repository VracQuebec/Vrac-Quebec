// FIN-09B1 — tests isolés (services simulés, données fictives) : saisie fr-CA, erreur réseau, aperçu invalidé,
// rejeu identique après réponse perdue, conflit P0409 sans émission automatique, PDF avec récapitulatif.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { writeFileSync } from "node:fs";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: () => ({}), storage: { from: () => ({}) } } }));
import ProgressPlanDialog from "@/components/finances/ProgressBilling";
import { parseCumul } from "@/lib/finances/progress";
import { renderInvoicePdf } from "@/lib/finances/invoicePdf";

type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const P = (ht: number, gst: number, qst: number, pct?: number) => ({ bt: ht, bz: 0, be: 0, ht, gst, qst, total: Math.round((ht + gst + qst) * 100) / 100, pct });
const contract = { ...P(1000, 50, 99.75), gst_rate: 0.05, qst_rate: 0.09975 };
const sum = (situations: A[] = [], billed = { ht: 0, gst: 0, qst: 0, total: 0 }) => ({ id: "p1", company_id: "c1", quote_id: "q1", client_name: "Client TEST", quote_number: "S-1", quote_version: 1, contract, billed, situations });
const draft30 = { id: "s1", status: "brouillon", kind: "acompte", mode: "pct", value: "30", rev: 1, hash: "h1", draft_key: "k", issue_date: "2026-10-01", due_date: null,
  computed: { contract: P(1000, 50, 99.75), prev: P(0, 0, 0), cum: P(300, 15, 29.93, 30), new: P(300, 15, 29.93), remaining: { ht: 700, total: 804.82 } } };

beforeEach(() => { h.rpc.mockReset(); vi.spyOn(window, "alert").mockImplementation(() => {}); });
const ui = () => render(<ProgressPlanDialog planId="p1" companyId="c1" canWrite onClose={() => {}} onOpenInvoice={() => {}} onChanged={() => {}} />);

describe("FIN-09B1 — saisie", () => {
  it("décimales fr-CA; vide, négatif, NaN, Infinity et 3 décimales refusés (jamais 0)", () => {
    expect(parseCumul("30,5")).toBe("30.5"); expect(parseCumul("1 250,75")).toBe("1250.75"); expect(parseCumul("300")).toBe("300");
    for (const bad of ["", " ", "-3", "0", "NaN", "Infinity", "1,005", "abc", "1e3"]) expect(parseCumul(bad)).toBeNull();
  });
});

describe("FIN-09B1 — aperçu et émission", () => {
  it("envoie le cumul fr-CA normalisé; toute modification retire « Émettre »", async () => {
    h.rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === "fin_progress_summary" ? sum() : draft30, error: null }));
    ui();
    fireEvent.change(await screen.findByLabelText("Cumul contractuel"), { target: { value: "30,0" } });
    fireEvent.click(screen.getByText("Aperçu"));
    await screen.findByText("Émettre la facture");
    const call = h.rpc.mock.calls.find((c) => c[0] === "fin_progress_draft_save")!; expect(call[1]._value).toBe("30.0"); expect(call[1]._base_rev).toBeNull();
    expect(screen.getByText(/344,93/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cumul contractuel"), { target: { value: "40" } });
    expect(screen.queryByText("Émettre la facture")).toBeNull();
  });

  it("saisie invalide : aucun appel serveur; erreur réseau d'aperçu affichée", async () => {
    h.rpc.mockImplementation((fn: string) => fn === "fin_progress_summary" ? Promise.resolve({ data: sum(), error: null }) : Promise.reject(new Error("Réseau indisponible")));
    ui();
    fireEvent.change(await screen.findByLabelText("Cumul contractuel"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Aperçu"));
    expect(await screen.findByText(/Cumul invalide/)).toBeTruthy();
    expect(h.rpc.mock.calls.some((c) => c[0] === "fin_progress_draft_save")).toBe(false);
    fireEvent.change(screen.getByLabelText("Cumul contractuel"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Aperçu"));
    expect(await screen.findByText(/Réseau indisponible/)).toBeTruthy();
    expect(screen.getByText("Aperçu").closest("button")!.disabled).toBe(false); // occupation libérée
  });

  it("réponse perdue : même clé, révision et empreinte au réessai", async () => {
    const issues: A[] = [];
    h.rpc.mockImplementation((fn: string, a: A) => {
      if (fn === "fin_progress_summary") return Promise.resolve({ data: sum(), error: null });
      if (fn === "fin_progress_draft_save") return Promise.resolve({ data: draft30, error: null });
      issues.push(a); return issues.length === 1 ? Promise.reject(new Error("réseau")) : Promise.resolve({ data: { invoice_id: "i1", number: "F-00001", already: true }, error: null });
    });
    ui();
    fireEvent.change(await screen.findByLabelText("Cumul contractuel"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Aperçu"));
    fireEvent.click(await screen.findByText("Émettre la facture"));
    fireEvent.click(await screen.findByText("Réessayer l'émission"));
    await waitFor(() => expect(issues.length).toBe(2));
    expect(issues[1]).toEqual(issues[0]); expect(issues[0]._expect_rev).toBe(1); expect(issues[0]._expect_hash).toBe("h1");
  });

  it("conflit P0409 : message, aperçu retiré, aucune émission automatique", async () => {
    let n = 0;
    h.rpc.mockImplementation((fn: string) => {
      if (fn === "fin_progress_summary") return Promise.resolve({ data: sum(), error: null });
      if (fn === "fin_progress_draft_save") return Promise.resolve({ data: draft30, error: null });
      n++; return Promise.resolve({ data: null, error: { code: "P0409", message: "Brouillon modifié depuis l'aperçu" } });
    });
    ui();
    fireEvent.change(await screen.findByLabelText("Cumul contractuel"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Aperçu"));
    fireEvent.click(await screen.findByText("Émettre la facture"));
    expect(await screen.findByText(/Aucune émission automatique/)).toBeTruthy();
    expect(screen.queryByText("Émettre la facture")).toBeNull(); expect(n).toBe(1);
  });

  it("brouillon existant : reprise explicite avec sa clé et sa révision", async () => {
    h.rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === "fin_progress_summary" ? sum([{ ...draft30, rev: 4, hash: "h4", draft_key: "kd" }]) : { ...draft30, rev: 5 }, error: null }));
    ui();
    fireEvent.click(await screen.findByText("Reprendre le brouillon"));
    expect(screen.getByText("Émettre la facture")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cumul contractuel"), { target: { value: "35" } });
    fireEvent.click(screen.getByText("Aperçu"));
    await screen.findByText("Émettre la facture");
    const c = h.rpc.mock.calls.find((x) => x[0] === "fin_progress_draft_save")!; expect(c[1]._draft_key).toBe("kd"); expect(c[1]._base_rev).toBe(4);
  });
});

describe("FIN-09B1 — PDF", () => {
  it("récapitulatif contrat/cumul/déjà facturé/cette facture/reste et factures précédentes", () => {
    const doc = renderInvoicePdf({ status: "emise", isTest: true, number: "F-00003", issueDate: "2026-10-01", dueDate: null, terms: null,
      seller: { name: "Entreprise TEST", gst_number: "123456789RT0001", qst_number: "1234567890TQ0001" }, client: { name: "Client TEST" },
      lines: [{ desc: "Solde final n° 3 — soumission S-1 v1 — cumul 100 % du contrat (part taxable)", qty: 1, unit: "forfait", price: 300, tax: "taxable" }],
      tax: { subtotal: 300, discount: 0, taxable_base: 300, zero_rated_base: 0, exempt_base: 0, undetermined: 0, gst: 15, qst: 29.92, gst_rate: 0.05, qst_rate: 0.09975, pre_tax: 300, total: 344.92, prices_include_tax: false, gst_status: "inscrit", qst_status: "inscrit" },
      template: { color: "#7ED321" },
      progress: { kind: "solde", seq: 3, quote_number: "S-1", contract: { ht: 1000, total: 1149.75 }, prev: { ht: 700, total: 804.83 }, cum: { ht: 1000, total: 1149.75, pct: 100 }, new: { ht: 300, total: 344.92 }, remaining: { ht: 0, total: 0 },
        previous: [{ number: "F-00001", total: 344.93 }, { number: "F-00002", total: 459.90 }] } });
    const txt = doc.output();
    for (const s of ["RÉCAPITULATIF", "Déjà facturé", "Reste à facturer", "F-00001", "F-00002"]) expect(txt).toContain(s.replace("É", "\\311").length ? s.slice(1) : s);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, Buffer.from(doc.output("arraybuffer")));
  });
});
