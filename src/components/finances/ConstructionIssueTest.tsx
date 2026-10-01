// FIN-09C2B1 — Émission TEST avec retenue de construction à taxes différées (chemin PRÉPARATOIRE).
// Réservé aux brouillons marqués TEST : le serveur refuse toute facture réelle. Aperçu serveur sans écriture,
// confirmation liée à l'empreinte, clé stable par contenu, gardes après chaque attente; remonté par clé entreprise + facture.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { useDraft } from "@/lib/drafts/useDraft";
import { useAuthReady } from "@/hooks/useAuthReady";
import { makeGuard, keyFor, isConflict } from "@/lib/finances/recurring";
import * as RT from "@/lib/finances/retention";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const money = (n?: number | string | null) => n == null ? "—" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const msg = (e: unknown) => (e as Error)?.message ?? "Erreur";

export default function ConstructionIssueTest({ invoiceId, companyId, canWrite, beforePreview, onIssued }: { invoiceId: string; companyId: string; canWrite: boolean; beforePreview: () => Promise<boolean>; onIssued: () => void }) {
  const { user } = useAuthReady();
  const [open, setOpen] = useState(false); const [f, setF] = useState<RT.CtaxForm>(RT.EMPTY_CTAX);
  const [pv, setPv] = useState<{ sig: string; data: J } | null>(null); const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const guard = useRef(makeGuard()).current; const cb = useRef(onIssued); cb.current = onIssued;
  useEffect(() => () => guard.bump(), [guard]);
  useEffect(() => { guard.bump(); setBusy(false); }, [canWrite, guard]);
  const store = useDraft({
    id: user && canWrite && open ? { module: "finances", form: "retenue-construction", owner: user.id, company: companyId, recordId: invoiceId } : null,
    data: f, isEmpty: (d) => JSON.stringify(d) === JSON.stringify(RT.EMPTY_CTAX), onRestore: (d) => setF(d), label: () => "Retenue construction (TEST)",
  });
  const built = RT.ctaxPayload(f); const sig = JSON.stringify(built.p);
  const pvOk = !!pv && pv.sig === sig && !(pv.data.errors ?? []).length;
  const edit = (p: Partial<RT.CtaxForm>) => { setF((x) => ({ ...x, ...p })); setErr(null); };
  if (!canWrite) return null;

  const doPreview = async () => {
    if (!built.ok) { setErr(built.errors.join(" ; ")); return; }
    const ok = guard.take(); const sg = sig; setBusy(true); setErr(null);
    try {
      if (!(await beforePreview())) { if (ok()) setErr("Brouillon non enregistré : aperçu impossible"); return; }
      if (!ok()) return;
      const r = await RT.ctaxPreview(invoiceId, built.p); if (!ok()) return;
      setPv({ sig: sg, data: r }); setConfirm(null); if ((r.errors ?? []).length) setErr(r.errors.join(" ; "));
    } catch (e) { if (ok()) setErr(msg(e)); } finally { if (ok()) setBusy(false); }
  };
  const doIssue = async () => {
    if (busy || !pvOk || confirm !== pv!.data.expect_hash) return;
    const key = keyFor(keyRef, { p: built.p, h: pv!.data.expect_hash }); const ok = guard.take(); setBusy(true); setErr(null);
    try {
      await RT.ctaxIssue(invoiceId, key, built.p, pv!.data.expect_hash); if (!ok()) return;
      store.finalize(); keyRef.current = null; setOpen(false); cb.current();
    } catch (e) {
      if (!ok()) return;
      if (isConflict(e)) { setPv(null); setConfirm(null); keyRef.current = null; setErr(`${msg(e)} — saisie conservée : refaites l'aperçu.`); }
      else setErr(msg(e));
    } finally { if (ok()) setBusy(false); }
  };

  const sn = pv?.data.snapshot;
  return <section aria-label="Retenue construction TEST" className="space-y-2 rounded-md border border-dashed border-border p-3">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Mode TEST — retenue de construction à taxes différées</h3>
      {!open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Émettre en mode TEST avec retenue construction…</Button>}</div>
    <p className="text-xs text-muted-foreground">Chemin préparatoire, non certifié : factures TEST seulement, profil inscrit TPS/TVQ, lignes toutes taxables, prix hors taxes. Les taxes de la facture sont figées en entier; seule l'exigibilité de la TPS/TVQ sur la retenue est suivie à part. <a className="underline" href={RT.REVENU_QC} target="_blank" rel="noreferrer">Source : Revenu Québec</a></p>
    {open && <div className="space-y-2">
      <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); setF(RT.EMPTY_CTAX); }} sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />
      <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Mode<select aria-label="Mode de retenue" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.mode} onChange={(e) => edit({ mode: e.target.value as "amount" | "percent" })}><option value="percent">Pourcentage du total HT</option><option value="amount">Montant HT</option></select></label>
        {f.mode === "amount" ? <label className="text-sm">Montant HT retenu<Input aria-label="Montant HT retenu" inputMode="decimal" value={f.amount} onChange={(e) => edit({ amount: e.target.value })} /></label>
          : <label className="text-sm">Pourcentage HT<Input aria-label="Pourcentage HT" inputMode="decimal" value={f.pct} onChange={(e) => edit({ pct: e.target.value })} /></label>}
        <label className="text-sm">Fondement<select aria-label="Fondement" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.basis} onChange={(e) => edit({ basis: e.target.value as RT.CtaxForm["basis"] })}><option value="">— à choisir —</option><option value="law">Prévue par la loi</option><option value="written_agreement">Convention écrite</option></select></label>
        <label className="text-sm">Nature des travaux<select aria-label="Nature des travaux" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.works} onChange={(e) => edit({ works: e.target.value })}><option value="">— à choisir —</option>{Object.entries(RT.WORKS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="text-sm">Référence du contrat<Input aria-label="Référence du contrat" value={f.contract_ref} onChange={(e) => edit({ contract_ref: e.target.value })} /></label>
        <label className="text-sm">Date du contrat<Input aria-label="Date du contrat" type="date" value={f.contract_date} onChange={(e) => edit({ contract_date: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Clause de retenue ou preuve documentaire<Input aria-label="Clause de retenue" value={f.clause_ref} onChange={(e) => edit({ clause_ref: e.target.value })} /></label>
        <label className="text-sm">Condition de libération<Input aria-label="Condition de libération (construction)" value={f.release_condition} onChange={(e) => edit({ release_condition: e.target.value })} /></label>
        <label className="text-sm">Échéance contractuelle de la retenue<Input aria-label="Échéance contractuelle" type="date" value={f.contractual_due} onChange={(e) => edit({ contractual_due: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Motif<Input aria-label="Motif (construction)" value={f.reason} onChange={(e) => edit({ reason: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.test_confirm} onChange={(e) => edit({ test_confirm: e.target.checked })} />Je comprends : mode TEST préparatoire, aucune déclaration, remise ni certification fiscale</label>
        <div className="flex gap-2 sm:col-span-2"><Button size="sm" variant="outline" onClick={doPreview}>Aperçu serveur (aucune écriture)</Button><Button size="sm" variant="ghost" onClick={() => { setOpen(false); setPv(null); setConfirm(null); }}>Fermer</Button></div>
      </fieldset>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {pvOk && sn && <div data-testid="ctax-preview" className="space-y-0.5 rounded bg-secondary p-2 text-sm">
        <p>Facture : total {money(sn.invoice_total)} (HT {money(sn.invoice_pre_tax)}, TPS {money(sn.invoice_gst)}, TVQ {money(sn.invoice_qst)}) — taxes figées.</p>
        <p>Part payable actuelle : <strong>{money(sn.current_part)}</strong> · TPS/TVQ exigibles à l'émission : {money(sn.immediate_gst)} / {money(sn.immediate_qst)}</p>
        <p>Retenue : base HT {money(sn.base)}{sn.mode === "percent" ? ` (${String(sn.pct).replace(".", ",")} % de ${money(sn.invoice_pre_tax)})` : ""} + TPS différée {money(sn.gst)} + TVQ différée {money(sn.qst)} = <strong>{money(sn.ttc)}</strong></p>
        <p>Exigibilité des taxes de la retenue : à la libération/au paiement, ou au plus tard à l'échéance contractuelle du {sn.contractual_due}.</p>
        <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={confirm === pv!.data.expect_hash} onChange={(e) => setConfirm(e.target.checked ? pv!.data.expect_hash : null)} />Je confirme l'émission TEST telle qu'affichée</label>
        <Button size="sm" disabled={busy || confirm !== pv!.data.expect_hash} onClick={doIssue}>Émettre la facture TEST avec retenue construction</Button>
      </div>}
      {pv && !pvOk && !(pv.data.errors ?? []).length && <p className="text-xs text-muted-foreground">Saisie modifiée depuis l'aperçu : refaites l'aperçu.</p>}
    </div>}
  </section>;
}
