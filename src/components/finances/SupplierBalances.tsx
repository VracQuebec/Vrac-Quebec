// FIN-12F — Fiche fournisseur : factures à payer, trop-payés et notes de crédit disponibles (séparés),
// affectations, remboursements reçus et historique. Chaque action montre son effet (aperçu serveur) avant validation.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import * as P from "@/lib/finances/purchases";
import * as st from "@/lib/finances/settlement";
import { fmtDate, fmtMoney } from "@/lib/finances/period";
import { PaymentDialog, type PayTarget } from "@/components/finances/Settlements";

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
type Src = { kind: "payment" | "credit"; id: string; label: string; available: number };
type Act = { a: "alloc" | "refund"; src: Src } | null;

export default function SupplierBalances({ companyId, companyName, supplierId, supplierName, canWrite, canCorrect }: { companyId: string; companyName: string; supplierId: string; supplierName: string; canWrite: boolean; canCorrect: boolean }) {
  const [d, setD] = useState<P.SupBalances | null>(null); const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState<PayTarget[] | null>(null); const [act, setAct] = useState<Act>(null);
  const load = useCallback(() => P.supplierBalances(companyId, supplierId).then((x) => { setD(x); setErr(null); }).catch((e) => setErr(e.message)), [companyId, supplierId]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Chargement des soldes…</p>;
  const open = d.bills.filter((b) => b.rest > 0);
  const overs = d.payments.filter((p) => p.status === "validated" && p.available > 0);
  const crs = d.credits.filter((c) => c.status === "confirmed" && c.available > 0);
  const undo = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast({ title: ok }); } catch (e: any) { toast({ title: "Refusé", description: e.message, variant: "destructive" }); } await load(); };
  const ask = (q: string, fn: (r: string) => Promise<unknown>, ok: string) => { const r = window.prompt(q); if (r?.trim()) void undo(() => fn(r.trim()), ok); };
  const Refunds = ({ list, kind }: { list: P.SupRefund[]; kind: "payment" | "credit" }) => <>{list.map((r) => <li key={r.id} className={r.voided_at ? "text-muted-foreground line-through" : ""}>
    Remboursement reçu {fmtDate(r.date)} · {fmtMoney(r.amount)}{r.method ? ` · ${st.METHOD_LABEL[r.method] ?? r.method}` : ""}{r.account ? ` · ${r.account}` : ""}{r.reference ? ` · ${r.reference}` : ""}{r.voided_at ? ` — saisie annulée : ${r.void_reason}` : ""}
    {r.file_id && <span className="ml-1 inline-flex flex-wrap gap-1 no-underline" style={{ textDecoration: "none" }}>
      <Button size="sm" variant="outline" aria-label="Ouvrir le justificatif du remboursement" onClick={() => { const w = window.open("", "_blank"); P.openFile(r.file_id!).then((u) => { if (w) w.location.href = u; else window.location.href = u; }).catch((x) => { w?.close(); toast({ title: "Justificatif inaccessible", description: x.message, variant: "destructive" }); }); }}>Ouvrir le justificatif</Button>
      <Button size="sm" variant="outline" aria-label="Télécharger le justificatif du remboursement" onClick={() => P.openFile(r.file_id!, true).then((u) => { window.location.href = u; }).catch((x) => toast({ title: "Justificatif inaccessible", description: x.message, variant: "destructive" }))}>Télécharger</Button></span>}
    {canCorrect && !r.voided_at && <Button size="sm" variant="ghost" onClick={() => ask("Motif de l'annulation (enregistrement erroné; aucun transfert n'est créé) :", (x) => P.supRefundVoid(kind, r.id, x), "Remboursement annulé — disponible rétabli")}>Annuler</Button>}</li>)}</>;

  return <section className="space-y-3 text-sm" data-testid="sup-balances">
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Factures restant à payer</p><p className="font-display text-lg font-bold" data-testid="sb-rest">{fmtMoney(d.rest_total)}</p></div>
      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Trop-payés disponibles</p><p className="font-display text-lg font-bold" data-testid="sb-over">{fmtMoney(d.overpaid_available)}</p></div>
      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Notes de crédit disponibles</p><p className="font-display text-lg font-bold" data-testid="sb-credit">{fmtMoney(d.credit_available)}</p></div>
    </div>
    <p className="text-xs text-muted-foreground">Un disponible n'efface jamais automatiquement une facture : il faut l'affecter explicitement.</p>

    <div><p className="font-semibold">Factures restant à payer</p><ul className="divide-y rounded border text-xs">{open.map((b) => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
      <span>{b.reference ?? "—"} · total {fmtMoney(b.total)} · réglé {fmtMoney(b.paid)} · crédits {fmtMoney(b.credited)} · <strong>reste {fmtMoney(b.rest)}</strong> · {b.due_unknown ? "échéance inconnue" : fmtDate(b.due_date)}</span>
      {canWrite && <Button size="sm" variant="outline" onClick={() => setPay([{ id: b.occurrence_id, label: `Facture ${b.reference ?? ""}`, due_date: b.due_date ?? "", balance: b.rest, amount_quality: "confirmed", payee: supplierName, payee_key: `c:${supplierId}` }])}>Payer</Button>}</li>)}
      {!open.length && <li className="p-2 text-muted-foreground">Aucune facture à payer.</li>}</ul></div>

    <div><p className="font-semibold">Trop-payés disponibles</p><ul className="divide-y rounded border text-xs">{overs.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
      <span>Versement du {fmtDate(p.paid_on)} de {fmtMoney(p.amount)}{p.reference ? ` (${p.reference})` : ""} · <strong>disponible {fmtMoney(p.available)}</strong></span>
      {canWrite && <span className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={!open.length} onClick={() => setAct({ a: "alloc", src: { kind: "payment", id: p.id, label: `trop-payé du ${fmtDate(p.paid_on)}`, available: p.available } })}>Affecter à une facture</Button>
        <Button size="sm" variant="outline" onClick={() => setAct({ a: "refund", src: { kind: "payment", id: p.id, label: `trop-payé du ${fmtDate(p.paid_on)}`, available: p.available } })}>Remboursement reçu</Button></span>}</li>)}
      {!overs.length && <li className="p-2 text-muted-foreground">Aucun trop-payé disponible.</li>}</ul></div>

    <div><p className="font-semibold">Notes de crédit disponibles</p><ul className="divide-y rounded border text-xs">{crs.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
      <span>{c.reference ?? "—"} · crédit {fmtMoney(c.total)} · affecté {fmtMoney(c.allocated)} · remboursé {fmtMoney(c.refunded)} · <strong>disponible {fmtMoney(c.available)}</strong></span>
      {canWrite && <span className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={!open.length} onClick={() => setAct({ a: "alloc", src: { kind: "credit", id: c.id, label: `note ${c.reference ?? ""}`, available: c.available } })}>Affecter à une facture</Button>
        <Button size="sm" variant="outline" onClick={() => setAct({ a: "refund", src: { kind: "credit", id: c.id, label: `note ${c.reference ?? ""}`, available: c.available } })}>Remboursement reçu</Button></span>}</li>)}
      {!crs.length && <li className="p-2 text-muted-foreground">Aucune note de crédit disponible.</li>}</ul></div>

    {act?.a === "alloc" && <AllocForm src={act.src} bills={open} onClose={() => setAct(null)} onDone={() => { setAct(null); void load(); }} />}
    {act?.a === "refund" && <RefundForm companyId={companyId} src={act.src} onClose={() => setAct(null)} onDone={() => { setAct(null); void load(); }} />}

    <details open className="rounded border p-2"><summary className="font-semibold">Affectations, remboursements reçus et historique</summary>
      <ul className="mt-1 space-y-1 text-xs">
        {d.payments.map((p) => <li key={p.id}><p>Versement {fmtDate(p.paid_on)} · {fmtMoney(p.amount)} · {st.PAY_STATUS[p.status] ?? p.status}{p.excess_origin ? ` · excédent d'origine ${fmtMoney(p.excess_origin)}` : ""}</p>
          <ul className="pl-3">{p.allocs.map((a) => <li key={a.id} className={a.reversed_at ? "text-muted-foreground line-through" : ""}>{a.later ? "Affectation du disponible" : "Affectation"} → facture {a.bill_ref ?? "—"} · {fmtMoney(a.amount)}{a.reversed_at ? ` — annulée : ${a.reversed_reason}` : ""}
            {canCorrect && a.later && !a.reversed_at && <Button size="sm" variant="ghost" onClick={() => ask("Motif de l'annulation de l'affectation (aucun mouvement bancaire) :", (x) => st.reverseAlloc(a.id, x), "Affectation annulée — disponible et solde rétablis")}>Annuler</Button>}</li>)}
            <Refunds list={p.refunds} kind="payment" /></ul></li>)}
        {d.credits.map((c) => <li key={c.id}><p>Note de crédit {c.reference ?? "—"} · {fmtMoney(c.total)}{c.status === "void" ? " (annulée)" : ""}</p>
          <ul className="pl-3">{c.allocs.map((a) => <li key={a.id} className={a.reversed_at ? "text-muted-foreground line-through" : ""}>Affectation → facture {a.bill_ref ?? "—"} · {fmtMoney(a.amount)}{a.reversed_at ? ` — annulée : ${a.reversed_reason}` : ""}
            {canCorrect && !a.reversed_at && <Button size="sm" variant="ghost" onClick={() => ask("Motif de l'annulation de l'affectation (aucun mouvement bancaire) :", (x) => P.voidAlloc(a.id, x), "Affectation annulée — disponible et solde rétablis")}>Annuler</Button>}</li>)}
            <Refunds list={c.refunds} kind="credit" /></ul></li>)}
        {!d.payments.length && !d.credits.length && <li className="text-muted-foreground">Aucune opération.</li>}
      </ul></details>
    {pay && <PaymentDialog companyId={companyId} companyName={companyName} targets={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); void load(); }} />}
  </section>;
}

