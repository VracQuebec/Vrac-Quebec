// FIN-09C2B2B1 — annulation d'une ERREUR DE SAISIE d'un paiement de retenue TEST (cas sans effet fiscal).
// Aperçu serveur (aucune écriture) → confirmation liée empreinte + révision → annulation atomique (encaissement + paiement).
// Réponse perdue : demande exacte figée (pendingSubmit), rejeu exact seulement; stockage indisponible = refus avant envoi.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { useDraft } from "@/lib/drafts/useDraft";
import { useAuthReady } from "@/hooks/useAuthReady";
import { makeGuard, isConflict } from "@/lib/finances/recurring";
import * as RT from "@/lib/finances/retention";
import { readPending, savePending, clearPending, isDeterministic, type Pending } from "@/lib/finances/pendingSubmit";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const money = (n?: number | string | null) => n == null ? "—" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const msg = (e: unknown) => (e as Error)?.message ?? "Erreur";
const OP = "ctax_pay_void";

export default function ConstructionPayVoidTest({ rel, rev, companyId, canWrite, onDone, onReload }: { rel: J; rev: number; companyId: string; canWrite: boolean; onDone: () => void; onReload: () => Promise<void> | void }) {
  const { user } = useAuthReady(); const uid = user?.id ?? null;
  const [open, setOpen] = useState(false); const [f, setF] = useState<RT.PvoidForm>(RT.EMPTY_PVOID);
  const [pv, setPv] = useState<{ sig: string; rev: number; data: J } | null>(null); const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const guard = useRef(makeGuard()).current;
  const cbs = useRef({ onDone, onReload }); cbs.current = { onDone, onReload };
  const ctx = `${uid}|${companyId}|${rel.id}|${canWrite}`; const ctxRef = useRef(ctx);
  if (ctxRef.current !== ctx) { ctxRef.current = ctx; guard.bump(); }
  useEffect(() => () => guard.bump(), [guard]);
  useEffect(() => { setBusy(false); setErr(null); setPv(null); setConfirm(null); setPending(uid && canWrite ? readPending(OP, uid, companyId, rel.id) : null); }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = pending && uid && canWrite && pending.user === uid && pending.company === companyId && pending.record === rel.id ? pending : null;

  const store = useDraft({
    id: user && canWrite && open ? { module: "finances", form: "annulation-paiement-retenue", owner: user.id, company: companyId, recordId: rel.id } : null,
    data: f, isEmpty: (d) => JSON.stringify(d) === JSON.stringify(RT.EMPTY_PVOID), onRestore: (d) => setF(d), label: () => "Annulation d'erreur de paiement (TEST)",
  });
  const built = RT.pvoidPayload(f); const sig = JSON.stringify(built.p);
  const pvOk = !!pv && pv.sig === sig && pv.rev === rev && !(pv.data.errors ?? []).length;
  const edit = (p: Partial<RT.PvoidForm>) => { setF((x) => ({ ...x, ...p })); setPv(null); setConfirm(null); setErr(null); };

  if (!canWrite) return null;
  if (!cur && (rel.voided_at || rel.source !== "paiement")) return null;

  const doPreview = async () => {
    if (!built.ok) { setErr(built.errors.join(" ; ")); return; }
    const ok = guard.take(); const sg = sig; const rv = rev; setBusy(true); setErr(null);
    try { const r = await RT.pvoidPreview(rel.id, built.p); if (!ok()) return; setPv({ sig: sg, rev: rv, data: r }); setConfirm(null); if ((r.errors ?? []).length) setErr(r.errors.join(" ; ")); }
    catch (e) { if (ok()) setErr(msg(e)); } finally { if (ok()) setBusy(false); }
  };
  const send = async (q: Pending, fresh: boolean) => {
    const ok = guard.take(); setBusy(true); setErr(null);
    try {
      const a = q.args; await RT.pvoid(rel.id, q.key, a.p, a.rev, a.hash); if (!ok()) return;
      clearPending(OP, q.user, q.company, q.record); setPending(null);
      store.finalize(); setOpen(false); setF(RT.EMPTY_PVOID); setPv(null); setConfirm(null);
      await cbs.current.onReload(); if (ok()) cbs.current.onDone();
    } catch (e) {
      if (!ok()) return;
      if (!isDeterministic(e)) { setErr(`${msg(e)} — résultat inconnu : la demande exacte est conservée, récupérez-la avant toute autre saisie.`); return; }
      clearPending(OP, q.user, q.company, q.record); setPending(null);
      setPv(null); setConfirm(null);
      if (isConflict(e)) { setErr(`${msg(e)} — saisie conservée : situation rechargée, refaites l'aperçu.`); await cbs.current.onReload(); }
      else setErr(`${msg(e)}${fresh ? "" : " — demande précédente refusée : corrigez puis refaites l'aperçu."}`);
    } finally { if (ok()) setBusy(false); }
  };
  const doVoid = async () => {
    if (busy || cur || !uid || !pvOk || confirm !== pv!.data.expect_hash) return;
    let q: Pending;
    try { q = savePending({ op: OP, user: uid, company: companyId, record: rel.id, key: crypto.randomUUID(), args: { p: built.p, rev: pv!.rev, hash: pv!.data.expect_hash as string } }); }
    catch (e) { setErr(msg(e)); setPending(readPending(OP, uid, companyId, rel.id)); return; }
    setPending(q); await send(q, true);
  };
  const recover = async () => {
    if (busy || !uid || !canWrite) return;
    const q = readPending(OP, uid, companyId, rel.id); if (!q) { setPending(null); return; }
    await send(q, false);
  };

  if (cur) return <div className="mt-1 rounded border border-dashed border-border p-2" data-testid="pvoid-pending">
    <p className="font-medium">Annulation TEST envoyée — résultat inconnu (réponse perdue)</p>
    <p>Demande figée : motif « {cur.args?.p?.reason} » (révision {cur.args?.rev}). La récupération rejoue exactement cette demande et ne peut pas annuler deux fois.</p>
    {err && <p role="alert" className="text-destructive">{err}</p>}
    <Button size="sm" disabled={busy} onClick={recover}>Récupérer le résultat (rejeu exact)</Button>
  </div>;

  return <div className="mt-1" data-testid="pvoid">
    {!open ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(true)}>Annuler une erreur de saisie (TEST)…</Button> : <div className="space-y-1 rounded border border-dashed border-border p-2">
      <p className="font-medium">TEST — annuler une ERREUR DE SAISIE de ce paiement (pas un remboursement, pas un retour bancaire, aucune correction de déclaration)</p>
      <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); edit(RT.EMPTY_PVOID); }} sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />
      <fieldset disabled={busy} className="space-y-1">
        <label className="block">Motif<Input aria-label="Motif de l'annulation" value={f.reason} onChange={(e) => edit({ reason: e.target.value })} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.error_confirm} onChange={(e) => edit({ error_confirm: e.target.checked })} />Il s'agit d'une erreur de saisie</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.test_confirm} onChange={(e) => edit({ test_confirm: e.target.checked })} />Mode TEST</label>
        <span className="flex gap-2"><Button size="sm" variant="outline" onClick={doPreview}>Aperçu de l'annulation (aucune écriture)</Button>
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setPv(null); setConfirm(null); }}>Fermer</Button></span>
      </fieldset>
      {err && <p role="alert" className="text-destructive">{err}</p>}
      {pvOk && <div data-testid="pvoid-preview" className="rounded bg-secondary p-2">
        <p>Après confirmation en TEST (prévision, aucune écriture pour l'instant) : paiement de {money(pv!.data.amount)} du {pv!.data.paid_on} (réf. {pv!.data.reference}) et son encaissement marqués annulés, contenu conservé · retenue restante : {money(pv!.data.after?.retention_rest)} · part courante inchangée : {money(pv!.data.after?.current_due)}</p>
        <p>Taxes : aucune modification (déjà entièrement exigibles par la revue d'échéance, journal fiscal inchangé).</p>
        <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={confirm === pv!.data.expect_hash} onChange={(e) => setConfirm(e.target.checked ? pv!.data.expect_hash : null)} />Je confirme l'annulation de cette erreur de saisie TEST</label>
        <Button size="sm" className="mt-1" disabled={busy || confirm !== pv!.data.expect_hash} onClick={doVoid}>Annuler l'erreur de saisie (TEST)</Button>
      </div>}
      {pv && !pvOk && !(pv.data.errors ?? []).length && <p className="text-muted-foreground">Motif ou retenue modifiés depuis l'aperçu : refaites l'aperçu.</p>}
    </div>}
  </div>;
}
