// FIN-14 — Grand livre comptable : journal (brouillon → validée, contrepassation liée), pièces à comptabiliser,
// grand livre par compte et période, balance de vérification, plan de comptes et associations.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import * as G from "@/lib/finances/ledger";
import { accounts as loadFinAccounts } from "@/lib/finances/treasuryApi";
import { fmtDate, fmtMoney, todayIn } from "@/lib/finances/period";

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
type Sub = "journal" | "livre" | "balance" | "plan";
const err = (e: any) => toast({ title: "Action refusée", description: e?.message ?? String(e), variant: "destructive" });
const newKey = () => crypto.randomUUID();
const ym = () => todayIn().slice(0, 8) + "01";
const acctLabel = (m: Map<string, G.GlAccount>, id: string | null) => { const a = id ? m.get(id) : null; return a ? `${a.number} · ${a.name}` : "À compléter"; };
const sideAmt = (n: number) => `${fmtMoney(Math.abs(n))} ${n > 0 ? "D" : n < 0 ? "C" : ""}`.trim();

export default function GeneralLedger({ companyId, canWrite, canCorrect }: { companyId: string; canWrite: boolean; canCorrect: boolean }) {
  const [sub, setSub] = useState<Sub>(() => (new URLSearchParams(window.location.search).get("sous") as Sub) || "journal");
  const [accs, setAccs] = useState<G.GlAccount[]>([]);
  const [rev, setRev] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const reload = useCallback(() => setRev((r) => r + 1), []);
  useEffect(() => { G.accounts(companyId).then(setAccs).catch(err); }, [companyId, rev]);
  const byId = useMemo(() => new Map(accs.map((a) => [a.id, a])), [accs]);
  const go = (s: Sub) => { setSub(s); const q = new URLSearchParams(window.location.search); q.set("sous", s); window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q}`); };
  return <div className="space-y-4">
    <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">Les <strong>comptes comptables</strong> (plan de comptes) sont distincts des <strong>comptes financiers</strong> banque/caisse. Chaque opération est comptabilisée une seule fois; un relevé bancaire ou un rapprochement ne crée jamais d'écriture. Une écriture validée ne se modifie pas : on la contrepasse avec un motif.</div>
    <div role="tablist" className="flex flex-wrap gap-2">{([["journal", "Journal"], ["livre", "Grand livre"], ["balance", "Balance de vérification"], ["plan", "Plan de comptes et associations"]] as const).map(([v, l]) =>
      <Button key={v} role="tab" aria-selected={sub === v} size="sm" variant={sub === v ? "default" : "outline"} onClick={() => go(v)}>{l}</Button>)}</div>
    {sub === "journal" && <Journal companyId={companyId} accs={accs} byId={byId} canWrite={canWrite} rev={rev} reload={reload} onOpen={setOpen} />}
    {sub === "livre" && <Ledger companyId={companyId} accs={accs} onOpen={setOpen} />}
    {sub === "balance" && <Trial companyId={companyId} />}
    {sub === "plan" && <Plan companyId={companyId} accs={accs} canWrite={canWrite} reload={reload} />}
    {open && <EntryDialog id={open} companyId={companyId} byId={byId} canCorrect={canCorrect} onClose={() => setOpen(null)} onOpen={setOpen} onChange={reload} />}
  </div>;
}

/* ---------------- Journal ---------------- */
function Journal({ companyId, accs, byId, canWrite, rev, reload, onOpen }: { companyId: string; accs: G.GlAccount[]; byId: Map<string, G.GlAccount>; canWrite: boolean; rev: number; reload: () => void; onOpen: (id: string) => void }) {
  const [f, setF] = useState({ from: "", to: "", status: "", q: "" });
  const [list, setList] = useState<G.Entry[] | null>(null);
  const [pend, setPend] = useState<G.Pending[] | null>(null);
  const [edit, setEdit] = useState<G.Entry | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setList(null); G.entries(companyId, f).then(setList).catch(err); }, [companyId, f, rev]);
  useEffect(() => { G.pending(companyId).then(setPend).catch(err); }, [companyId, rev]);
  const ready = pend?.filter((p) => !p.missing.length).length ?? 0;
  const todo = pend?.filter((p) => p.missing.length) ?? [];
  const doSync = async () => { setBusy(true); try { const r = await G.sync(companyId); toast({ title: "Comptabilisation terminée", description: `${r.posted} écriture(s) créée(s), ${r.reversed} contrepassation(s), ${r.a_completer} pièce(s) à compléter.` }); reload(); } catch (e) { err(e); } finally { setBusy(false); } };
  return <div className="space-y-4">
    <section className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">Opérations à comptabiliser</h3>
        {canWrite && <Button size="sm" disabled={busy || !ready} onClick={doSync}>{busy ? "Comptabilisation…" : `Comptabiliser ${ready} pièce(s) prête(s)`}</Button>}</div>
      {!pend ? <p className="text-sm text-muted-foreground">Chargement…</p> : !pend.length ? <p className="text-sm text-muted-foreground">Toutes les opérations existantes sont comptabilisées.</p> : <>
        <p className="mt-1 text-xs text-muted-foreground">{ready} prête(s) · {todo.length} « À compléter ». Les pièces à compléter ne sont pas comptabilisées tant que l'association manquante n'est pas faite (onglet Plan de comptes et associations).</p>
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">{pend.map((p) => <li key={p.kind + p.src + p.purpose} className="rounded border border-border p-2">
          <div className="flex flex-wrap justify-between gap-2"><span>{p.on_date ? fmtDate(p.on_date) : "—"} · {p.label}</span>
            <span className={p.missing.length ? "font-semibold text-destructive" : "text-muted-foreground"}>{p.missing.length ? "À compléter" : p.purpose === "void" ? "Contrepassation prête" : "Prête"}</span></div>
          {p.missing.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-destructive">{[...new Set(p.missing)].map((m) => <li key={m}>{G.missingLabel(m)}</li>)}</ul>}
        </li>)}</ul></>}
    </section>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <label className="text-xs">Du<Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      <label className="text-xs">Au<Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      <label className="text-xs">État<select className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Tous</option><option value="draft">Brouillons</option><option value="validated">Validées</option></select></label>
      <label className="col-span-2 text-xs">Recherche<Input value={f.q} placeholder="Description ou référence" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
    </div>
    {canWrite && <Button onClick={() => setEdit("new")} disabled={!accs.some((a) => a.active)}>Nouvelle écriture manuelle</Button>}
    {!accs.length && <p className="text-sm text-muted-foreground">Créez d'abord votre plan de comptes.</p>}
    {!list ? <p className="text-sm text-muted-foreground">Chargement…</p> : !list.length ? <p className="text-sm text-muted-foreground">Aucune écriture.</p> :
      <ul className="space-y-2">{list.map((e) => { const b = G.balance(e.lines); return <li key={e.id} className="rounded-md border border-border p-3 text-sm">
        <button className="w-full text-left" onClick={() => e.status === "draft" && canWrite ? setEdit(e) : onOpen(e.id)}>
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{e.status === "draft" ? "Brouillon" : `N° ${e.entry_no}`} · {fmtDate(e.entry_date)}</strong>
            <span className="text-xs">{e.origin === "auto" ? (G.SOURCE[e.source_kind ?? ""]?.l ?? "Automatique") : e.origin === "reversal" ? "Contrepassation" : "Manuelle"}{e.reversed_by_id ? " · contrepassée" : ""}</span></div>
          <div className="break-words">{e.reference ? `${e.reference} — ` : ""}{e.description}</div>
          <div className="text-xs text-muted-foreground">Débits {fmtMoney(b.debit)} · Crédits {fmtMoney(b.credit)}{!b.ok && <span className="text-destructive"> · déséquilibrée ({fmtMoney(b.gap)})</span>}</div>
        </button></li>; })}</ul>}
    {edit && <Draft companyId={companyId} accs={accs.filter((a) => a.active)} byId={byId} init={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={reload} />}
  </div>;
}

type DLine = { gl: string; debit: string; credit: string; memo: string };
function Draft({ companyId, accs, byId, init, onClose, onDone }: { companyId: string; accs: G.GlAccount[]; byId: Map<string, G.GlAccount>; init: G.Entry | null; onClose: () => void; onDone: () => void }) {
  const store = `fin14.draft.${companyId}.${init?.id ?? "new"}`;
  const start = () => { const s = sessionStorage.getItem(store); if (s) try { return JSON.parse(s); } catch { /* ignore */ }
    return init ? { date: init.entry_date, ref: init.reference ?? "", desc: init.description, lines: init.lines.map((l) => ({ gl: l.gl_account_id, debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", memo: l.memo ?? "" })), key: newKey() }
      : { date: todayIn(), ref: "", desc: "", lines: [{ gl: "", debit: "", credit: "", memo: "" }, { gl: "", debit: "", credit: "", memo: "" }], key: newKey() }; };
  const [s, setS] = useState<{ date: string; ref: string; desc: string; lines: DLine[]; key: string }>(start);
  const [cur, setCur] = useState<{ id: string | null; rev: number | null }>({ id: init?.id ?? null, rev: init?.rev ?? null });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { sessionStorage.setItem(store, JSON.stringify(s)); }, [s, store]);
  const num = (v: string) => { const t = v.replace(/\s/g, "").replace(",", "."); return t === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN; };
  const parsed = s.lines.map((l) => ({ gl: l.gl, debit: num(l.debit), credit: num(l.credit), memo: l.memo }));
  const bad = parsed.some((l) => !l.gl || Number.isNaN(l.debit) || Number.isNaN(l.credit) || (l.debit > 0) === (l.credit > 0));
  const b = G.balance(parsed.map((l) => ({ debit: l.debit || 0, credit: l.credit || 0 })));
  const up = (i: number, k: keyof DLine, v: string) => setS({ ...s, lines: s.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) });
  const save = async (): Promise<{ id: string; rev: number } | null> => {
    if (bad) { setMsg("Chaque ligne doit avoir un compte et soit un débit, soit un crédit (montant positif, 2 décimales max.)."); return null; }
    const r = await G.saveDraft(companyId, { id: cur.id, rev: cur.rev, date: s.date, ref: s.ref, desc: s.desc, lines: parsed.map((l) => ({ gl: l.gl, debit: l.debit || 0, credit: l.credit || 0, memo: l.memo })), key: s.key });
    setCur({ id: r.id, rev: r.rev }); return r;
  };
  const run = async (validateToo: boolean) => {
    setBusy(true); setMsg(null);
    try {
      const r = await save(); if (!r) return;
      if (validateToo) { const v = await G.validate(r.id, r.rev); toast({ title: `Écriture n° ${v.entry_no} validée` }); }
      else toast({ title: "Brouillon enregistré" });
      sessionStorage.removeItem(store); onDone(); onClose();
    } catch (e: any) { setMsg(e?.message?.includes("Failed to fetch") ? "Erreur réseau : votre saisie est conservée, réessayez." : e?.message ?? String(e)); }
    finally { setBusy(false); }
  };
  const drop = async () => { if (!cur.id || cur.rev == null) { sessionStorage.removeItem(store); onClose(); return; } setBusy(true); try { await G.discard(cur.id, cur.rev); sessionStorage.removeItem(store); onDone(); onClose(); } catch (e) { err(e); } finally { setBusy(false); } };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
    <DialogHeader><DialogTitle>{init ? "Brouillon d'écriture" : "Nouvelle écriture manuelle"}</DialogTitle></DialogHeader>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-sm">Date comptable *<Input type="date" value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} /></label>
      <label className="text-sm">Référence<Input value={s.ref} maxLength={60} onChange={(e) => setS({ ...s, ref: e.target.value })} /></label>
      <label className="text-sm sm:col-span-3">Description *<Input value={s.desc} maxLength={300} onChange={(e) => setS({ ...s, desc: e.target.value })} /></label>
    </div>
    <div className="space-y-2">{s.lines.map((l, i) => <div key={i} className="grid grid-cols-2 gap-2 rounded border border-border p-2 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto]">
      <select aria-label={`Compte ligne ${i + 1}`} className={`${sel} col-span-2 sm:col-span-1`} value={l.gl} onChange={(e) => up(i, "gl", e.target.value)}><option value="">— Compte —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.number} · {a.name}</option>)}{l.gl && !accs.some((a) => a.id === l.gl) && <option value={l.gl}>{acctLabel(byId, l.gl)} (désactivé)</option>}</select>
      <Input aria-label={`Débit ligne ${i + 1}`} inputMode="decimal" placeholder="Débit" value={l.debit} onChange={(e) => up(i, "debit", e.target.value)} />
      <Input aria-label={`Crédit ligne ${i + 1}`} inputMode="decimal" placeholder="Crédit" value={l.credit} onChange={(e) => up(i, "credit", e.target.value)} />
      <Input aria-label={`Note ligne ${i + 1}`} placeholder="Note" value={l.memo} onChange={(e) => up(i, "memo", e.target.value)} />
      <Button variant="ghost" size="sm" disabled={s.lines.length <= 2} onClick={() => setS({ ...s, lines: s.lines.filter((_, j) => j !== i) })}>Retirer</Button>
    </div>)}</div>
    <Button variant="outline" size="sm" onClick={() => setS({ ...s, lines: [...s.lines, { gl: "", debit: "", credit: "", memo: "" }] })}>Ajouter une ligne</Button>
    <p className={`text-sm ${b.ok ? "" : "text-destructive"}`}>Débits {fmtMoney(b.debit)} · Crédits {fmtMoney(b.credit)} · {b.ok ? "Équilibrée" : `Écart ${fmtMoney(b.gap)} — validation impossible`}</p>
    {msg && <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{msg}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} variant="outline" onClick={() => run(false)}>Enregistrer le brouillon</Button>
      <Button disabled={busy || !b.ok || bad} onClick={() => run(true)}>Valider l'écriture</Button>
      <Button disabled={busy} variant="ghost" onClick={drop}>{cur.id ? "Abandonner le brouillon" : "Annuler"}</Button>
    </div>
  </DialogContent></Dialog>;
}

function EntryDialog({ id, companyId, byId, canCorrect, onClose, onOpen, onChange }: { id: string; companyId: string; byId: Map<string, G.GlAccount>; canCorrect: boolean; onClose: () => void; onOpen: (id: string) => void; onChange: () => void }) {
  const [e, setE] = useState<G.Entry | null>(null);
  const [ev, setEv] = useState<{ action: string; reason: string | null; at: string }[]>([]);
  const [rv, setRv] = useState<{ reason: string; date: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { G.entry(id).then(setE).catch(err); G.events(id).then(setEv).catch(() => setEv([])); }, [id]);
  const href = e ? G.sourceHref(companyId, e.source_kind) : null;
  const doReverse = async () => { if (!rv || !e) return; setBusy(true); setMsg(null);
    try { const r = await G.reverse(e.id, rv.reason, rv.date, rv.key); toast({ title: `Contrepassation n° ${r.entry_no} créée` }); onChange(); onOpen(r.id); }
    catch (x: any) { setMsg(x?.message?.includes("Failed to fetch") ? "Erreur réseau : réessayez, la contrepassation ne sera créée qu'une fois." : x?.message); } finally { setBusy(false); } };
  const ACT: Record<string, string> = { draft_create: "Brouillon créé", draft_update: "Brouillon modifié", validate: "Validée", reverse: "Contrepassation", auto_post: "Comptabilisée automatiquement", auto_void: "Contrepassée (pièce annulée)" };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
    <DialogHeader><DialogTitle>{!e ? "Écriture" : e.status === "draft" ? "Brouillon" : `Écriture n° ${e.entry_no}`}</DialogTitle></DialogHeader>
    {!e ? <p className="text-sm text-muted-foreground">Chargement…</p> : <div className="space-y-3 text-sm">
      <p><strong>{fmtDate(e.entry_date)}</strong>{e.reference ? ` · ${e.reference}` : ""} — {e.description}</p>
      {e.source_kind && <p>Pièce source : {G.SOURCE[e.source_kind]?.l ?? e.source_kind}{e.source_label ? ` — ${e.source_label}` : ""} {href && <a className="underline" href={href}>Ouvrir la pièce</a>}</p>}
      {e.reverses_id && <p>Contrepasse l'écriture <button className="underline" onClick={() => onOpen(e.reverses_id!)}>d'origine</button>{e.reversal_reason ? ` — motif : ${e.reversal_reason}` : ""}</p>}
      {e.reversed_by_id && <p className="font-semibold">Contrepassée par <button className="underline" onClick={() => onOpen(e.reversed_by_id!)}>cette écriture</button></p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Compte</th><th className="text-right">Débit</th><th className="text-right">Crédit</th></tr></thead>
        <tbody>{e.lines.map((l) => <tr key={l.id} className="border-t border-border"><td className="py-1">{acctLabel(byId, l.gl_account_id)}{l.memo ? <div className="text-xs text-muted-foreground">{l.memo}</div> : null}</td><td className="text-right">{l.debit ? fmtMoney(l.debit) : ""}</td><td className="text-right">{l.credit ? fmtMoney(l.credit) : ""}</td></tr>)}
          <tr className="border-t border-border font-semibold"><td>Total</td><td className="text-right">{fmtMoney(G.balance(e.lines).debit)}</td><td className="text-right">{fmtMoney(G.balance(e.lines).credit)}</td></tr></tbody></table></div>
      {ev.length > 0 && <div><h4 className="font-semibold">Historique</h4><ul className="text-xs">{ev.map((x, i) => <li key={i}>{new Date(x.at).toLocaleString("fr-CA")} — {ACT[x.action] ?? x.action}{x.reason ? ` (motif : ${x.reason})` : ""}</li>)}</ul></div>}
      {e.status === "validated" && !e.reversed_by_id && !e.reverses_id && canCorrect && (!rv ? <Button variant="outline" onClick={() => setRv({ reason: "", date: todayIn(), key: newKey() })}>Contrepasser…</Button> :
        <div className="space-y-2 rounded border border-border p-2"><p className="text-xs">Une écriture inverse liée sera validée; l'écriture d'origine reste intacte. Les montants opérationnels (factures, paiements) ne sont pas modifiés.</p>
          <label className="block">Motif *<Input value={rv.reason} onChange={(x) => setRv({ ...rv, reason: x.target.value })} /></label>
          <label className="block">Date comptable de la contrepassation<Input type="date" value={rv.date} onChange={(x) => setRv({ ...rv, date: x.target.value })} /></label>
          {msg && <p role="alert" className="text-destructive">{msg}</p>}
          <Button disabled={busy || rv.reason.trim().length < 3} onClick={doReverse}>Confirmer la contrepassation</Button></div>)}
    </div>}
  </DialogContent></Dialog>;
}

/* ---------------- Grand livre ---------------- */
function Ledger({ companyId, accs, onOpen }: { companyId: string; accs: G.GlAccount[]; onOpen: (id: string) => void }) {
  const [acc, setAcc] = useState(""); const [from, setFrom] = useState(ym()); const [to, setTo] = useState(todayIn());
  const [d, setD] = useState<Awaited<ReturnType<typeof G.ledger>> | null>(null);
  useEffect(() => { if (!acc || !from || !to) return; setD(null); G.ledger(companyId, acc, from, to).then(setD).catch(err); }, [companyId, acc, from, to]);
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="col-span-2 text-xs">Compte<select aria-label="Compte comptable" className={sel} value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">— Choisir —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.number} · {a.name}{a.active ? "" : " (désactivé)"}</option>)}</select></label>
      <label className="text-xs">Du<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="text-xs">Au<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    </div>
    {acc && !d && <p className="text-sm text-muted-foreground">Chargement…</p>}
    {d && <div className="space-y-2 text-sm">
      <p>Solde d'ouverture au {fmtDate(from)} : <strong>{sideAmt(d.opening)}</strong></p>
      {!d.rows.length ? <p className="text-muted-foreground">Aucun mouvement validé sur la période.</p> :
        <ul className="space-y-1">{d.rows.map((r, i) => <li key={i} className="rounded border border-border p-2">
          <div className="flex flex-wrap justify-between gap-2"><span>{fmtDate(r.date)} · N° {r.entry_no}{r.reference ? ` · ${r.reference}` : ""}</span><span>{r.debit ? `Débit ${fmtMoney(r.debit)}` : `Crédit ${fmtMoney(r.credit)}`} · Solde {sideAmt(r.balance)}</span></div>
          <div className="break-words text-xs">{r.description}</div>
          <div className="flex flex-wrap gap-3 text-xs"><button className="underline" onClick={() => onOpen(r.entry_id)}>Ouvrir l'écriture</button>
            {G.sourceHref(companyId, r.source_kind) && <a className="underline" href={G.sourceHref(companyId, r.source_kind)!}>Ouvrir la pièce ({G.SOURCE[r.source_kind!]?.l})</a>}</div>
        </li>)}</ul>}
      <p>Solde de clôture au {fmtDate(to)} : <strong>{sideAmt(d.closing)}</strong></p>
    </div>}
  </div>;
}

/* ---------------- Balance ---------------- */
function Trial({ companyId }: { companyId: string }) {
  const [to, setTo] = useState(todayIn()); const [rows, setRows] = useState<G.TrialRow[] | null>(null);
  useEffect(() => { setRows(null); G.trial(companyId, to).then(setRows).catch(err); }, [companyId, to]);
  const tot = useMemo(() => (rows ?? []).reduce((s, r) => ({ d: s.d + Math.max(r.balance, 0), c: s.c + Math.max(-r.balance, 0) }), { d: 0, c: 0 }), [rows]);
  const ok = Math.round(tot.d * 100) === Math.round(tot.c * 100);
  return <div className="space-y-3 text-sm">
    <label className="block max-w-xs text-xs">Au<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    {!rows ? <p className="text-muted-foreground">Chargement…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[480px]">
      <thead><tr className="text-left text-xs text-muted-foreground"><th>Compte</th><th>Catégorie</th><th className="text-right">Solde débiteur</th><th className="text-right">Solde créditeur</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-border"><td className="py-1">{r.number} · {r.name}{r.active ? "" : " (désactivé)"}</td><td>{G.CAT_LABEL[r.category]}</td>
        <td className="text-right">{r.balance > 0 ? fmtMoney(r.balance) : ""}</td><td className="text-right">{r.balance < 0 ? fmtMoney(-r.balance) : ""}</td></tr>)}
        <tr className="border-t-2 border-border font-semibold"><td colSpan={2}>Totaux</td><td className="text-right">{fmtMoney(tot.d)}</td><td className="text-right">{fmtMoney(tot.c)}</td></tr></tbody></table>
      <p className={`mt-2 ${ok ? "" : "text-destructive"}`}>{ok ? "Balance équilibrée (écritures validées seulement)." : "Balance déséquilibrée — à examiner."}</p></div>}
  </div>;
}

/* ---------------- Plan de comptes et associations ---------------- */
function Plan({ companyId, accs, canWrite, reload }: { companyId: string; accs: G.GlAccount[]; canWrite: boolean; reload: () => void }) {
  const [form, setForm] = useState<{ id: string | null; number: string; name: string; category: G.Cat; active: boolean } | null>(null);
  const [maps, setMaps] = useState<Record<string, string>>({}); const [lk, setLk] = useState<Record<string, string>>({});
  const [fins, setFins] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [r, setR] = useState(0);
  useEffect(() => { G.mappings(companyId).then(setMaps).catch(err); G.links(companyId).then(setLk).catch(err); loadFinAccounts(companyId).then((a: any[]) => setFins(a.map((x) => ({ id: x.id, name: x.name, kind: x.kind })))).catch(err); }, [companyId, r]);
  const save = async () => { if (!form) return; try { await G.saveAccount(companyId, form); toast({ title: "Compte enregistré" }); setForm(null); reload(); } catch (e) { err(e); } };
  const act = accs.filter((a) => a.active);
  const doMap = async (role: string, v: string) => { try { await G.setMapping(companyId, role, v || null); setR((x) => x + 1); } catch (e) { err(e); } };
  const doLink = async (fa: string, v: string) => { try { await G.setLink(companyId, fa, v || null); setR((x) => x + 1); } catch (e) { err(e); } };
  return <div className="space-y-5 text-sm">
    <section className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">Plan de comptes</h3>
      {canWrite && <Button size="sm" onClick={() => setForm({ id: null, number: "", name: "", category: "actif", active: true })}>Ajouter un compte</Button>}</div>
      {!accs.length ? <p className="text-muted-foreground">Aucun compte comptable. Ajoutez vos comptes (numéro, nom, catégorie).</p> :
        <ul className="divide-y divide-border rounded border border-border">{accs.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
          <span className={a.active ? "" : "text-muted-foreground line-through"}>{a.number} · {a.name} <span className="text-xs text-muted-foreground">({G.CAT_LABEL[a.category]})</span></span>
          {canWrite && <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setForm({ ...a })}>Modifier</Button>
            <Button size="sm" variant="ghost" onClick={async () => { try { await G.saveAccount(companyId, { ...a, active: !a.active }); reload(); } catch (e) { err(e); } }}>{a.active ? "Désactiver" : "Réactiver"}</Button></span>}
        </li>)}</ul>}
    </section>
    <section className="space-y-2"><h3 className="font-display font-semibold">Associations des opérations</h3>
      <p className="text-xs text-muted-foreground">Indiquez quel compte comptable reçoit chaque type de montant. Sans association, la pièce reste « À compléter » et n'est pas comptabilisée.</p>
      <div className="grid gap-2 sm:grid-cols-2">{G.ROLES.map((ro) => <label key={ro.v} className="text-xs">{ro.l} <span className="text-muted-foreground">({G.CAT_LABEL[ro.cat]})</span>
        <select disabled={!canWrite} className={`${sel} ${maps[ro.v] ? "" : "border-destructive"}`} value={maps[ro.v] ?? ""} onChange={(e) => doMap(ro.v, e.target.value)}>
          <option value="">À compléter</option>{act.filter((a) => a.category === ro.cat).map((a) => <option key={a.id} value={a.id}>{a.number} · {a.name}</option>)}</select></label>)}</div>
    </section>
    <section className="space-y-2"><h3 className="font-display font-semibold">Comptes financiers → comptes comptables</h3>
      <p className="text-xs text-muted-foreground">Chaque compte financier (banque, caisse, carte) doit être associé à un compte comptable d'actif ou de passif.</p>
      {!fins.length ? <p className="text-muted-foreground">Aucun compte financier.</p> : <div className="grid gap-2 sm:grid-cols-2">{fins.map((fa) => <label key={fa.id} className="text-xs">{fa.name}
        <select disabled={!canWrite} className={`${sel} ${lk[fa.id] ? "" : "border-destructive"}`} value={lk[fa.id] ?? ""} onChange={(e) => doLink(fa.id, e.target.value)}>
          <option value="">À compléter</option>{act.filter((a) => a.category === "actif" || a.category === "passif").map((a) => <option key={a.id} value={a.id}>{a.number} · {a.name}</option>)}</select></label>)}</div>}
    </section>
    {form && <Dialog open onOpenChange={(o) => !o && setForm(null)}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{form.id ? "Modifier le compte" : "Nouveau compte"}</DialogTitle></DialogHeader>
      <label className="text-sm">Numéro *<Input value={form.number} maxLength={20} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
      <label className="text-sm">Nom *<Input value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="text-sm">Catégorie *<select className={sel} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as G.Cat })}>{G.CATS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></label>
      <Button onClick={save} disabled={!form.number.trim() || form.name.trim().length < 2}>Enregistrer</Button>
    </DialogContent></Dialog>}
  </div>;
}
