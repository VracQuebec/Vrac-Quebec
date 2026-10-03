// FIN-16 — Prêts et immobilisations. Amortissement linéaire mensuel et paiements de prêt comptabilisés
// une seule fois par le serveur (fin_asset_depr_post, fin_loan_pay). Ventilation capital/intérêts saisie
// depuis le relevé du prêteur; le tableau d'amortissement du prêt est indicatif seulement.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, todayIn } from "@/lib/finances/period";
import type { GlAccount } from "@/lib/finances/ledger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
type Asset = { id: string; name: string; acquired_on: string; cost: number; salvage: number; life_months: number; asset_gl: string | null; accum_gl: string | null; expense_gl: string | null };
type Loan = { id: string; name: string; lender: string | null; principal: number; annual_rate: number | null; start_on: string; term_months: number; loan_gl: string | null; interest_gl: string | null };
type FinAcc = { id: string; name: string };

/** Paiement mensuel constant indicatif (taux annuel nominal composé mensuellement). */
export function loanPayment(p: number, ratePct: number, n: number) { const r = ratePct / 100 / 12; return r === 0 ? p / n : (p * r) / (1 - Math.pow(1 + r, -n)); }

const call = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await db.rpc(fn, args); if (error) throw error; return data; };
const fail = (e: any) => toast({ title: "Refusé", description: e?.message ?? String(e), variant: "destructive" });

function GlSelect({ accs, value, onChange, label }: { accs: GlAccount[]; value: string; onChange: (v: string) => void; label: string }) {
  return <label className="text-xs">{label}<select className={`${sel} w-full`} value={value} onChange={(e) => onChange(e.target.value)}><option value="">À compléter</option>{accs.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.number} · {a.name}</option>)}</select></label>;
}

