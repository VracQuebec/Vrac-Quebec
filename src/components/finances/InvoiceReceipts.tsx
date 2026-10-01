// FIN-08B — Encaissements clients d'une facture émise (déclarés manuellement, non rapprochés).
// Séparés des règlements fournisseurs; le serveur synchronise l'entrée attendue liée.
// Chargement/erreur explicites (jamais de faux zéro), réponses périmées ignorées, clé de saisie conservée
// jusqu'à confirmation (réessai après réponse perdue = même clé = un seul encaissement).
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { METHOD_LABEL } from "@/lib/finances/settlement";
import { fmtDate, todayIn } from "@/lib/finances/period";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const money = (n?: number | null) => Number(n ?? 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
type Sum = { total: number; legacy: number; receipts: number; received: number; rest: number; unallocated: number; paid: boolean };
const emptyForm = () => ({ amount: "", date: todayIn(), method: "virement", account: "", ref: "" });

export default function InvoiceReceipts({ invoiceId, companyId, canWrite, onChanged }: { invoiceId: string; companyId: string; canWrite: boolean; onChanged: () => void }) {
  const [sum, setSum] = useState<Sum | null>(null);
  const [rows, setRows] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [accErr, setAccErr] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState(emptyForm);
  const idem = useRef<string>(crypto.randomUUID());
  const gen = useRef(0); // invalide les réponses d'une ancienne facture/entreprise
  const key = `${companyId}:${invoiceId}`;

  const load = useCallback(async () => {
    const my = ++gen.current; setStatus("loading");
    try {
      const [s, r, a] = await Promise.all([db.rpc("fin_invoice_receipt_summary", { _invoice: invoiceId }),
        db.from("fin_invoice_receipts").select("*").eq("invoice_id", invoiceId).order("received_on").order("created_at"),
        db.from("fin_accounts").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name")]);
      if (my !== gen.current) return;
      if (s.error || r.error || !s.data) { setStatus("error"); return; }
      setSum(s.data); setRows(r.data ?? []); setAccounts(a.data ?? []); setAccErr(!!a.error); setStatus("ready");
    } catch { if (my === gen.current) setStatus("error"); }
  }, [invoiceId, companyId]);

  useEffect(() => { // changement de facture/entreprise : tout repart de zéro
    setSum(null); setRows([]); setAccounts([]); setOpen(false); setBusy(false); setF(emptyForm()); idem.current = crypto.randomUUID();
    void load();
    return () => { gen.current++; };
  }, [key, load]);

  const add = async () => {
    if (busy) return; const amount = Number(f.amount.replace(",", "."));
    if (!(amount > 0)) return toast({ title: "Montant positif requis", variant: "destructive" });
    setBusy(true); const my = gen.current; const forKey = key;
    let res: { data: any; error: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { res = await db.rpc("fin_invoice_receipt_add", { _invoice: invoiceId, _amount: amount, _date: f.date, _method: f.method, _account: f.account || null, _ref: f.ref, _idem: idem.current }); }
    catch { res = { data: null, error: { message: "Réponse non reçue. Réessayez : la même saisie ne sera enregistrée qu'une fois." } }; }
    if (my !== gen.current || forKey !== key) return;
    setBusy(false);
    // Erreur ou réponse perdue : on garde la clé, un nouvel envoi rejoue la même saisie.
    if (res.error) return toast({ title: "Non confirmé", description: res.error.message, variant: "destructive" });
    const data = res.data;
    idem.current = crypto.randomUUID(); setOpen(false); setF(emptyForm());
    toast({ title: data.replayed ? "Encaissement déjà enregistré" : "Encaissement déclaré", description: data.unallocated > 0 ? `Trop-perçu de ${money(data.unallocated)} conservé comme montant client non affecté.` : `Reste à recevoir : ${money(data.rest)}` });
    await load(); onChanged();
  };
  const voidRow = async (id: string) => {
    const reason = window.prompt("Motif de l'annulation de cette saisie (ce n'est pas un remboursement) :") ?? "";
    if (!reason.trim()) return;
    const my = gen.current;
    const { error } = await db.rpc("fin_invoice_receipt_void", { _id: id, _reason: reason });
    if (my !== gen.current) return;
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    await load(); onChanged();
  };

  if (status === "loading" && !sum) return <section aria-busy="true" className="rounded border border-border p-2 text-sm"><h3 className="font-display font-bold">Encaissements</h3><p className="text-xs text-muted-foreground">Chargement des encaissements…</p></section>;
  if (status === "error" || !sum) return <section role="alert" className="space-y-2 rounded border border-destructive/50 p-2 text-sm"><h3 className="font-display font-bold">Encaissements</h3>
    <p className="text-xs">Encaissements indisponibles : le reste à recevoir n'a pas pu être calculé (aucun montant affiché pour éviter un faux zéro).</p>
    <Button size="sm" variant="outline" onClick={() => void load()}>Réessayer</Button></section>;
  const acc = (id: string) => accounts.find((a) => a.id === id)?.name;
  return <section className="space-y-2 rounded border border-border p-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-display font-bold">Encaissements</h3>
      {canWrite && !open && <Button size="sm" onClick={() => setOpen(true)}>Enregistrer un encaissement</Button>}
    </div>
    <p className="text-xs">Total {money(sum.total)} · encaissé {money(sum.received)} · <strong>reste {money(sum.rest)}</strong>{sum.paid ? " · Payée" : ""}
      {sum.unallocated > 0 && <> · <span className="text-amber-800">trop-perçu non affecté {money(sum.unallocated)}</span></>}</p>
    {open && <div className="grid gap-2 rounded bg-secondary/40 p-2 sm:grid-cols-2">
      <p className="text-xs text-muted-foreground sm:col-span-2">Encaissement déclaré manuellement, sans confirmation bancaire. Paiement partiel accepté.</p>
      <label className="text-xs">Montant<Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={String(sum.rest)} /></label>
      <label className="text-xs">Date<Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      <label className="text-xs">Moyen<select className={`${sel} w-full`} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-xs">Compte (facultatif, informatif)<select className={`${sel} w-full`} value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">Non précisé</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {accErr && <span className="text-destructive">Comptes indisponibles : saisie possible sans compte.</span>}</label>
      <label className="text-xs sm:col-span-2">Référence<Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="n° de chèque, virement…" /></label>
      <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={busy} onClick={add}>{busy ? "Envoi…" : "Enregistrer"}</Button><Button size="sm" variant="outline" onClick={() => setOpen(false)}>Annuler</Button></div>
    </div>}
    <ul className="divide-y divide-border text-xs">
      {sum.legacy > 0 && <li className="py-1">Déclaration antérieure : {money(sum.legacy)} (date et moyen non connus)</li>}
      {rows.map((r) => <li key={r.id} className={`flex flex-wrap items-center gap-2 py-1 ${r.voided_at ? "text-muted-foreground line-through" : ""}`}>
        <span>{fmtDate(r.received_on)} · {money(r.amount)} · {METHOD_LABEL[r.method] ?? r.method}{r.account_id ? ` · ${acc(r.account_id) ?? "compte"}` : ""}{r.reference ? ` · ${r.reference}` : ""}</span>
        {r.voided_at ? <span className="no-underline">Saisie annulée : {r.void_reason}</span> : canWrite && <button className="ml-auto underline" onClick={() => voidRow(r.id)}>Annuler la saisie</button>}
      </li>)}
      {!rows.length && !sum.legacy && <li className="py-1 text-muted-foreground">Aucun encaissement.</li>}
    </ul>
  </section>;
}
