// FIN-15 — Taxes à remettre (TPS/TVQ) : calcul depuis les écritures validées des comptes de taxes associés,
// préparation figée, revue, puis suivi de la déclaration et du paiement faits HORS de l'application (jamais transmis par Vrac Québec).
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, todayIn } from "@/lib/finances/period";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Line = { account_id: string; amount: number; entries: number } | null;
type Calc = { from: string; to: string; lines: Record<string, Line>; missing: string[]; drafts_in_period: number; gst_net: number | null; qst_net: number | null };
type Ret = { id: string; period_from: string; period_to: string; due_date: string | null; status: string; gst_net: number; qst_net: number; snapshot: Calc; filed_on: string | null; filed_ref: string | null; paid_on: string | null; paid_ref: string | null; cancel_reason: string | null; note: string | null };
const LBL: Record<string, string> = { gst_payable: "TPS perçue", gst_recoverable: "CTI (TPS récupérable)", qst_payable: "TVQ perçue", qst_recoverable: "RTI (TVQ récupérable)" };
const ST: Record<string, string> = { preparee: "Préparée (non transmise)", revue: "Revue (non transmise)", declaree_hors_app: "Déclarée par vous hors de Vrac Québec", payee_hors_app: "Payée par vous hors de Vrac Québec", annulee: "Annulée" };
const money = (v: number | null | undefined) => v == null ? "À compléter" : fmtMoney(Number(v));
const fail = (e: any) => toast({ title: "Action refusée", description: e?.message ?? String(e), variant: "destructive" }); // eslint-disable-line @typescript-eslint/no-explicit-any

