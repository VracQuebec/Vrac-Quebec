// FIN-15 — Flux de trésorerie (méthode directe) : mouvements des comptes comptables liés aux comptes financiers,
// ventilés par compte de contrepartie, depuis les écritures validées seulement. Virements internes exclus.
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, todayIn } from "@/lib/finances/period";

type Row = { account_id: string; number: string; name: string; category: string; inflow: number; outflow: number; net: number; entries: number };
type Data = { from: string; to: string; currency: string; cash_accounts: number; opening: number; closing: number; net_change: number; rows: Row[] };
const CAT: Record<string, string> = { revenus: "Revenus", depenses: "Dépenses", actif: "Actif", passif: "Passif", capitaux: "Capitaux propres", capitaux_propres: "Capitaux propres" };

export default function CashFlow({ companyId, onOpenAccount }: { companyId: string; onOpenAccount: (acc: string, from: string, to: string) => void }) {
  const [from, setFrom] = useState(todayIn().slice(0, 5) + "01-01"); const [to, setTo] = useState(todayIn());
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!from || !to) return; let live = true; setErr(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("fin_gl_cash_flow", { _company: companyId, _from: from, _to: to }).then(({ data, error }: any) => { if (!live) return; if (error) { setD(null); setErr(error.message); } else setD(data); });
    return () => { live = false; };
  }, [companyId, from, to]);
  const groups = d ? Object.entries(d.rows.reduce<Record<string, Row[]>>((m, r) => { (m[r.category] ??= []).push(r); return m; }, {})) : [];
  return <section className="space-y-3 text-sm" data-testid="cash-flow">
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Du<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></label>
      <label className="text-xs">Au<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></label>
    </div>
    <p className="text-xs text-muted-foreground">Écritures validées seulement, en CAD. Trésorerie = comptes comptables associés à un compte financier (banque, caisse). Les virements entre ces comptes s'annulent et ne figurent pas. Classement par catégorie de compte, sans prétendre à une présentation normalisée.</p>
    {err && <p role="alert" className="text-destructive">{err}</p>}
    {d && d.cash_accounts === 0 && <p className="rounded border border-destructive p-2 text-destructive">À compléter : aucun compte financier n'est associé à un compte comptable (Plan de comptes et associations).</p>}
    {d && <>
      <div className="grid grid-cols-3 gap-2">
        {([["Trésorerie d'ouverture", d.opening], ["Variation nette", d.net_change], ["Trésorerie de clôture", d.closing]] as const).map(([l, v]) =>
          <div key={l} className="rounded border border-border p-2"><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold">{fmtMoney(Number(v))}</p></div>)}
      </div>
      {groups.map(([cat, list]) => <div key={cat}><p className="font-semibold">{CAT[cat] ?? cat}</p>
        <ul className="divide-y divide-border rounded border border-border text-xs">{list.map((r) => <li key={r.account_id}>
          <button className="flex w-full flex-wrap justify-between gap-2 p-2 text-left" onClick={() => onOpenAccount(r.account_id, d.from, d.to)}>
            <span className="underline">{r.number} · {r.name}</span>
            <span>entrées {fmtMoney(Number(r.inflow))} · sorties {fmtMoney(Number(r.outflow))} · <strong>net {fmtMoney(Number(r.net))}</strong> · {r.entries} écriture(s)</span>
          </button></li>)}</ul>
        <p className="text-right text-xs">Sous-total {fmtMoney(list.reduce((a, r) => a + Number(r.net), 0))}</p></div>)}
      {!d.rows.length && <p className="text-muted-foreground">Aucun mouvement de trésorerie validé sur la période.</p>}
    </>}
  </section>;
}
