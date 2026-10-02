// FIN-03 — Enregistrement et consultation des règlements déclarés (aucun argent n'est envoyé).
import { useEffect, useMemo, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDraft } from "@/lib/drafts/useDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
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
  const [idem, setIdem] = useState(() => crypto.randomUUID());
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
  // NAV-01B : préparation d'un règlement = brouillon (compte + entreprise + échéances visées). Le brouillon ne
  // déclenche AUCUN règlement; la clé d'idempotence est conservée : un réessai retrouve le même règlement.
  const { user: me } = useAuthReady();
  const tkey = useMemo(() => targets.map((t) => t.id).sort().join(",").slice(0, 180), [targets]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const store = useDraft({
    id: me ? { module: "finances", form: "reglement", owner: me.id, company: companyId, instance: tkey } : null,
    data: { pick, amount, date, method, more, src, ref, note, idem, fileNames: files.length ? files.map((f) => f.name) : fileNames },
    label: () => `Règlement à ${targets[0]?.payee ?? "bénéficiaire non précisé"} (${targets.length} échéance${targets.length > 1 ? "s" : ""})`,
    route: `/entrepreneur/finances?company=${companyId}&tab=apayer&brouillon=reglement&cibles=${encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(targets)))))}`,
    isEmpty: (d) => !d.fileNames?.length && !d.method && !d.src && !d.ref && !d.note && d.date === todayIn(TZ) && d.amount === String(r2(targets.reduce((s, t) => s + Number(t.balance ?? 0), 0))) && JSON.stringify(d.pick) === JSON.stringify(Object.fromEntries(targets.map((t) => [t.id, String(t.balance ?? "")]))),
    onRestore: (d) => { setPick(d.pick); setAmount(d.amount); setDate(d.date); setMethod(d.method); setMore(d.more); setSrc(d.src); setRef(d.ref); setNote(d.note); if (d.idem) setIdem(d.idem); setFileNames(d.fileNames ?? []); void loadOpen(); },
  });
  const loadOpen = () => st.openForPayee(companyId, payeeKey).then((l) => {
    setOpen(l);
    setPick((p) => Object.fromEntries(Object.entries(p).filter(([id]) => l.some((o) => o.id === id)).map(([id, v]) => [id, String(Math.min(Number(v || 0), l.find((o) => o.id === id)!.balance))])));
  }).catch((e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }));
  useEffect(() => { void loadOpen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const allocs = useMemo(() => Object.entries(pick).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ occurrence_id: id, amount: r2(Number(v)) })), [pick]);
  const [excessOk, setExcessOk] = useState(false);
  const body = { excess_confirm: excessOk && sum && sum.remainder > 0 ? sum.remainder : null, amount: Number(amount), paid_on: date, method, source_label: src || null, reference: ref || null, note: note || null, idem_key: idem, allocations: allocs, draft: future };

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
      store.finalize();
      onDone();
    } catch (e: any) { if (isConflict(e.message)) setConflict(e.message); else toast({ title: "Non enregistré", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden sm:max-w-xl [&>*]:min-w-0">
    <DialogHeader><DialogTitle>Enregistrer un règlement</DialogTitle></DialogHeader>
    <p className="text-sm">Entreprise : <strong>{companyName}</strong> · Bénéficiaire : <strong>{targets[0]?.payee ?? "non précisé"}</strong></p>
    <p className="rounded-md bg-secondary p-2 text-xs">Déclaration d'un versement déjà effectué hors plateforme. Rien n'est envoyé et aucune banque n'est consultée.</p>
    <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={store.discard} sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />
    {conflict && <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm">{conflict}<div className="mt-2"><Button size="sm" variant="outline" onClick={() => { setConflict(null); void loadOpen(); }}>Recharger les soldes actuels</Button></div></div>}
    <fieldset disabled={store.blocked} className="contents">
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
          {o.id in pick && <Input aria-label={`Affecté à ${o.label} du ${fmtDate(o.due_date)}`} className="h-8 w-28" type="number" min="0" step="0.01" value={pick[o.id]} onChange={(e) => setPick({ ...pick, [o.id]: e.target.value })} />}
        </li>)}</ul>}
    </section>
    <button type="button" className="text-left text-sm font-semibold text-primary" onClick={() => setMore(!more)}>{more ? "Masquer" : "Ajouter"} référence, compte source, note</button>
    {more && <div className="grid gap-2 sm:grid-cols-2">
      <Input placeholder="Compte ou carte source (ex. : Visa ••1234)" aria-label="Compte source" value={src} onChange={(e) => setSrc(e.target.value)} />
      <Input placeholder="Référence de transaction ou n° de chèque" aria-label="Référence" value={ref} onChange={(e) => setRef(e.target.value)} />
      <Textarea className="sm:col-span-2" placeholder="Note interne" value={note} onChange={(e) => setNote(e.target.value)} />
    </div>}
    <label className="flex cursor-pointer flex-wrap items-center gap-2 text-sm"><Paperclip className="h-4 w-4" /><span>Pièces justificatives (facultatif)</span><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="min-w-0 max-w-full text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
    </fieldset>
    {!files.length && fileNames.length > 0 && <p className="text-xs text-amber-700" data-testid="pieces-a-rejoindre">Pièces choisies avant l'interruption, à joindre de nouveau (un fichier n'est jamais gardé dans un brouillon) : {fileNames.join(", ")}</p>}
    {!files.length && <p className="text-xs text-muted-foreground">Aucune pièce : le règlement sera marqué « pièce manquante ». Vous pourrez l'ajouter plus tard.</p>}
    {(sum || sumErr) && <section aria-label="Résumé" className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-2 text-sm">
      <p className="font-display font-bold">Résumé avant validation</p>
      {sumErr ? <p className="text-destructive" role="alert">{sumErr}</p> : sum && <>
        <p>Versement de <strong>{fmtMoney(sum.amount ?? Number(amount))}</strong> à {sum.payee}{future ? " — brouillon" : ""}</p>
        <ul className="text-xs">{sum.rows.map((x) => <li key={x.occurrence_id}>{fmtDate(x.due)} · {x.label} : {fmtMoney(x.alloc)} → nouveau solde {fmtMoney(x.balance_after)}{x.quality === "estimated" ? " (basé sur une estimation)" : ""}</li>)}</ul>
        {sum.remainder > 0 && <div className="space-y-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs" data-testid="reliquat"><p>Trop-payé : le versement dépasse le solde de {fmtMoney(sum.remainder)}. Une seule sortie d'argent de {fmtMoney(sum.amount ?? Number(amount))} est enregistrée; l'excédent reste disponible chez ce bénéficiaire, relié à ce versement (aucune note de crédit n'est créée).</p>
          <label className="flex items-start gap-2"><input type="checkbox" aria-label="Confirmer le trop-payé" checked={excessOk} onChange={(e) => setExcessOk(e.target.checked)} /><span>Je confirme le montant excédentaire de <strong>{fmtMoney(sum.remainder)}</strong>.</span></label></div>}
        {sum.duplicates.length > 0 && <p className="text-xs text-amber-700">Doublon probable : un règlement du même montant, à la même date et au même bénéficiaire existe déjà. Deux versements légitimes restent possibles.</p>}
      </>}
    </section>}
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annuler</Button><Button disabled={busy || !sum || (sum.remainder > 0 && !excessOk)} onClick={submit}>{busy ? "Enregistrement…" : future ? "Enregistrer le brouillon" : "Valider le règlement"}</Button></div>
  </DialogContent></Dialog>;
}

/** Fiche d'un règlement : affectations, pièces, reliquat, corrections traçables. */
export function PaymentDetail({ id, companyId, canWrite, canCorrect, onClose, onChanged }: { id: string; companyId: string; canWrite: boolean; canCorrect: boolean; onClose: () => void; onChanged: () => void }) {
  const [p, setP] = useState<any>(null);
  const [mode, setMode] = useState<null | "void" | "refund" | "alloc">(null);
  // NAV-01B : chaque correction (annulation, remboursement, affectation) garde ses propres champs, en brouillon
  // séparé par compte + entreprise + règlement. Rien n'est appliqué sans « Confirmer »; seule l'action réussie est close.
  const EMPTY = { void: { kind: "entry_error" as "entry_error" | "returned", reason: "" }, refund: { amt: "", date: "", reason: "" }, alloc: { target: "", amt: "", idem: "" } };
  const [prep, setPrep] = useState(EMPTY);
  const kind = prep.void.kind; const setKind = (k: "entry_error" | "returned") => setPrep((x) => ({ ...x, void: { ...x.void, kind: k } }));
  const reason = mode === "void" ? prep.void.reason : prep.refund.reason;
  const setReason = (v: string) => setPrep((x) => mode === "void" ? { ...x, void: { ...x.void, reason: v } } : { ...x, refund: { ...x.refund, reason: v } });
  const amt = mode === "alloc" ? prep.alloc.amt : prep.refund.amt;
  const setAmt = (v: string) => setPrep((x) => mode === "alloc" ? { ...x, alloc: { ...x.alloc, amt: v } } : { ...x, refund: { ...x.refund, amt: v } });
  const date = prep.refund.date || todayIn(TZ); const setDate = (v: string) => setPrep((x) => ({ ...x, refund: { ...x.refund, date: v } }));
  const target = prep.alloc.target; const setTarget = (v: string) => setPrep((x) => ({ ...x, alloc: { ...x.alloc, target: v } }));
  const [open, setOpen] = useState<Awaited<ReturnType<typeof st.openForPayee>>>([]);
  // Clé d'idempotence conservée dans le brouillon : un réessai après réponse incertaine retrouve la même affectation.
  const idem = prep.alloc.idem || "";
  const [busy, setBusy] = useState(false);
  const [staleNote, setStaleNote] = useState<string | null>(null);
  const [keptNote, setKeptNote] = useState<string | null>(null);
  const { user: me } = useAuthReady();
  const stamp = (x: any) => (x ? `${x.status}|${x.available}|${x.allocations?.length ?? 0}|${x.refunds?.length ?? 0}` : "");
  const store = useDraft({
    id: me && p && canWrite && companyId ? { module: "finances", form: "reglement-correction", owner: me.id, company: companyId, recordId: id } : null,
    data: { prep, mode, base: stamp(p) },
    label: () => `Correction du règlement — ${p?.payee_name ?? ""} ${p ? fmtMoney(p.amount) : ""}`,
    route: `/entrepreneur/finances?company=${companyId}&tab=reglements&brouillon=reglement-correction&reglement=${id}`,
    isEmpty: (d) => JSON.stringify({ ...d.prep, alloc: { ...d.prep.alloc, idem: "" } }) === JSON.stringify(EMPTY),
    onRestore: (d) => {
      setPrep(d.prep); setMode(d.mode);
      if (d.base !== stamp(p)) setStaleNote("Ce règlement a changé depuis votre préparation (statut, reliquat, affectations ou remboursements). Sa situation actuelle est affichée ; vos saisies sont conservées mais rien n'a été appliqué — vérifiez-les avant de confirmer.");
    },
  });
  const load = () => st.payDetail(id).then(setP).catch((e) => toast({ title: "Accès refusé", description: e.message, variant: "destructive" }));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === "alloc" && p) st.openForPayee(companyId, p.payee_key).then(setOpen); if (mode === "alloc" && !prep.alloc.idem) setPrep((x) => ({ ...x, alloc: { ...x.alloc, idem: crypto.randomUUID() } })); }, [mode, p, companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [inFlight, setInFlight] = useState(false);
  const run = async (fn: () => Promise<unknown>, msg: string, act?: "void" | "refund" | "alloc") => {
    if (inFlight) return; setInFlight(true); setBusy(true);
    try {
      await fn(); toast({ title: msg }); setMode(null);
      if (act) {
        const next = { ...prep, [act]: EMPTY[act] };
        const rest = (["void", "refund", "alloc"] as const).filter((k) => k !== act && JSON.stringify({ ...next[k], idem: "" }) !== JSON.stringify({ ...EMPTY[k], idem: "" }));
        setPrep(next);
        if (rest.length) setKeptNote(`Autres préparations conservées (non appliquées) : ${rest.map((k) => ({ void: "annulation / correction", refund: "remboursement", alloc: "affectation du reliquat" })[k]).join(", ")}. Vérifiez qu'elles s'appliquent encore.`);
        else store.finalize();
      }
      await load(); onChanged();
    }
    catch (e: any) { toast({ title: "Non enregistré", description: `${e.message} — votre préparation est conservée.`, variant: "destructive" }); await load(); } finally { setInFlight(false); setBusy(false); }
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
      {p.files.length ? <ul className="text-xs">{p.files.map((f: any) => <li key={f.id} className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-all">{f.file_name}</span><Button size="sm" variant="outline" onClick={() => st.openFile(p.id, f.id, "view").catch((e) => toast({ title: e.message, variant: "destructive" }))}>Ouvrir (nouvel onglet)</Button><Button size="sm" variant="ghost" onClick={() => st.openFile(p.id, f.id, "download").catch((e) => toast({ title: e.message, variant: "destructive" }))}>Télécharger</Button></li>)}</ul> : <p className="text-xs text-amber-700">Pièce manquante.</p>}
      {canWrite && p.status !== "voided" && <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs"><Paperclip className="h-3 w-3" />Ajouter une pièce<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(() => st.attachFile(companyId, p.id, f), "Pièce jointe"); }} /></label>}
    </section>
    {!canWrite && <p className="text-xs text-muted-foreground">Accès en lecture seule : l'enregistrement, l'affectation, la correction, le remboursement et l'ajout de pièces sont réservés aux rôles Finances habilités (correction : propriétaire, comptabilité ou assistance).</p>}
    {canWrite && <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); setPrep(EMPTY); setMode(null); setStaleNote(null); setKeptNote(null); }} discardLabel="Abandonner les corrections préparées de ce règlement" discardConfirm="Abandonner les corrections préparées de ce règlement (annulation, remboursement, affectation) ? Aucune opération déjà confirmée n'est annulée." sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />}
    {staleNote && <p role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">{staleNote} <Button size="sm" variant="ghost" onClick={() => setStaleNote(null)}>Compris</Button></p>}
    {keptNote && <p role="status" className="rounded-md border border-border bg-secondary p-2 text-xs">{keptNote} <Button size="sm" variant="ghost" onClick={() => setKeptNote(null)}>Compris</Button></p>}
    {!mode && <div className="flex flex-wrap gap-2">
      {canWrite && p.status === "draft" && <Button size="sm" onClick={() => run(() => st.validateDraft(p.id, false), "Brouillon validé — règlement déclaré")}>Valider le brouillon</Button>}
      {canWrite && active && p.available > 0 && <Button size="sm" variant="outline" onClick={() => setMode("alloc")}>Affecter le reliquat</Button>}
      {canWrite && active && p.available > 0 && <Button size="sm" variant="outline" onClick={() => { setMode("refund"); if (!prep.refund.amt) setPrep((x) => ({ ...x, refund: { ...x.refund, amt: String(p.available) } })); }}>Enregistrer un remboursement reçu</Button>}
      {canCorrect && ["validated", "draft"].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => setMode("void")}>Annuler / corriger</Button>}
    </div>}
    {mode === "alloc" && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="text-xs">Aucun second versement n'est créé : le reliquat ({fmtMoney(p.available)}) couvre une autre échéance du même bénéficiaire, avec sa propre date d'affectation.</p>
      <select aria-label="Échéance à couvrir" className={`${sel} w-full`} value={target} onChange={(e) => { const v = e.target.value; const o = open.find((x) => x.id === v); setPrep((x) => ({ ...x, alloc: { ...x.alloc, target: v, amt: o ? String(Math.min(o.balance, p.available)) : x.alloc.amt } })); }}><option value="">— Choisir une échéance —</option>{open.map((o) => <option key={o.id} value={o.id}>{fmtDate(o.due_date)} · {o.label} · reste {fmtMoney(o.balance)}</option>)}</select>
      <Input type="number" aria-label="Montant à affecter" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" disabled={busy || !target || !(Number(amt) > 0)} onClick={() => run(() => st.allocate(p.id, [{ occurrence_id: target, amount: Number(amt) }], idem, false), "Reliquat affecté", "alloc")}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
    </div>}
    {mode === "refund" && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="text-xs">Retour d'argent déclaré par le bénéficiaire, lié à ce versement. Le paiement initial reste dans l'historique ; ce n'est pas une note de crédit fiscale.</p>
      <div className="grid grid-cols-2 gap-2"><Input type="number" aria-label="Montant remboursé" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} /><Input type="date" aria-label="Date du remboursement" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <Textarea placeholder="Motif (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" disabled={busy || !reason.trim() || !(Number(amt) > 0)} onClick={() => run(() => st.addRefund(p.id, Number(amt), date, reason, false), "Remboursement enregistré", "refund")}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
    </div>}
    {mode === "void" && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <label className="flex gap-2"><input type="radio" checked={kind === "entry_error"} onChange={() => setKind("entry_error")} /><span><strong>Erreur de saisie</strong> — le versement n'a jamais eu lieu tel que saisi. Aucune entrée d'argent n'est créée.</span></label>
      {p.status === "validated" && <label className="flex gap-2"><input type="radio" checked={kind === "returned"} onChange={() => setKind("returned")} /><span><strong>Paiement retourné / refusé</strong> — le versement a échoué (chèque sans provision, virement rejeté…).</span></label>}
      <p className="text-xs text-muted-foreground">L'original est conservé ; les échéances couvertes retrouvent leur solde. Saisissez ensuite le bon règlement si nécessaire.</p>
      <Textarea placeholder="Motif (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={() => run(() => st.voidPayment(p.id, kind, reason), kind === "entry_error" ? "Saisie annulée" : "Paiement marqué retourné", "void")}>Confirmer</Button><Button size="sm" variant="outline" onClick={() => setMode(null)}>Retour</Button></div>
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