function CalcView({ c, onOpenAccount }: { c: Calc; onOpenAccount: (acc: string, from: string, to: string) => void }) {
  return <div className="space-y-1 text-sm">
    {Object.keys(LBL).map((k) => { const l = c.lines[k]; return <div key={k} className="flex justify-between gap-2 border-b border-border py-1">
      <span>{LBL[k]}</span>{l ? <button className="underline" onClick={() => onOpenAccount(l.account_id, c.from, c.to)}>{fmtMoney(Number(l.amount))} · {l.entries} écriture(s)</button> : <span className="text-destructive">À compléter (compte non associé)</span>}</div>; })}
    <div className="flex justify-between font-semibold"><span>TPS nette à remettre (négatif = remboursement)</span><span>{money(c.gst_net)}</span></div>
    <div className="flex justify-between font-semibold"><span>TVQ nette à remettre (négatif = remboursement)</span><span>{money(c.qst_net)}</span></div>
    {c.drafts_in_period > 0 && <p className="text-destructive">{c.drafts_in_period} écriture(s) en brouillon dans la période — la préparation sera refusée tant qu'elles ne sont pas validées ou abandonnées.</p>}
  </div>;
}

export default function TaxReturns({ companyId, canWrite, onOpenAccount }: { companyId: string; canWrite: boolean; onOpenAccount: (acc: string, from: string, to: string) => void }) {
  const t = todayIn();
  const [p, setP] = useState({ from: t.slice(0, 8) + "01", to: t, due: "", note: "" });
  const [calc, setCalc] = useState<Calc | null>(null); const [list, setList] = useState<Ret[] | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => db.from("fin_tax_returns").select("*").eq("company_id", companyId).order("period_from", { ascending: false }).then(({ data, error }: any) => error ? fail(error) : setList(data)), [companyId]); // eslint-disable-line @typescript-eslint/no-explicit-any
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setCalc(null); if (!p.from || !p.to || p.from > p.to) return; db.rpc("fin_tax_period_compute", { _company: companyId, _from: p.from, _to: p.to }).then(({ data, error }: any) => error ? fail(error) : setCalc(data)); }, [companyId, p.from, p.to]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const act = async (fn: string, args: object, ok: string) => { setBusy(true); const { error } = await db.rpc(fn, args); setBusy(false); if (error) return fail(error); toast({ title: ok }); await load(); };
  const step = (r: Ret, action: string) => {
    if (action === "annulee") { const reason = window.prompt("Motif de l'annulation"); if (reason?.trim()) void act("fin_tax_return_step", { _id: r.id, _action: action, _date: null, _ref: null, _reason: reason }, "Préparation annulée"); return; }
    if (action === "revue") return void act("fin_tax_return_step", { _id: r.id, _action: action, _date: null, _ref: null, _reason: null }, "Marquée revue");
    const d = window.prompt("Date (AAAA-MM-JJ)", todayIn()); if (!d) return;
    const ref = window.prompt(action === "declaree_hors_app" ? "Numéro de confirmation reçu de l'ARC / Revenu Québec" : "Référence du paiement"); if (!ref?.trim()) return;
    void act("fin_tax_return_step", { _id: r.id, _action: action, _date: d, _ref: ref, _reason: null }, "Enregistré");
  };
  return <section className="space-y-4 text-sm" data-testid="tax-returns">
    <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs">Montants calculés seulement depuis les écritures validées des comptes TPS/TVQ associés (Plan de comptes et associations). Vrac Québec ne transmet aucune déclaration ni aucun paiement : vous déclarez et payez vous-même, puis consignez la confirmation ici. Taux et règles : moteur fiscal existant; aucune conformité fiscale n'est certifiée.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Période du<Input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} className="w-40" /></label>
      <label className="text-xs">au<Input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} className="w-40" /></label>
      <label className="text-xs">Échéance (selon votre avis)<Input type="date" value={p.due} onChange={(e) => setP({ ...p, due: e.target.value })} className="w-40" /></label>
    </div>
    {calc && <CalcView c={calc} onOpenAccount={onOpenAccount} />}
    {canWrite && calc && <div className="flex flex-wrap items-end gap-2">
      <Input placeholder="Note (facultative)" value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} className="w-64" />
      <Button disabled={busy || calc.missing.length > 0 || calc.drafts_in_period > 0} onClick={() => act("fin_tax_return_prepare", { _company: companyId, _from: p.from, _to: p.to, _due: p.due || null, _note: p.note }, "Préparation enregistrée (non transmise)")}>Figer la préparation</Button>
    </div>}
    <h4 className="font-semibold">Préparations</h4>
    {!list ? <p className="text-muted-foreground">Chargement…</p> : <ul className="space-y-2">{list.map((r) => <li key={r.id} className="rounded border border-border p-2">
      <div className="flex flex-wrap justify-between gap-2"><strong>{r.period_from} → {r.period_to}</strong><span>{ST[r.status] ?? r.status}</span></div>
      <p className="text-xs">TPS nette {money(r.gst_net)} · TVQ nette {money(r.qst_net)} · échéance {r.due_date ?? "à confirmer"}{r.filed_ref && ` · confirmation ${r.filed_ref} (${r.filed_on})`}{r.paid_ref && ` · paiement ${r.paid_ref} (${r.paid_on})`}{r.cancel_reason && ` · motif : ${r.cancel_reason}`}</p>
      {canWrite && <div className="mt-1 flex flex-wrap gap-1">
        {r.status === "preparee" && <Button size="sm" variant="outline" disabled={busy} onClick={() => step(r, "revue")}>Marquer revue</Button>}
        {(r.status === "preparee" || r.status === "revue") && <Button size="sm" variant="outline" disabled={busy} onClick={() => step(r, "declaree_hors_app")}>Consigner la déclaration faite</Button>}
        {r.status === "declaree_hors_app" && <Button size="sm" variant="outline" disabled={busy} onClick={() => step(r, "payee_hors_app")}>Consigner le paiement fait</Button>}
        {(r.status === "preparee" || r.status === "revue") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => step(r, "annulee")}>Annuler</Button>}
      </div>}
    </li>)}{!list.length && <li className="text-muted-foreground">Aucune préparation.</li>}</ul>}
  </section>;
}
