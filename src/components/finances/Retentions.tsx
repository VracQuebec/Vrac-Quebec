// FIN-09C2 — Retenues contractuelles d'une facture émise (taxes déjà figées/exigibles).
// Retenue ≠ avoir ≠ paiement : la facture, ses taxes et son PDF ne changent jamais; seule la part exigible courante change.
// Aperçu serveur puis confirmation liée à l'empreinte; clé d'idempotence stable par contenu; gardes après chaque attente.
// Le composant est remonté par clé entreprise + facture (aucun état ni rappel d'un ancien contexte).
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { useDraft } from "@/lib/drafts/useDraft";
import { useAuthReady } from "@/hooks/useAuthReady";
import { makeGuard, keyFor, isConflict, decFr } from "@/lib/finances/recurring";
import * as RT from "@/lib/finances/retention";
import { todayIn } from "@/lib/finances/period";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const money = (n?: number | string | null) => n == null ? "—" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const stamp = (d?: string | null) => d ? new Date(d).toLocaleString("fr-CA", { timeZone: "America/Toronto" }) : "—";
const msg = (e: unknown) => (e as Error)?.message ?? "Erreur";
const ACTION: Record<string, string> = { create: "Retenue créée", release: "Libération", void: "Retenue annulée", release_void: "Libération annulée" };