function AllocForm({ src, bills, onClose, onDone }: { src: Src; bills: P.SupBalances["bills"]; onClose: () => void; onDone: () => void }) {
  const [bill, setBill] = useState(bills[0]?.id ?? ""); const b = bills.find((x) => x.id === bill);
  const [amt, setAmt] = useState(() => String(Math.min(src.available, bills[0]?.rest ?? 0)));
  const [key] = useState(() => crypto.randomUUID()); const [busy, setBusy] = useState(false); const [e, setE] = useState<string | null>(null);
  const n = Math.round(Number(amt) * 100) / 100; const ok = !!b && n > 0 && n <= src.available && n <= b.rest;
  const go = async () => { setBusy(true); setE(null); try {
    if (src.kind === "payment") await st.allocate(src.id, [{ occurrence_id: b!.occurrence_id, amount: n }], key, false); else await P.allocCredit(src.id, b!.id, n, key);
    toast({ title: "Affectation enregistrée", description: "Aucune nouvelle sortie d'argent." }); onDone(); } catch (x: any) { setE(x.message); } finally { setBusy(false); } };
  return <div className="space-y-2 rounded-md border border-primary/40 p-3" data-testid="alloc-form">
    <p className="font-semibold">Affecter le {src.label} (disponible {fmtMoney(src.available)})</p>
    <label className="block text-xs">Facture du même fournisseur<select aria-label="Facture à couvrir" className={sel} value={bill} onChange={(x) => setBill(x.target.value)}>{bills.map((x) => <option key={x.id} value={x.id}>{x.reference ?? "—"} · reste {fmtMoney(x.rest)}</option>)}</select></label>
    <label className="block text-xs">Montant<Input aria-label="Montant à affecter" inputMode="decimal" value={amt} onChange={(x) => setAmt(x.target.value.replace(",", "."))} /></label>
    {b && <p className="rounded bg-muted/40 p-2 text-xs" data-testid="alloc-preview">Effet : facture {b.reference} {fmtMoney(b.rest)} → <strong>{fmtMoney(Math.max(b.rest - (n || 0), 0))}</strong> · disponible {fmtMoney(src.available)} → <strong>{fmtMoney(Math.max(src.available - (n || 0), 0))}</strong> · aucun mouvement d'argent.</p>}
    {e && <p role="alert" className="text-xs text-destructive">{e}</p>}
    <div className="flex gap-2"><Button size="sm" disabled={busy || !ok} onClick={go}>Confirmer l'affectation</Button><Button size="sm" variant="outline" onClick={onClose}>Retour</Button></div>
  </div>;
}

function RefundForm({ companyId, src, onClose, onDone }: { companyId: string; src: Src; onClose: () => void; onDone: () => void }) {
  const sk = `fin12f-refund:${src.id}`;
  const init = (() => { try { return JSON.parse(sessionStorage.getItem(sk) ?? "null"); } catch { return null; } })();
  const [f, setF] = useState<{ amount: string; date: string; account_id: string; method: string; reference: string; note: string; key: string }>(init ?? { amount: String(src.available), date: today(), account_id: "", method: "", reference: "", note: "", key: crypto.randomUUID() });
  const [accs, setAccs] = useState<{ id: string; name: string }[]>([]); const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<{ available: number; after?: number } | null>(null); const [e, setE] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { P.finAccounts(companyId).then(setAccs).catch(() => setAccs([])); }, [companyId]);
  useEffect(() => { try { sessionStorage.setItem(sk, JSON.stringify(f)); } catch { /* */ } }, [f, sk]);
  const body = (fid: string | null): P.RefundInput => ({ amount: Number(f.amount), date: f.date, account_id: f.account_id, method: f.method, reference: f.reference || null, file_id: fid, note: f.note || null, idem_key: f.key });
  useEffect(() => { setPrev(null); setE(null); if (!(Number(f.amount) > 0) || !f.account_id || !f.method || !f.date) return;
    const t = setTimeout(() => P.supRefund(src.kind, src.id, body(null), true).then(setPrev).catch((x) => setE(x.message)), 300); return () => clearTimeout(t); }, [f.amount, f.date, f.account_id, f.method, f.reference]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => { setBusy(true); setE(null); try {
    const fid = file ? (await P.uploadProof(companyId, file)).id : null;
    const r = await P.supRefund(src.kind, src.id, body(fid), false);
    try { sessionStorage.removeItem(sk); } catch { /* */ }
    toast({ title: r.replay ? "Remboursement déjà enregistré (aucun doublon)" : "Remboursement reçu enregistré", description: "Une entrée d'argent, aucun revenu." }); onDone();
  } catch (x: any) { setE(`${x.message} — votre saisie est conservée.`); } finally { setBusy(false); } };
  const up = (k: keyof typeof f) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: k === "amount" ? x.target.value.replace(",", ".") : x.target.value });
  return <div className="space-y-2 rounded-md border border-primary/40 p-3" data-testid="refund-form">
    <p className="font-semibold">Remboursement reçu — {src.label} (disponible {fmtMoney(src.available)})</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block text-xs">Montant reçu<Input aria-label="Montant reçu" inputMode="decimal" value={f.amount} onChange={up("amount")} /></label>
      <label className="block text-xs">Date de réception<Input aria-label="Date de réception" type="date" max={today()} value={f.date} onChange={up("date")} /></label>
      <label className="block text-xs">Compte financier<select aria-label="Compte financier" className={sel} value={f.account_id} onChange={up("account_id")}><option value="">Choisir…</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="block text-xs">Mode<select aria-label="Mode de réception" className={sel} value={f.method} onChange={up("method")}><option value="">Choisir…</option>{Object.entries(st.METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="block text-xs">Référence<Input aria-label="Référence du remboursement" value={f.reference} onChange={up("reference")} /></label>
      <label className="block text-xs">Justificatif privé (facultatif)<Input aria-label="Justificatif" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={(x) => setFile(x.target.files?.[0] ?? null)} /></label>
    </div>
    {prev && <p className="rounded bg-muted/40 p-2 text-xs" data-testid="refund-preview">Effet : une entrée d'argent de <strong>{fmtMoney(Number(f.amount))}</strong> au {fmtDate(f.date)} · disponible {fmtMoney(prev.available)} → <strong>{fmtMoney(prev.after ?? 0)}</strong> · ni vente ni revenu, document d'origine et taxes inchangés.</p>}
    {e && <p role="alert" className="text-xs text-destructive">{e}</p>}
    <div className="flex gap-2"><Button size="sm" disabled={busy || !prev} onClick={go}>Confirmer la réception</Button><Button size="sm" variant="outline" onClick={onClose}>Retour</Button></div>
  </div>;
}
