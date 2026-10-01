// FIN-08B — Encaissements clients d'une facture émise (déclarés manuellement, non rapprochés).
// Séparés des règlements fournisseurs; le serveur synchronise l'entrée attendue liée.
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

export default function InvoiceReceipts({ invoiceId, companyId, canWrite, onChanged }: { invoiceId: string; companyId: string; canWrite: boolean; onChanged: () => void }) {
  const [sum, setSum] = useState<Sum | null>(null);
  const [rows, setRows] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ amount: "", date: todayIn(), method: "virement", account: "", ref: "" });
  const idem = useRef<string>(crypto.randomUUID());

  const load = useCallback(async () => {
    const [s, r, a] = await Promise.all([db.rpc("fin_invoice_receipt_summary", { _invoice: invoiceId }),
      db.from("fin_invoice_receipts").select("*").eq("invoice_id", invoiceId).order("received_on").order("created_at"),
      db.from("fin_accounts").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name")]);
    setSum(s.data); setRows(r.data ?? []); setAccounts(a.data ?? []);
  }, [invoiceId, companyId]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (busy) return; const amount = Number(f.amount.replace(",", "."));
    if (!(amount > 0)) return toast({ title: "Montant positif requis", variant: "destructive" });
    setBusy(true);
    const { data, error } = await db.rpc("fin_invoice_receipt_add", { _invoice: invoiceId, _amount: amount, _date: f.date, _method: f.method, _account: f.account || null, _ref: f.ref, _idem: idem.current });
    setBusy(false);
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    idem.current = crypto.randomUUID(); setOpen(false); setF({ ...f, amount: "", ref: "" });
    toast({ title: data.replayed ? "Encaissement déjà enregistré" : "Encaissement déclaré", description: data.unallocated > 0 ? `Trop-perçu de ${money(data.unallocated)} conservé comme montant client non affecté.` : `Reste à recevoir : ${money(data.rest)}` });
    await load(); onChanged();
  };
  const voidRow = async (id: string) => {
    const reason = window.prompt("Motif de l'annulation de cette saisie (ce n'est pas un remboursement) :") ?? "";
    if (!reason.trim()) return;
    const { error } = await db.rpc("fin_invoice_receipt_void", { _id: id, _reason: reason });
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    await load(); onChanged();
  };

  if (!sum) return null;
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
      <label className="text-xs">Compte (facultatif)<select className={`${sel} w-full`} value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">Non précisé</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="text-xs sm:col-span-2">Référence<Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="n° de chèque, virement…" /></label>
      <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={busy} onClick={add}>Enregistrer</Button><Button size="sm" variant="outline" onClick={() => setOpen(false)}>Annuler</Button></div>
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
