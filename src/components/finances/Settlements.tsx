// FIN-03 — Enregistrement et consultation des règlements déclarés (aucun argent n'est envoyé).
import { useEffect, useMemo, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import * as st from "@/lib/finances/settlement";
import { addDays, fmtDate, fmtMoney, todayIn } from "@/lib/finances/period";

const TZ = "America/Toronto";
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const r2 = (n: number) => Math.round(n * 100) / 100;
const isConflict = (m: string) => /Rechargez|Solde actualisé|déjà réglée|reliquat/i.test(m);

export type PayTarget = { id: string; label: string; due_date: string; balance: number | null | undefined; amount_quality: string; payee: string | null; payee_key?: string };

/** Enregistrer un règlement : une ou plusieurs échéances du même bénéficiaire. */
export function PaymentDialog({ companyId, companyName, targets, onClose, onDone }: { companyId: string; companyName: string; targets: PayTarget[]; onClose: () => void; onDone: () => void }) {
  const payeeKey = targets[0]?.payee_key ?? "";
  const [idem] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState<Awaited<ReturnType<typeof st.openForPayee>> | null>(null);
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(targets.map((t) => [t.id, String(t.balance ?? "")])));
  const [amount, setAmount] = useState(() => String(r2(targets.reduce((s, t) => s + Number(t.balance ?? 0), 0))));
  const [date, setDate] = useState(todayIn(TZ));
  const [method, setMethod] = useState("");
  const [more, setMore] = useState(false);
  const [src, setSrc] = useState(""); const [ref, setRef] = useState(""); const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sum, setSum] = useState<st.SaveResult | null>(null);
  const [sumErr, setSumErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const future = date > todayIn(TZ);
  const loadOpen = () => st.openForPayee(companyId, payeeKey).then((l) => {
    setOpen(l);
    setPick((p) => Object.fromEntries(Object.entries(p).filter(([id]) => l.some((o) => o.id === id)).map(([id, v]) => [id, String(Math.min(Number(v || 0), l.find((o) => o.id === id)!.balance))])));
  }).catch((e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }));
  useEffect(() => { void loadOpen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const allocs = useMemo(() => Object.entries(pick).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ occurrence_id: id, amount: r2(Number(v)) })), [pick]);
  const body = { amount: Number(amount), paid_on: date, method, source_label: src || null, reference: ref || null, note: note || null, idem_key: idem, allocations: allocs, draft: future };

  useEffect(() => {
    setSum(null); setSumErr(null);
    if (!allocs.length || !(Number(amount) > 0) || !method || !date) return;
    const t = setTimeout(() => st.savePayment(companyId, body, true).then(setSum).catch((e) => setSumErr(e.message)), 300);
    return () => clearTimeout(t);
  }, [JSON.stringify(allocs), amount, date, method, src, ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggest = () => {
    let left = Number(amount) || 0; const next: Record<string, string> = {};
    (open ?? []).filter((o) => o.id in pick).sort((a, b) => a.due_date.localeCompare(b.due_date)).forEach((o) => { const a = r2(Math.min(o.balance, left)); next[o.id] = String(a); left = r2(left - a); });
    setPick(next);
  };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await st.savePayment(companyId, body, false);
      let missing = 0;
      for (const f of files) { try { await st.attachFile(companyId, r.payment_id!, f); } catch (e: any) { missing++; toast({ title: `Pièce « ${f.name} » non jointe`, description: e.message, variant: "destructive" }); } }
      toast({ title: future ? "Brouillon enregistré (sans effet sur les soldes)" : r.replayed ? "Règlement déjà enregistré (aucun doublon créé)" : "Règlement déclaré — non rapproché", description: !files.length || missing ? "Aucune pièce justificative jointe pour l'instant." : undefined });
      onDone();
    } catch (e: any) { if (isConflict(e.message)) setConflict(e.message); else toast({ title: "Non enregistré", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden sm:max-w-xl [&>*]:min-w-0">
    <DialogHeader><DialogTitle>Enregistrer un règlement</DialogTitle></DialogHeader>
    <p className="text-sm">Entreprise : <strong>{companyName}</strong> · Bénéficiaire : <strong>{targets[0]?.payee ?? "non précisé"}</strong></p>
    <p className="rounded-md bg-secondary p-2 text-xs">Déclaration d'un versement déjà effectué hors plateforme. Rien n'est envoyé et aucune banque n'est consultée.</p>
    {conflict && <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm">{conflict}<div className="mt-2"><Button size="sm" variant="outline" onClick={() => { setConflict(null); void loadOpen(); }}>Recharger les soldes actuels</Button></div></div>}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Montant versé (CAD) *</span><Input aria-label="Montant versé" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Date du versement effectué *</span><Input aria-label="Date du versement" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="text-sm sm:col-span-2"><span className="mb-1 block text-xs text-muted-foreground">Moyen *</span><select aria-label="Moyen" className={`${sel} w-full`} value={method} onChange={(e) => setMethod(e.target.value)}><option value="">— Choisir —</option>{Object.entries(st.METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    </div>
    {future && <p className="text-xs text-amber-700">Date future : ce sera un brouillon (planification), pas un versement effectué. Il ne change aucun solde.</p>}
    <section className="space-y-1"><div className="flex items-center justify-between"><p className="font-display text-sm font-bold">Échéances couvertes</p>{(open?.length ?? 0) > 0 && <Button size="sm" variant="ghost" onClick={suggest}>Répartir par ordre chronologique</Button>}</div>
      {!open ? <p className="text-xs text-muted-foreground">Chargement…</p> : open.length === 0 ? <p className="text-xs text-muted-foreground">Aucune échéance ouverte pour ce bénéficiaire.</p> :
        <ul className="max-h-56 space-y-1 overflow-y-auto">{open.map((o) => <li key={o.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" aria-label={`Couvrir ${o.label} du ${fmtDate(o.due_date)}`} checked={o.id in pick} onChange={(e) => setPick((p) => { const n = { ...p }; if (e.target.checked) n[o.id] = String(o.balance); else delete n[o.id]; return n; })} />
          <span className="min-w-0 flex-1 break-words">{fmtDate(o.due_date)} · {o.label} · reste {fmtMoney(o.balance)}{o.amount_quality === "estimated" ? " (estimé)" : ""}</span>
          {o.id in pick && <Input aria-label={`Affecté à ${fmtDate(o.due_date)}`} className="h-8 w-28" type="number" min="0" step="0.01" value={pick[o.id]} onChange={(e) => setPick({ ...pick, [o.id]: e.target.value })} />}
        </li>)}</ul>}
    </section>
    <button type="button" className="text-left text-sm font-semibold text-primary" onClick={() => setMore(!more)}>{more ? "Masquer" : "Ajouter"} référence, compte source, note</button>
    {more && <div className="grid gap-2 sm:grid-cols-2">
      <Input placeholder="Compte ou carte source (ex. : Visa ••1234)" aria-label="Compte source" value={src} onChange={(e) => setSrc(e.target.value)} />
      <Input placeholder="Référence de transaction ou n° de chèque" aria-label="Référence" value={ref} onChange={(e) => setRef(e.target.value)} />
      <Textarea className="sm:col-span-2" placeholder="Note interne" value={note} onChange={(e) => setNote(e.target.value)} />
    </div>}
    <label className="flex cursor-pointer flex-wrap items-center gap-2 text-sm"><Paperclip className="h-4 w-4" /><span>Pièces justificatives (facultatif)</span><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="min-w-0 max-w-full text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
    {!files.length && <p className="text-xs text-muted-foreground">Aucune pièce : le règlement sera marqué « pièce manquante ». Vous pourrez l'ajouter plus tard.</p>}
    {(sum || sumErr) && <section aria-label="Résumé" className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-2 text-sm">
      <p className="font-display font-bold">Résumé avant validation</p>
      {sumErr ? <p className="text-destructive" role="alert">{sumErr}</p> : sum && <>
        <p>Versement de <strong>{fmtMoney(sum.amount ?? Number(amount))}</strong> à {sum.payee}{future ? " — brouillon" : ""}</p>
        <ul className="text-xs">{sum.rows.map((x) => <li key={x.occurrence_id}>{fmtDate(x.due)} · {x.label} : {fmtMoney(x.alloc)} → nouveau solde {fmtMoney(x.balance_after)}{x.quality === "estimated" ? " (basé sur une estimation)" : ""}</li>)}</ul>
        {sum.remainder > 0 && <p className="text-xs text-amber-700" data-testid="reliquat">Reliquat non affecté : {fmtMoney(sum.remainder)} — avance / trop-payé auprès de ce bénéficiaire, à confirmer selon la pièce.</p>}
        {sum.duplicates.length > 0 && <p className="text-xs text-amber-700">Doublon probable : un règlement du même montant, à la même date et au même bénéficiaire existe déjà. Deux versements légitimes restent possibles.</p>}
      </>}
    </section>}
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annuler</Button><Button disabled={busy || !sum} onClick={submit}>{busy ? "Enregistrement…" : future ? "Enregistrer le brouillon" : "Valider le règlement"}</Button></div>
  </DialogContent></Dialog>;
}

/** Fiche d'un règlement : affectations, pièces, reliquat, corrections traçables. */
export function PaymentDetail({ id, companyId, canWrite, canCorrect, onClose, onChanged }: { id: string; companyId: string; canWrite: boolean; canCorrect: boolean; onClose: () => void; onChanged: () => void }) {
  const [p, setP] = useState<any>(null);
  const [mode, setMode] = useState<null | "void" | "refund" | "alloc">(null);
  const [kind, setKind] = useState<"entry_error" | "returned">("entry_error");
  const [reason, setReason] = useState(""); const [amt, setAmt] = useState(""); const [date, setDate] = useState(todayIn(TZ));
  const [open, setOpen] = useState<Awaited<ReturnType<typeof st.openForPayee>>>([]); const [target, setTarget] = useState("");
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const load = () => st.payDetail(id).then(setP).catch((e) => toast({ title: "Accès refusé", description: e.message, variant: "destructive" }));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === "alloc" && p) st.openForPayee(companyId, p.payee_key).then(setOpen); }, [mode, p, companyId]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast({ title: msg }); setMode(null); setReason(""); setAmt(""); setIdem(crypto.randomUUID()); await load(); onChanged(); }
    catch (e: any) { toast({ title: "Non enregistré", description: e.message, variant: "destructive" }); await load(); } finally { setBusy(false); }
  };
  if (!p) return <Dialog open onOpenChange={onClose}><DialogContent><p className="text-sm">Chargement…</p></DialogContent></Dialog>;
  const active = p.status === "validated";
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden sm:max-w-lg [&>*]:min-w-0">
    <DialogHeader><DialogTitle>Règlement — {p.payee_name}</DialogTitle></DialogHeader>
    <p className={`rounded-md p-2 text-xs font-semibold ${active ? "bg-primary/10" : "bg-secondary"}`}>{st.PAY_STATUS[p.status]}{p.void_reason ? ` : ${p.void_reason}` : ""}</p>
    <dl className="grid grid-cols-2 gap-1 text-sm">
      <dt className="text-muted-foreground">Montant versé</dt><dd className="font-bold">{fmtMoney(p.amount)}</dd>
      <dt className="text-muted-foreground">Date du versement déclarée</dt><dd>{fmtDate(p.paid_on)}</dd>
      <dt className="text-muted-foreground">Saisi le</dt><dd>{new Date(p.entered_at).toLocaleString("fr-CA", { timeZone: TZ })}{p.is_support ? " (assistance)" : ""}</dd>
      <dt className="text-muted-foreground">Date bancaire</dt><dd className="text-muted-foreground">Non rapproché</dd>
      <dt className="text-muted-foreground">Moyen</dt><dd>{st.METHOD_LABEL[p.method]}{p.source_label ? ` · ${p.source_label}` : ""}</dd>
      {p.reference && <><dt className="text-muted-foreground">Référence</dt><dd>{p.reference}</dd></>}
      {active && <><dt className="text-muted-foreground">Reliquat non affecté</dt><dd data-testid="dispo">{fmtMoney(p.available)}</dd></>}
    </dl>
    {p.note && <p className="text-xs">Note : {p.note}</p>}
    {p.method === "carte" && <p className="text-xs text-muted-foreground">Payé par carte : le fournisseur est couvert, mais la sortie du compte bancaire n'est pas prouvée.</p>}
    {p.duplicates?.length > 0 && <p className="text-xs text-amber-700">Doublon probable : {p.duplicates.length} autre(s) règlement(s) identique(s) (même date, montant, bénéficiaire).</p>}
    <section><p className="font-display text-sm font-bold">Affectations</p>
      <ul className="space-y-1 text-xs">{p.allocations.map((a: any) => <li key={a.id} className={`flex items-center justify-between gap-2 ${a.reversed_at ? "text-muted-foreground line-through" : ""}`}>
        <span>{fmtDate(a.due)} · {a.label} : {fmtMoney(a.amount)} (affecté le {fmtDate(a.allocated_on)}){a.reversed_reason ? ` — ${a.reversed_reason}` : ""}</span>
        {canCorrect && active && !a.reversed_at && <Button size="sm" variant="ghost" onClick={() => { const r = prompt("Motif du retrait de cette affectation (le montant redevient un reliquat du versement) :"); if (r?.trim()) void run(() => st.reverseAlloc(a.id, r), "Affectation retirée"); }}>Retirer</Button>}
      </li>)}{!p.allocations.length && <li className="text-muted-foreground">Aucune.</li>}</ul></section>
    {p.refunds.length > 0 && <section><p className="font-display text-sm font-bold">Remboursements reçus</p><ul className="text-xs">{p.refunds.map((r: any) => <li key={r.id} className={`flex items-center justify-between ${r.voided_at ? "line-through text-muted-foreground" : ""}`}><span>{fmtDate(r.refunded_on)} : {fmtMoney(r.amount)} — {r.reason}</span>{canCorrect && !r.voided_at && <Button size="sm" variant="ghost" onClick={() => { const x = prompt("Motif de l'annulation du remboursement :"); if (x?.trim()) void run(() => st.voidRefund(r.id, x), "Remboursement annulé"); }}>Annuler</Button>}</li>)}</ul></section>}
    <section><p className="font-display text-sm font-bold">Pièces justificatives</p>
      {p.files.length ? <ul className="text-xs">{p.files.map((f: any) => <li key={f.id}><button className="text-primary underline" onClick={() => st.openFile(p.id, f.id).catch((e) => toast({ title: e.message, variant: "destructive" }))}>{f.file_name}</button></li>)}</ul> : <p className="text-xs text-amber-700">Pièce manquante.</p>}
      {canWrite && p.status !== "voided" && <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs"><Paperclip className="h-3 w-3" />Ajouter une pièce<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(() => st.attachFile(companyId, p.id, f), "Pièce jointe"); }} /></label>}
    </section>
    {!mode && <div className="flex flex-wrap gap-2">
      {canWrite && p.status === "draft" && <Button size="sm" onClick={() => run(() => st.validateDraft(p.id, false), "Brouillon validé — règlement déclaré")}>Valider le brouillon</Button>}
      {canWrite && active && p.available > 0 && <Button size="sm" variant="outline" onClick={() => setMode("alloc")}>Affecter le reliquat</Button>}
      {canWrite && active && p.available > 0 && <Button size="sm" variant="outline" onClick={() => { setAmt(String(p.available)); setMode("refund"); }}>Enregistrer un remboursement reçu</Button>}
      {canCorrect && ["validated", "draft"].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => setMode("void")}>Annuler / corriger</Button>}
    </div>}
    {mode === "alloc" && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="text-xs">Aucun second versement n'est créé : le reliquat ({fmtMoney(p.available)}) couvre une autre échéance du même bénéficiaire, avec sa propre date d'affectation.</p>
      <select aria-label="Échéance à couvrir" className={`${sel} w-full`} value={target} onChange={(e) => { setTarget(e.target.value); const o = open.find((x) => x.id === e.target.value); if (o) setAmt(String(Math.min(o.balance, p.available))); }}><option value="">— Choisir une échéance —</option>{open.map((o) => <option key={o.id} value={o.id}>{fmtDate(o.due_date)} · {o.label} · reste {fmtMoney(o.balance)}</option>)}</select>
      <Input type="number" aria-label="Montant à affecter" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" disabled={busy || !target || !(Number(amt) > 0)} onClick={() => run(() => st.allocate(p.id, [{ occurrence_id: target, amount: Number(amt) }], idem, false), "Reliquat affecté")}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
    </div>}
    {mode === "refund" && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="text-xs">Retour d'argent déclaré par le bénéficiaire, lié à ce versement. Le paiement initial reste dans l'historique ; ce n'est pas une note de crédit fiscale.</p>
      <div className="grid grid-cols-2 gap-2"><Input type="number" aria-label="Montant remboursé" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} /><Input type="date" aria-label="Date du remboursement" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <Textarea placeholder="Motif (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" disabled={busy || !reason.trim() || !(Number(amt) > 0)} onClick={() => run(() => st.addRefund(p.id, Number(amt), date, reason, false), "Remboursement enregistré")}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
    </div>}
    {mode === "void" && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <label className="flex gap-2"><input type="radio" checked={kind === "entry_error"} onChange={() => setKind("entry_error")} /><span><strong>Erreur de saisie</strong> — le versement n'a jamais eu lieu tel que saisi. Aucune entrée d'argent n'est créée.</span></label>
      {p.status === "validated" && <label className="flex gap-2"><input type="radio" checked={kind === "returned"} onChange={() => setKind("returned")} /><span><strong>Paiement retourné / refusé</strong> — le versement a échoué (chèque sans provision, virement rejeté…).</span></label>}
      <p className="text-xs text-muted-foreground">L'original est conservé ; les échéances couvertes retrouvent leur solde. Saisissez ensuite le bon règlement si nécessaire.</p>
      <Textarea placeholder="Motif (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={() => run(() => st.voidPayment(p.id, kind, reason), kind === "entry_error" ? "Saisie annulée" : "Paiement marqué retourné")}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
    </div>}
    <section><p className="font-display text-sm font-bold">Historique</p><ul className="space-y-1 text-xs">{p.events.map((h: any, i: number) => <li key={i}>{new Date(h.created_at).toLocaleString("fr-CA", { timeZone: TZ })} — {st.EVENT_LABEL[h.action] ?? h.action}{h.after?.amount != null ? ` (${fmtMoney(Number(h.after.amount))})` : ""}{h.reason ? ` : ${h.reason}` : ""}{h.is_support ? " (assistance Vrac Québec)" : ""}</li>)}</ul></section>
  </DialogContent></Dialog>;
}

/** Onglet Règlements : versements déclarés par date de versement. */
export function PaymentsTab({ companyId, rev, canWrite, canCorrect, onChanged }: { companyId: string; rev: number; canWrite: boolean; canCorrect: boolean; onChanged: () => void }) {
  const today = todayIn(TZ);
  const [from, setFrom] = useState(addDays(today, -90)); const [to, setTo] = useState(today);
  const [f, setF] = useState<Record<string, string | undefined>>({});
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setRows(null); st.listPayments(companyId, from, to, f).then(setRows).catch((e) => toast({ title: "Erreur", description: e.message, variant: "destructive" })); }, [companyId, from, to, JSON.stringify(f), rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = (rows ?? []).filter((r) => r.status === "validated");
  const tot = r2(valid.reduce((s, r) => s + Number(r.amount), 0));
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">Versés du <Input type="date" aria-label="Versés du" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /> au <Input type="date" aria-label="Versés au" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
      <select aria-label="Moyen" className={sel} value={f.method ?? ""} onChange={(e) => setF({ ...f, method: e.target.value || undefined })}><option value="">Tous moyens</option>{Object.entries(st.METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select aria-label="État du règlement" className={sel} value={f.pstatus ?? ""} onChange={(e) => setF({ ...f, pstatus: e.target.value || undefined })}><option value="">Tous états</option>{Object.entries(st.PAY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <Input placeholder="Bénéficiaire" className="w-44" value={f.payee ?? ""} onChange={(e) => setF({ ...f, payee: e.target.value || undefined })} />
      <label className="flex items-center gap-1"><input type="checkbox" checked={f.unallocated === "1"} onChange={(e) => setF({ ...f, unallocated: e.target.checked ? "1" : undefined })} />Reliquats seulement (toutes dates)</label>
    </div>
    <p className="text-xs text-muted-foreground">Versements déclarés (date du versement) : {valid.length} · {fmtMoney(tot)}. Règlements déclarés — non rapprochés avec la banque. Pour enregistrer un règlement, ouvrez une échéance dans le calendrier ou « À payer ».</p>
    {!rows ? <p className="text-sm text-muted-foreground">Chargement…</p> : rows.length === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucun règlement pour ces critères.</p> :
      <div className="space-y-2">{rows.map((r) => <button key={r.id} onClick={() => setOpen(r.id)} className={`flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-left hover:bg-secondary/50 ${["voided", "returned"].includes(r.status) ? "opacity-60" : ""}`}>
        <div className="min-w-0"><p className="truncate font-display text-sm font-semibold">{r.payee_name}</p><p className="truncate text-xs text-muted-foreground">{fmtDate(r.paid_on)} · {st.METHOD_LABEL[r.method]}{r.reference ? ` · ${r.reference}` : ""} · {st.PAY_STATUS[r.status]}{Number(r.files) === 0 ? " · pièce manquante" : ""}</p></div>
        <div className="text-right"><p className="font-display text-sm font-bold">{fmtMoney(Number(r.amount))}</p>{Number(r.available) > 0 && <p className="text-[11px] text-amber-700">Reliquat {fmtMoney(Number(r.available))}</p>}</div>
      </button>)}</div>}
    {open && <PaymentDetail id={open} companyId={companyId} canWrite={canWrite} canCorrect={canCorrect} onClose={() => setOpen(null)} onChanged={onChanged} />}
  </div>;
}
