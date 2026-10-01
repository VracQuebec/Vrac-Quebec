// FIN-09C2B2A — paiement manuel TEST de la part retenue d'une retenue construction (B1).
// Aperçu serveur (aucune écriture) → confirmation liée à l'empreinte + révision → enregistrement atomique
// (réduction de la retenue + encaissement lié + part fiscale datée si encore différée). Aucun paiement réel.
// Clé mémorisée par contenu (A→B→A réutilise la clé A); conflit = saisie conservée, situation rechargée.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { useDraft } from "@/lib/drafts/useDraft";
import { useAuthReady } from "@/hooks/useAuthReady";
import { makeGuard, isConflict } from "@/lib/finances/recurring";
import * as RT from "@/lib/finances/retention";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const money = (n?: number | string | null) => n == null ? "—" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const msg = (e: unknown) => (e as Error)?.message ?? "Erreur";

export default function ConstructionPayTest({ ret, companyId, canWrite, onDone, onReload }: { ret: J; companyId: string; invoiceId: string; canWrite: boolean; onDone: () => void; onReload: () => Promise<void> | void }) {
  const { user } = useAuthReady();
  const [open, setOpen] = useState(false); const [f, setF] = useState<RT.CpayForm>(RT.EMPTY_CPAY);
  const [pv, setPv] = useState<{ sig: string; rev: number; data: J } | null>(null); const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [conflict, setConflict] = useState(false);
  const keys = useRef(new Map<string, string>()); const guard = useRef(makeGuard()).current;
  const cbs = useRef({ onDone, onReload }); cbs.current = { onDone, onReload };
  useEffect(() => () => guard.bump(), [guard]);
  useEffect(() => { guard.bump(); setBusy(false); }, [canWrite, ret.id, guard]);

  const store = useDraft({
    id: user && canWrite && open ? { module: "finances", form: "paiement-retenue", owner: user.id, company: companyId, recordId: ret.id } : null,
    data: f, isEmpty: (d) => JSON.stringify(d) === JSON.stringify(RT.EMPTY_CPAY), onRestore: (d) => setF(d),
    label: () => "Paiement de retenue (TEST)",
  });
  const built = RT.cpayPayload(f, ret.rest);
  const sig = JSON.stringify(built.p);
  const pvOk = !!pv && pv.sig === sig && pv.rev === ret.rev && !(pv.data.errors ?? []).length;
  // toute modification retire l'aperçu et la confirmation (synchrone)
  const edit = (p: Partial<RT.CpayForm>) => { setF((x) => ({ ...x, ...p })); setPv(null); setConfirm(null); setErr(null); };

  if (!canWrite || ret.status !== "active" || !(Number(ret.rest) > 0)) return null;

  const doPreview = async () => {
    if (!built.ok) { setErr(built.errors.join(" ; ")); return; }
    const ok = guard.take(); const sg = sig; const rv = ret.rev; setBusy(true); setErr(null);
    try { const r = await RT.cpayPreview(ret.id, built.p); if (!ok()) return; setPv({ sig: sg, rev: rv, data: r }); setConfirm(null); setConflict(false); if ((r.errors ?? []).length) setErr(r.errors.join(" ; ")); }
    catch (e) { if (ok()) setErr(msg(e)); } finally { if (ok()) setBusy(false); }
  };
  const doPay = async () => {
    if (busy || !pvOk || confirm !== pv!.data.expect_hash) return;
    const req = { p: built.p, rev: pv!.rev, hash: pv!.data.expect_hash as string };
    const rs = JSON.stringify(req);
    let key = keys.current.get(rs); if (!key) { key = crypto.randomUUID(); keys.current.set(rs, key); }
    const ok = guard.take(); setBusy(true); setErr(null);
    try {
      await RT.cpay(ret.id, key, req.p, req.rev, req.hash); if (!ok()) return;
      store.finalize(); keys.current.clear(); setOpen(false); setF(RT.EMPTY_CPAY); setPv(null); setConfirm(null);
      await cbs.current.onReload(); if (ok()) cbs.current.onDone();
    } catch (e) {
      if (!ok()) return;
      if (isConflict(e)) { setConflict(true); setPv(null); setConfirm(null); setErr(`${msg(e)} — saisie conservée : situation serveur rechargée, refaites l'aperçu puis confirmez.`); await cbs.current.onReload(); }
      else setErr(msg(e));
    } finally { if (ok()) setBusy(false); }
  };

  const t = pv?.data?.tax;
  return <div className="mt-1 rounded border border-dashed border-border p-2 text-xs" data-testid="cpay">
    {!open ? <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>Paiement reçu sur la retenue (TEST)…</Button> : <div className="space-y-2">
      <p className="font-medium">TEST — paiement réellement reçu sur la part retenue (aucun paiement réel, aucune déclaration ni remise)</p>
      <p className="text-muted-foreground">Un paiement n'est pas une simple libération : il réduit la retenue ET crée un encaissement lié. La part courante se saisit par l'encaissement ordinaire. <a className="underline" href={RT.REVENU_QC} target="_blank" rel="noreferrer">Revenu Québec</a> · <a className="underline" href={RT.ARC_RC4052} target="_blank" rel="noreferrer">ARC RC4052</a></p>
      <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); edit(RT.EMPTY_CPAY); }} sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />
      <fieldset disabled={busy} className="grid gap-1 sm:grid-cols-3">
        <label>Montant payé (CAD, max {money(ret.rest)})<Input aria-label="Montant payé" inputMode="decimal" value={f.amount} onChange={(e) => edit({ amount: e.target.value })} /></label>
        <label>Date de réception<Input aria-label="Date de réception" type="date" value={f.paid_on} onChange={(e) => edit({ paid_on: e.target.value })} /></label>
        <label>Mode<select aria-label="Mode de paiement" className="h-10 w-full rounded-md border border-input bg-background px-2" value={f.method} onChange={(e) => edit({ method: e.target.value })}>{Object.entries(RT.PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Référence de preuve<Input aria-label="Référence de preuve" value={f.reference} onChange={(e) => edit({ reference: e.target.value })} /></label>
        <label className="sm:col-span-2">Motif<Input aria-label="Motif du paiement" value={f.reason} onChange={(e) => edit({ reason: e.target.value })} /></label>
        <label className="flex items-center gap-2 sm:col-span-3"><input type="checkbox" checked={f.test_confirm} onChange={(e) => edit({ test_confirm: e.target.checked })} />Mode TEST : aucun paiement réel</label>
        <span className="flex gap-2 sm:col-span-3"><Button size="sm" variant="outline" onClick={doPreview}>Aperçu du paiement (aucune écriture)</Button>
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setPv(null); setConfirm(null); }}>Fermer</Button></span>
      </fieldset>
      {err && <p role="alert" className="text-destructive">{err}</p>}
      {conflict && <p role="status">Version serveur rechargée. Votre saisie est conservée : refaites l'aperçu.</p>}
      {pvOk && <div data-testid="cpay-preview" className="rounded bg-secondary p-2">
        <p>Comptabilisé en TEST : encaissement de <strong>{money(pv!.data.amount)}</strong> le {pv!.data.paid_on}, affecté à la retenue · retenue restante après : {money(pv!.data.after?.retention_rest)} · part courante inchangée : {money(pv!.data.after?.current_due)}</p>
        {t?.already_exigible ? <p>Exigibilité : aucune nouvelle part fiscale (taxes de cette portion déjà exigibles par échéance, revue ou libération antérieure).</p>
          : <p>Exigibilité : base {money(t?.base)} + TPS {money(t?.gst)} + TVQ {money(t?.qst)} = {money(t?.ttc)}, exigible le {t?.exigible_on} ({t?.date_basis === "paiement" ? "date du paiement reçu" : "échéance contractuelle antérieure"}).</p>}
        <p className="text-muted-foreground">Montants figés de la facture inchangés. Annulation de ce paiement : non prise en charge (sous-lot B2).</p>
        <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={confirm === pv!.data.expect_hash} onChange={(e) => setConfirm(e.target.checked ? pv!.data.expect_hash : null)} />Je confirme ce paiement TEST tel qu'affiché</label>
        <Button size="sm" className="mt-1" disabled={busy || confirm !== pv!.data.expect_hash} onClick={doPay}>Enregistrer le paiement TEST</Button>
      </div>}
      {pv && !pvOk && !(pv.data.errors ?? []).length && <p className="text-muted-foreground">Saisie ou retenue modifiée depuis l'aperçu : refaites l'aperçu.</p>}
    </div>}
  </div>;
}
