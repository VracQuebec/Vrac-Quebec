// FIN-14 — Rapprochement comptes clients/fournisseurs : solde du compte de contrôle (grand livre)
// comparé aux soldes opérationnels (factures émises, achats fournisseurs). Lecture seule : un écart
// s'examine et se corrige par écriture, jamais en modifiant les montants opérationnels.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/finances/period";

type Side = { mapped: boolean; gl: number | null; operational: number; gap: number | null; rest?: number; available?: number };
type Data = { on: string; drafts: number; ar: Side; ap: Side };

function Card({ title, s, note }: { title: string; s: Side; note: string }) {
  const ok = s.gap !== null && Math.abs(s.gap) < 0.005;
  return <div className="rounded border border-border p-3 space-y-1">
    <h3 className="font-semibold">{title}</h3>
    {!s.mapped ? <p className="text-destructive">À compléter : compte de contrôle non associé (Plan de comptes et associations).</p> : <>
      <p>Grand livre : <b>{fmtMoney(s.gl ?? 0)}</b></p>
      <p>Soldes opérationnels : <b>{fmtMoney(s.operational)}</b>{s.available ? <span className="text-muted-foreground"> (reste {fmtMoney(s.rest ?? 0)} − crédits/trop-payés {fmtMoney(s.available)})</span> : null}</p>
      <p className={ok ? "text-primary" : "text-destructive"}>{ok ? "Concordant" : `Écart à examiner : ${fmtMoney(s.gap ?? 0)}`}</p>
    </>}
    <p className="text-xs text-muted-foreground">{note}</p>
  </div>;
}

export default function SubledgerCheck({ companyId }: { companyId: string }) {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let live = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("fin_gl_subledger_check", { _company: companyId }).then(({ data, error }: any) => { if (live) { setErr(error?.message ?? null); setD(error ? null : data); } });
    return () => { live = false; }; }, [companyId]);
  return <section className="space-y-3 text-sm" data-testid="subledger-check">
    <p className="text-xs text-muted-foreground">Comparaison au jour d'aujourd'hui, écritures validées seulement. Un écart peut venir d'opérations « À compléter », de brouillons ou d'écritures manuelles; il se corrige par une écriture, jamais en changeant une facture ou un paiement.</p>
    {err && <p role="alert" className="text-destructive">{err}</p>}
    {d && d.drafts > 0 && <p className="rounded border border-border p-2">{d.drafts} brouillon(s) non validé(s) exclus du calcul.</p>}
    {d && <div className="grid gap-3 md:grid-cols-2">
      <Card title="Comptes clients" s={d.ar} note="Reste à encaisser des factures émises (après notes de crédit et encaissements)." />
      <Card title="Comptes fournisseurs" s={d.ap} note="Reste à payer des achats, moins crédits et trop-payés disponibles." />
    </div>}
  </section>;
}