export default function LoansAssets({ companyId, accs, canWrite }: { companyId: string; accs: GlAccount[]; canWrite: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]); const [depr, setDepr] = useState<{ asset_id: string; period: string; amount: number }[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]); const [pays, setPays] = useState<{ loan_id: string; paid_on: string; principal: number; interest: number }[]>([]);
  const [fin, setFin] = useState<FinAcc[]>([]);
  const [a, setA] = useState({ name: "", acquired_on: todayIn(), cost: "", salvage: "0", life_months: "60", asset_gl: "", accum_gl: "", expense_gl: "" });
  const [l, setL] = useState({ name: "", lender: "", principal: "", annual_rate: "", start_on: todayIn(), term_months: "60", loan_gl: "", interest_gl: "" });
  const [pay, setPay] = useState<{ loan: string; on: string; principal: string; interest: string; account: string; ref: string; key: string } | null>(null);
  const load = useCallback(async () => {
    const q = (t: string, o: string) => db.from(t).select("*").eq("company_id", companyId).order(o);
    const [x1, x2, x3, x4, x5] = await Promise.all([q("fin_assets", "acquired_on"), q("fin_asset_depr", "period"), q("fin_loans", "start_on"), q("fin_loan_payments", "paid_on"), db.from("fin_accounts").select("id,name").eq("company_id", companyId).is("archived_at", null)]);
    setAssets(x1.data ?? []); setDepr(x2.data ?? []); setLoans(x3.data ?? []); setPays(x4.data ?? []); setFin(x5.data ?? []);
  }, [companyId]);
  useEffect(() => { load().catch(fail); }, [load]);
  const run = async (f: () => Promise<unknown>, ok: string) => { try { await f(); toast({ title: ok }); await load(); } catch (e) { fail(e); } };
  const nextPeriod = (as: Asset) => { const done = depr.filter((d) => d.asset_id === as.id).length; if (done >= as.life_months) return null; const [y, m] = as.acquired_on.split("-").map(Number); const t = y * 12 + (m - 1) + done; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };

  return <section className="space-y-6 text-sm" data-testid="loans-assets">
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Immobilisations</h3>
      <p className="text-xs text-muted-foreground">Amortissement comptable linéaire mensuel ((coût − valeur résiduelle) ÷ durée, dernier mois = résidu exact). Ce n'est pas la déduction fiscale pour amortissement (DPA), à établir avec votre comptable.</p>
      {canWrite && <div className="grid gap-2 rounded border border-dashed border-border p-3 sm:grid-cols-4">
        <Input placeholder="Nom (ex. camion 10 roues)" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} className="sm:col-span-2" />
        <label className="text-xs">Acquis le<Input type="date" value={a.acquired_on} onChange={(e) => setA({ ...a, acquired_on: e.target.value })} /></label>
        <label className="text-xs">Durée (mois)<Input inputMode="numeric" value={a.life_months} onChange={(e) => setA({ ...a, life_months: e.target.value })} /></label>
        <label className="text-xs">Coût<Input inputMode="decimal" value={a.cost} onChange={(e) => setA({ ...a, cost: e.target.value })} /></label>
        <label className="text-xs">Valeur résiduelle<Input inputMode="decimal" value={a.salvage} onChange={(e) => setA({ ...a, salvage: e.target.value })} /></label>
        <GlSelect accs={accs} label="Compte d'actif" value={a.asset_gl} onChange={(v) => setA({ ...a, asset_gl: v })} />
        <GlSelect accs={accs} label="Amortissement cumulé" value={a.accum_gl} onChange={(v) => setA({ ...a, accum_gl: v })} />
        <GlSelect accs={accs} label="Dépense d'amortissement" value={a.expense_gl} onChange={(v) => setA({ ...a, expense_gl: v })} />
        <Button disabled={!a.name.trim() || !(Number(a.cost) > 0) || !(Number(a.life_months) >= 1)} onClick={() => run(() => call("fin_asset_save", { _company: companyId, _id: null, _d: { ...a, asset_gl: a.asset_gl || null, accum_gl: a.accum_gl || null, expense_gl: a.expense_gl || null } }), "Immobilisation ajoutée")}>Ajouter</Button>
        <p className="text-xs text-muted-foreground sm:col-span-4">L'achat lui-même est comptabilisé par la facture fournisseur ou une écriture; ici on suit seulement l'amortissement.</p>
      </div>}
      {assets.length === 0 ? <p className="text-muted-foreground">Aucune immobilisation.</p> : <ul className="space-y-2">{assets.map((as) => { const done = depr.filter((d) => d.asset_id === as.id).reduce((s, d) => s + Number(d.amount), 0); const np = nextPeriod(as);
        return <li key={as.id} className="rounded border border-border p-2"><b>{as.name}</b> · acquis le {as.acquired_on} · coût {fmtMoney(as.cost)} · {as.life_months} mois<br />
          Amorti {fmtMoney(done)} · valeur comptable {fmtMoney(Number(as.cost) - done)}{(!as.accum_gl || !as.expense_gl) && <span className="ml-2 text-destructive">Comptes à compléter</span>}
          {canWrite && np && <Button size="sm" variant="outline" className="ml-2" onClick={() => run(() => call("fin_asset_depr_post", { _asset: as.id, _period: np }), `Amortissement ${np} comptabilisé`)}>Comptabiliser {np}</Button>}
          {!np && <span className="ml-2 text-primary">Entièrement amortie</span>}</li>; })}</ul>}
    </div>

    <div className="space-y-3">
      <h3 className="text-base font-semibold">Prêts</h3>
      {canWrite && <div className="grid gap-2 rounded border border-dashed border-border p-3 sm:grid-cols-4">
        <Input placeholder="Nom du prêt" value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} />
        <Input placeholder="Prêteur" value={l.lender} onChange={(e) => setL({ ...l, lender: e.target.value })} />
        <label className="text-xs">Début<Input type="date" value={l.start_on} onChange={(e) => setL({ ...l, start_on: e.target.value })} /></label>
        <label className="text-xs">Durée (mois)<Input inputMode="numeric" value={l.term_months} onChange={(e) => setL({ ...l, term_months: e.target.value })} /></label>
        <label className="text-xs">Capital<Input inputMode="decimal" value={l.principal} onChange={(e) => setL({ ...l, principal: e.target.value })} /></label>
        <label className="text-xs">Taux annuel % (vide = inconnu)<Input inputMode="decimal" value={l.annual_rate} onChange={(e) => setL({ ...l, annual_rate: e.target.value })} /></label>
        <GlSelect accs={accs} label="Compte du prêt (passif)" value={l.loan_gl} onChange={(v) => setL({ ...l, loan_gl: v })} />
        <GlSelect accs={accs} label="Dépense d'intérêts" value={l.interest_gl} onChange={(v) => setL({ ...l, interest_gl: v })} />
        <Button disabled={!l.name.trim() || !(Number(l.principal) > 0) || !(Number(l.term_months) >= 1)} onClick={() => run(() => call("fin_loan_save", { _company: companyId, _id: null, _d: { ...l, loan_gl: l.loan_gl || null, interest_gl: l.interest_gl || null } }), "Prêt ajouté")}>Ajouter</Button>
      </div>}
      {loans.length === 0 ? <p className="text-muted-foreground">Aucun prêt.</p> : <ul className="space-y-2">{loans.map((ln) => { const ps = pays.filter((p) => p.loan_id === ln.id); const cap = ps.reduce((s, p) => s + Number(p.principal), 0); const int = ps.reduce((s, p) => s + Number(p.interest), 0);
        return <li key={ln.id} className="rounded border border-border p-2"><b>{ln.name}</b>{ln.lender ? ` · ${ln.lender}` : ""} · capital {fmtMoney(ln.principal)} · {ln.term_months} mois · taux {ln.annual_rate == null ? "inconnu" : `${ln.annual_rate} %`}<br />
          Capital remboursé {fmtMoney(cap)} · intérêts payés {fmtMoney(int)} · solde {fmtMoney(Number(ln.principal) - cap)}
          {ln.annual_rate != null && <span className="text-muted-foreground"> · paiement mensuel indicatif {fmtMoney(loanPayment(Number(ln.principal), Number(ln.annual_rate), ln.term_months))}</span>}
          {canWrite && Number(ln.principal) - cap > 0 && <Button size="sm" variant="outline" className="ml-2" onClick={() => setPay({ loan: ln.id, on: todayIn(), principal: "", interest: "", account: "", ref: "", key: crypto.randomUUID() })}>Consigner un paiement</Button>}
          {pay?.loan === ln.id && <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className="text-xs">Date<Input type="date" value={pay.on} onChange={(e) => setPay({ ...pay, on: e.target.value })} /></label>
            <label className="text-xs">Capital (relevé du prêteur)<Input inputMode="decimal" value={pay.principal} onChange={(e) => setPay({ ...pay, principal: e.target.value })} /></label>
            <label className="text-xs">Intérêts (relevé du prêteur)<Input inputMode="decimal" value={pay.interest} onChange={(e) => setPay({ ...pay, interest: e.target.value })} /></label>
            <label className="text-xs">Payé depuis<select className={`${sel} w-full`} value={pay.account} onChange={(e) => setPay({ ...pay, account: e.target.value })}><option value="">Choisir…</option>{fin.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            <Input placeholder="Référence" value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} />
            <div className="flex gap-2"><Button disabled={!pay.account} onClick={() => run(async () => { await call("fin_loan_pay", { _loan: ln.id, _on: pay.on, _principal: Number(pay.principal || 0), _interest: Number(pay.interest || 0), _account: pay.account, _ref: pay.ref, _key: pay.key }); setPay(null); }, "Paiement comptabilisé")}>Comptabiliser</Button><Button variant="ghost" onClick={() => setPay(null)}>Annuler</Button></div>
          </div>}</li>; })}</ul>}
    </div>
  </section>;
}