export default function Retentions({ invoiceId, companyId, canWrite, refreshKey = 0, onChanged }: { invoiceId: string; companyId: string; canWrite: boolean; refreshKey?: number; onChanged: () => void }) {
  const { user } = useAuthReady();
  const [s, setS] = useState<J | null>(null); const [loadErr, setLoadErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false); const [f, setF] = useState<RT.RetForm>(RT.EMPTY_RET);
  const [pv, setPv] = useState<{ sig: string; data: J } | null>(null); const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [conflict, setConflict] = useState(false);
  const [rel, setRel] = useState<{ id: string; amount: string; date: string; reason: string } | null>(null);
  const createKey = useRef<{ sig: string; key: string } | null>(null); const actKey = useRef<{ sig: string; key: string } | null>(null);
  const guard = useRef(makeGuard()).current;
  const cb = useRef(onChanged); cb.current = onChanged;
  useEffect(() => () => guard.bump(), [guard]);
  useEffect(() => { guard.bump(); setBusy(false); }, [canWrite, guard]);

  const load = useCallback(async () => {
    const ok = guard.take();
    try { const r = await RT.summary(invoiceId); if (ok()) { setS(r); setLoadErr(null); } } catch (e) { if (ok()) setLoadErr(msg(e)); }
  }, [invoiceId, guard]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const store = useDraft({
    id: user && canWrite && open ? { module: "finances", form: "retenue", owner: user.id, company: companyId, recordId: invoiceId } : null,
    data: f, isEmpty: (d) => JSON.stringify(d) === JSON.stringify(RT.EMPTY_RET), onRestore: (d) => setF(d),
    label: () => "Retenue sur facture",
  });
  const built = RT.retPayload(f);
  const sig = JSON.stringify(built.p);
  const pvOk = !!pv && pv.sig === sig && !(pv.data.errors ?? []).length;
  const edit = (p: Partial<RT.RetForm>) => { setF((x) => ({ ...x, ...p })); setErr(null); };

  const doPreview = async () => {
    if (!built.ok) { setErr(built.errors.join(" ; ")); return; }
    const ok = guard.take(); const sg = sig; setBusy(true); setErr(null);
    try { const r = await RT.preview(invoiceId, built.p); if (!ok()) return; setPv({ sig: sg, data: r }); setConfirm(null); setConflict(false); if ((r.errors ?? []).length) setErr(r.errors.join(" ; ")); }
    catch (e) { if (ok()) setErr(msg(e)); } finally { if (ok()) setBusy(false); }
  };
  const doCreate = async () => {
    if (!canWrite || busy || !pvOk || confirm !== pv!.data.expect_hash) return;
    const key = keyFor(createKey, built.p); const ok = guard.take(); setBusy(true); setErr(null);
    try {
      await RT.create(invoiceId, key, built.p, pv!.data.expect_hash); if (!ok()) return;
      store.finalize(); createKey.current = null; setOpen(false); setF(RT.EMPTY_RET); setPv(null); setConfirm(null);
      await load(); if (ok()) cb.current();
    } catch (e) {
      if (!ok()) return;
      if (isConflict(e)) { setConflict(true); setPv(null); setConfirm(null); setErr(`${msg(e)} — saisie conservée : situation serveur rechargée, refaites l'aperçu puis confirmez.`); await load(); }
      else setErr(msg(e));
    } finally { if (ok()) setBusy(false); }
  };
  const act = async (payload: J, fn: (key: string) => Promise<J>) => {
    if (!canWrite || busy) return;
    const key = keyFor(actKey, payload); const ok = guard.take(); setBusy(true); setErr(null);
    try { await fn(key); if (!ok()) return; actKey.current = null; setRel(null); await load(); if (ok()) cb.current(); }
    catch (e) { if (!ok()) return; setErr(msg(e) + (isConflict(e) ? " — rechargé; vérifiez puis recommencez." : "")); if (isConflict(e)) { actKey.current = null; await load(); } }
    finally { if (ok()) setBusy(false); }
  };
  const doRelease = (r: J) => {
    if (!rel) return;
    const a = decFr(rel.amount, 2);
    if (a == null || Number(a) <= 0) { setErr("Montant de libération positif requis"); return; }
    if (Number(a) > Number(r.rest)) { setErr(`Libération supérieure à la retenue restante (${money(r.rest)})`); return; }
    if (!rel.reason.trim() || !rel.date) { setErr("Date et motif de libération requis"); return; }
    void act({ t: "rel", id: r.id, a, d: rel.date, m: rel.reason.trim(), rev: r.rev }, (key) => RT.release(r.id, key, a, rel.date, rel.reason.trim(), r.rev));
  };
  const askVoid = (kind: "ret" | "rel", id: string, rev: number) => {
    const reason = (window.prompt(kind === "ret" ? "Motif d'annulation de la retenue (la part restante redevient exigible) :" : "Motif d'annulation de la libération (le montant redevient retenu) :") ?? "").trim();
    if (!reason) return;
    void act({ t: kind, id, reason, rev }, (key) => kind === "ret" ? RT.voidRetention(id, key, reason, rev) : RT.voidRelease(id, key, reason, rev));
  };

  const p = s?.position;
  return <section className="space-y-2 rounded-md border border-border p-3" aria-label="Retenues">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Retenues contractuelles</h3>
      {canWrite && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Nouvelle retenue</Button>}</div>
    {loadErr && <p role="alert" className="text-sm text-destructive">Retenues illisibles : {loadErr}</p>}
    {!s && !loadErr && <p className="text-sm text-muted-foreground">Chargement…</p>}
    {p && <dl data-testid="ret-position" className="grid grid-cols-2 gap-x-4 text-sm sm:grid-cols-4">
      <dt>Facture (brut)</dt><dd>{money(p.total)}</dd><dt>Avoirs émis</dt><dd>{money(p.credits)}</dd>
      <dt>Encaissements</dt><dd>{money(p.collected)}</dd><dt>Solde</dt><dd>{money(p.rest)}</dd>
      <dt>Part exigible courante</dt><dd className="font-semibold">{money(p.current_due)}</dd><dt>Part retenue</dt><dd>{money(p.held)}</dd>
      <dt>Libérées</dt><dd>{money(p.released)}</dd>
    </dl>}
    <p className="text-xs text-muted-foreground">Une retenue n'est ni un avoir ni un paiement ni une réduction du prix : la facture, ses taxes et son PDF restent inchangés.</p>
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    {conflict && <p role="status" className="text-xs">Version serveur rechargée. Votre saisie est conservée : refaites l'aperçu pour la réappliquer.</p>}

    {open && canWrite && <div className="space-y-2 rounded border border-border p-2">
      <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); setF(RT.EMPTY_RET); }} sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />
      <fieldset disabled={busy} className="space-y-2">
        <legend className="text-sm font-medium">Traitement fiscal de la retenue</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="ret-kind" checked={f.kind === "taxes_exigibles"} onChange={() => edit({ kind: "taxes_exigibles" })} />Taxes déjà exigibles (taxes figées sur la facture)</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="ret-kind" checked={f.kind === "construction_differee"} onChange={() => edit({ kind: "construction_differee" })} />Retenue de construction avec taxes différées / à valider</label>
        {f.kind === "construction_differee" && <p role="alert" className="text-xs text-destructive">{RT.CONSTRUCTION_BLOCK} <a className="underline" href={RT.REVENU_QC} target="_blank" rel="noreferrer">Source : Revenu Québec</a></p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Mode<select aria-label="Mode" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.mode} onChange={(e) => edit({ mode: e.target.value as "amount" | "percent" })}><option value="amount">Montant CAD</option><option value="percent">Pourcentage du solde après avoirs</option></select></label>
          {f.mode === "amount" ? <label className="text-sm">Montant retenu (CAD)<Input aria-label="Montant retenu" inputMode="decimal" value={f.amount} onChange={(e) => edit({ amount: e.target.value })} /></label>
            : <label className="text-sm">Pourcentage (base : {money(p?.net)} après avoirs)<Input aria-label="Pourcentage" inputMode="decimal" value={f.pct} onChange={(e) => edit({ pct: e.target.value })} /></label>}
          <label className="text-sm sm:col-span-2">Motif<Input aria-label="Motif" value={f.reason} onChange={(e) => edit({ reason: e.target.value })} /></label>
          <label className="text-sm">Référence contractuelle (facultatif)<Input aria-label="Référence contractuelle" value={f.contract_ref} onChange={(e) => edit({ contract_ref: e.target.value })} /></label>
          <label className="text-sm">Date de libération prévue (facultatif)<Input aria-label="Date de libération prévue" type="date" value={f.planned_release} onChange={(e) => edit({ planned_release: e.target.value })} /></label>
          <label className="text-sm sm:col-span-2">Condition de libération<Input aria-label="Condition de libération" value={f.release_condition} onChange={(e) => edit({ release_condition: e.target.value })} /></label>
        </div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={doPreview} disabled={f.kind !== "taxes_exigibles"}>Aperçu (aucune écriture)</Button>
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setPv(null); setConfirm(null); }}>Fermer</Button></div>
      </fieldset>
      {pvOk && <div data-testid="ret-preview" className="rounded bg-secondary p-2 text-sm">
        {pv!.data.mode === "percent" && <p>Base affichée : {money(pv!.data.base)} × {String(pv!.data.pct).replace(".", ",")} %</p>}
        <p>Montant retenu : <strong>{money(pv!.data.amount)}</strong> · part exigible après : {money(pv!.data.after?.current_due)} · retenue totale après : {money(pv!.data.after?.held)}</p>
        <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={confirm === pv!.data.expect_hash} onChange={(e) => setConfirm(e.target.checked ? pv!.data.expect_hash : null)} />Je confirme cette retenue telle qu'affichée</label>
        <Button size="sm" className="mt-1" disabled={busy || confirm !== pv!.data.expect_hash} onClick={doCreate}>Créer la retenue</Button>
      </div>}
      {pv && !pvOk && !(pv.data.errors ?? []).length && <p className="text-xs text-muted-foreground">Saisie modifiée depuis l'aperçu : refaites l'aperçu.</p>}
    </div>}

    {(s?.retentions ?? []).map((r: J) => <div key={r.id} className="rounded border border-border p-2 text-sm">
      <p><strong>{money(r.amount)}</strong>{r.mode === "percent" ? ` (${String(r.pct).replace(".", ",")} % de ${money(r.base_amount)})` : ""} · {r.status === "annulee" ? `annulée le ${stamp(r.voided_at)} — ${r.void_reason}` : `reste retenu ${money(r.rest)}`}</p>
      <p className="text-xs text-muted-foreground">Motif : {r.reason}{r.contract_ref ? ` · contrat ${r.contract_ref}` : ""} · condition : {r.release_condition} · {r.planned_release ? `libération prévue ${r.planned_release}` : "date de libération à compléter"} · créée {stamp(r.created_at)}</p>
      <ul className="text-xs">{(r.releases ?? []).map((l: J) => <li key={l.id}>Libération {money(l.amount)} le {l.released_on} — {l.reason}{l.voided_at ? ` (annulée : ${l.void_reason})` : ""}
        {canWrite && r.status === "active" && !l.voided_at && <Button size="sm" variant="ghost" disabled={busy} onClick={() => askVoid("rel", l.id, r.rev)}>Annuler</Button>}</li>)}</ul>
      {canWrite && r.status === "active" && Number(r.rest) > 0 && (rel?.id === r.id
        ? <div className="mt-1 grid gap-1 sm:grid-cols-4">
            <Input aria-label="Montant à libérer" inputMode="decimal" value={rel.amount} onChange={(e) => setRel({ ...rel, amount: e.target.value })} />
            <Input aria-label="Date de libération" type="date" value={rel.date} onChange={(e) => setRel({ ...rel, date: e.target.value })} />
            <Input aria-label="Motif de libération" value={rel.reason} onChange={(e) => setRel({ ...rel, reason: e.target.value })} />
            <Button size="sm" disabled={busy} onClick={() => doRelease(r)}>Libérer</Button></div>
        : <span className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { setRel({ id: r.id, amount: String(r.rest).replace(".", ","), date: todayIn(), reason: "" }); actKey.current = null; }}>Libérer…</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => askVoid("ret", r.id, r.rev)}>Annuler la retenue</Button></span>)}
    </div>)}
    {(s?.events ?? []).length > 0 && <details className="text-xs"><summary>Journal</summary><ul>{s.events.map((e: J) => <li key={e.id}>{stamp(e.at)} — {ACTION[e.action] ?? e.action}{e.detail?.amount != null ? ` ${money(e.detail.amount)}` : ""}{e.detail?.reason ? ` : ${e.detail.reason}` : ""}</li>)}</ul></details>}
  </section>;
}
