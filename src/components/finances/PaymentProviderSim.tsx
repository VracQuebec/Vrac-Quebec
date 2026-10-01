// FIN-11 — prestataire de paiement : état « non connecté », journal TEST brut/frais/net, scénarios simulés (personnes autorisées).
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { makeGuard } from "@/lib/finances/recurring";
import { money } from "@/lib/finances/accounts";
import * as P from "@/lib/finances/psp";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const fee = (v: unknown) => (v == null ? "inconnus" : money(v));

export default function PaymentProviderSim({ companyId }: { companyId: string }) {
  const [ov, setOv] = useState<J | null>(null); const [err, setErr] = useState<string | null>(null); const [n, setN] = useState(0);
  const guard = useRef(makeGuard()).current;
  useEffect(() => { const ok = guard.take(); setOv(null); setErr(null);
    P.overview(companyId).then((d) => ok() && setOv(d), (e) => ok() && setErr(e.message)); return () => guard.bump(); }, [companyId, n, guard]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return <div className="space-y-3 text-sm" data-testid="psp">
    <div className="rounded border border-border p-3" data-testid="psp-status">
      <p className="font-semibold">Paiement en ligne : Non connecté — simulation seulement</p>
      <p className="text-xs text-muted-foreground">Aucun prestataire réel n'est relié. Aucun lien payable, aucune carte, aucune coordonnée bancaire, aucun appel externe. Les transactions ci-dessous sont des essais TEST : elles ne valident pas une intégration réelle.</p>
    </div>
    {err && <p role="alert" className="text-destructive">Impossible de charger le journal : {err}</p>}
    {!ov && !err && <p className="text-muted-foreground">Chargement…</p>}
    {ov && <>
      {ov.sim_allowed ? <Scenario companyId={companyId} onDone={reload} /> : <p className="text-xs text-muted-foreground">Scénarios de simulation réservés aux entreprises TEST et aux personnes autorisées.</p>}
      <h3 className="font-semibold">Journal des transactions TEST</h3>
      <ul className="space-y-2">{ov.transactions.map((t: J) => <Tx key={t.id} t={t} companyId={companyId} canSim={ov.sim_allowed} onDone={reload} />)}
        {!ov.transactions.length && <li className="text-muted-foreground">Aucune transaction.</li>}</ul>
      {ov.orphans.length > 0 && <><h3 className="font-semibold">Événements sans transaction (à examiner)</h3>
        <ul className="text-xs">{ov.orphans.map((e: J) => <li key={e.id}>{P.TYPE[e.type] ?? e.type} · {e.event_id} · {P.OUTCOME[e.outcome]} — {e.note}</li>)}</ul></>}
    </>}
  </div>;
}

function useSend(companyId: string, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const send = async (evs: Omit<P.PspEvent, "currency" | "occurred_at">[]) => {
    setBusy(true);
    try { for (const e of evs) { const r = await P.simulator.send(companyId, { currency: "CAD", occurred_at: new Date().toISOString(), ...e });
        toast({ title: P.OUTCOME[r.outcome] ?? r.outcome, description: r.note ?? (r.duplicate ? "Événement déjà reçu" : undefined) }); } }
    catch (e) { toast({ title: "Refusé", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(false); onDone(); }
  };
  return { busy, send };
}

function Scenario({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const [inv, setInv] = useState<J[]>([]); const [sel, setSel] = useState(""); const [amt, setAmt] = useState(""); const [f, setF] = useState("");
  const { busy, send } = useSend(companyId, onDone);
  useEffect(() => { let on = true; db.from("fin_invoices").select("id, number, total, is_test").eq("company_id", companyId).eq("status", "emise").eq("is_test", true).order("number", { ascending: false }).limit(50)
    .then(({ data }: J) => on && setInv(data ?? [])); return () => { on = false; }; }, [companyId]);
  const base = () => ({ payment_ref: P.newRef("sim"), invoice_id: sel, amount: amt.replace(",", ".") });
  const go = (types: P.PspEventType[], withFee = false) => { const b = base(); void send(types.map((type) => ({ ...b, type, event_id: P.newRef("ev"), ...(withFee && type === "payment.succeeded" && f.trim() ? { fee: f.replace(",", ".") } : {}) }))); };
  return <section className="space-y-2 rounded border border-dashed border-border p-2" data-testid="psp-scenario">
    <p className="font-semibold">Scénario de simulation (TEST)</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Facture TEST émise<select aria-label="Facture TEST" className="block rounded border border-border bg-background p-2" value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">—</option>{inv.map((i) => <option key={i.id} value={i.id}>{i.number} · {money(i.total)}</option>)}</select></label>
      <label className="text-xs">Montant brut<Input aria-label="Montant brut" value={amt} onChange={(e) => setAmt(e.target.value)} className="w-28" placeholder="1000" /></label>
      <label className="text-xs">Frais fictifs (vide = inconnus)<Input aria-label="Frais fictifs" value={f} onChange={(e) => setF(e.target.value)} className="w-28" /></label>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy || !sel || !amt} onClick={() => go(["payment.pending", "payment.succeeded"], true)}>Paiement confirmé</Button>
      <Button size="sm" variant="outline" disabled={busy || !sel || !amt} onClick={() => go(["payment.pending"])}>En attente</Button>
      <Button size="sm" variant="outline" disabled={busy || !sel || !amt} onClick={() => go(["payment.pending", "payment.failed"])}>Échec</Button>
      <Button size="sm" variant="outline" disabled={busy || !sel || !amt} onClick={() => go(["payment.canceled"])}>Annulation</Button>
      <Button size="sm" variant="outline" disabled={busy || !sel || !amt} onClick={() => go(["payment.succeeded", "payment.pending"], true)}>Désordre (confirmé puis « en cours »)</Button>
    </div>
  </section>;
}

function Tx({ t, companyId, canSim, onDone }: { t: J; companyId: string; canSim: boolean; onDone: () => void }) {
  const { busy, send } = useSend(companyId, onDone); const [v, setV] = useState("");
  const last = t.events[t.events.length - 1];
  const adj = (type: P.PspEventType, prefix: string, extra: Partial<P.PspEvent> = {}) => void send([{ type, event_id: P.newRef("ev"), payment_ref: t.payment_ref, adjustment_ref: P.newRef(prefix), amount: v.replace(",", "."), ...extra }]);
  return <li className="rounded border border-border p-2" data-testid="psp-tx">
    <p><strong>{t.payment_ref}</strong> · <a className="underline" href={`?tab=factures&facture=${t.invoice_id}`}>{t.invoice_number}</a> · {P.STATUS[t.status]}
      {t.receipt_id && <> · règlement {t.receipt_voided ? "annulé (retour)" : "enregistré"}</>}</p>
    <p>Brut {money(t.gross)} · Frais {fee(t.fee)} · Net {t.net == null ? "inconnu" : money(t.net)} · {t.currency}
      {Number(t.refunded) > 0 && ` · remboursé ${money(t.refunded)}`}{Number(t.returned) > 0 && ` · retourné ${money(t.returned)}`}{Number(t.disputed) > 0 && ` · en litige ${money(t.disputed)}`}{Number(t.paid_out) > 0 && ` · versé ${money(t.paid_out)}`}</p>
    {t.review.length > 0 && <ul className="text-xs text-destructive">{t.review.map((r: string, k: number) => <li key={k}>À examiner : {r}</li>)}</ul>}
    <details className="text-xs"><summary>Événements ({t.events.length})</summary><ul>{t.events.map((e: J) => <li key={e.id}>{e.received_at.slice(0, 19).replace("T", " ")} UTC · {P.TYPE[e.type] ?? e.type} · {e.event_id} · {P.OUTCOME[e.outcome]}{e.note && ` — ${e.note}`}</li>)}</ul></details>
    {canSim && <div className="mt-1 flex flex-wrap items-end gap-1">
      <Input aria-label="Montant de l'ajustement" value={v} onChange={(e) => setV(e.target.value)} className="w-24" placeholder="montant" />
      {last && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send([{ type: last.type, event_id: last.event_id, payment_ref: t.payment_ref, invoice_id: t.invoice_id, amount: last.amount ?? undefined, ...(last.fee != null ? { fee: last.fee } : {}) }])}>Renvoyer le dernier (doublon)</Button>}
      <Button size="sm" variant="ghost" disabled={busy || !v} onClick={() => void send([{ type: "fee.known", event_id: P.newRef("ev"), payment_ref: t.payment_ref, fee: v.replace(",", ".") }])}>Frais connus</Button>
      <Button size="sm" variant="ghost" disabled={busy || !v} onClick={() => adj("refund.succeeded", "rf")}>Remboursement</Button>
      <Button size="sm" variant="ghost" disabled={busy || !v} onClick={() => adj("payment.returned", "rt")}>Retour</Button>
      <Button size="sm" variant="ghost" disabled={busy || !v} onClick={() => adj("dispute.opened", "dp")}>Litige</Button>
      <Button size="sm" variant="ghost" disabled={busy || !v} onClick={() => adj("payout.paid", "po")}>Versement du net</Button>
    </div>}
  </li>;
}
