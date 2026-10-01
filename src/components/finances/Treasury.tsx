// FIN-05 — Trésorerie, budgets, réserves et scénarios (lecture des données réelles; simulations sans écriture).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDraft } from "@/lib/drafts/useDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { addDays, addMonths, fmtDate, parse, todayIn, ymd } from "@/lib/finances/period";
import { daysInclusive, download, toCsv } from "@/lib/finances/query";
import * as T from "@/lib/finances/treasury";
import * as ta from "@/lib/finances/treasuryApi";

const TZ = "America/Toronto";
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const money = (c: number | null | undefined) => c == null ? "Inconnu" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(c / 100);
type View = "prevision" | "comptes" | "entrees" | "budgets" | "reserves" | "scenarios";
const VIEWS: [View, string][] = [["prevision", "Prévision"], ["comptes", "Comptes et soldes"], ["entrees", "Entrées attendues"], ["budgets", "Budgets"], ["reserves", "Réserves"], ["scenarios", "Scénarios"]];
const HORIZONS: Record<string, string> = { w13: "13 semaines", d30: "30 jours", d60: "60 jours", d90: "90 jours", m6: "6 mois", m12: "12 mois", custom: "Dates personnalisées" };
const KIND_LABEL: Record<string, string> = { occurrence: "Échéance", late: "Échéance en retard", payment: "Règlement déclaré", refund: "Remboursement reçu", inflow: "Entrée attendue", transfer: "Transfert", scenario: "Simulation" };
const ACC_KIND: Record<string, string> = { bank: "Compte bancaire", cash: "Encaisse", card: "Carte de crédit", credit: "Marge de crédit" };

function horizon(h: string, today: string, from?: string | null, to?: string | null) {
  const { y, m, d } = parse(today);
  const mo = (k: number) => { const n = addMonths(y, m, k); return addDays(ymd(n.y, n.m, Math.min(d, 28)), -1); };
  switch (h) {
    case "d30": return { from: today, to: addDays(today, 29) };
    case "d60": return { from: today, to: addDays(today, 59) };
    case "d90": return { from: today, to: addDays(today, 89) };
    case "m6": return { from: today, to: mo(6) };
    case "m12": return { from: today, to: mo(12) };
    case "custom": return { from: from && from >= today ? from : today, to: to && to > today ? to : addDays(today, 90) };
    default: return { from: today, to: addDays(today, 90) };
  }
}

export default function Treasury({ companyId, companyName, canWrite, cats }: { companyId: string; companyName: string; canWrite: boolean; cats: { id: string; name: string }[] }) {
  const [params, setParams] = useSearchParams();
  const setP = (k: string, v: string | null) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const view = (params.get("vue") as View) || "prevision";
  const hz = params.get("horizon") || "w13";
  const today = todayIn(TZ);
  const { from, to } = horizon(hz, today, params.get("du"), params.get("au"));
  const threshold = Number(params.get("seuil") || 0);
  const [data, setData] = useState<Awaited<ReturnType<typeof ta.loadTreasury>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const refresh = useCallback(() => setRev((r) => r + 1), []);
  useEffect(() => {
    let live = true; setData(null); setError(null);
    ta.loadTreasury(companyId, from, to).then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [companyId, from, to, rev]);

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto" aria-label="Trésorerie">
        {VIEWS.map(([v, l]) => <button key={v} onClick={() => setP("vue", v)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${view === v ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{l}</button>)}
      </nav>
      {(view === "prevision" || view === "scenarios") && (
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label="Horizon" className={sel} value={hz} onChange={(e) => setP("horizon", e.target.value)}>{Object.entries(HORIZONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {hz === "custom" && <><Input aria-label="Du" type="date" className="w-40" value={from} onChange={(e) => setP("du", e.target.value)} /><Input aria-label="Au" type="date" className="w-40" value={to} onChange={(e) => setP("au", e.target.value)} /></>}
          <label className="text-xs">Seuil minimal ($)<Input aria-label="Seuil" type="number" step="100" className="w-32" value={threshold || ""} onChange={(e) => setP("seuil", e.target.value || null)} /></label>
        </div>
      )}
      {error ? <p className="text-destructive">{error}</p> : !data ? <p className="text-muted-foreground">Calcul en cours…</p> : <>
        {view === "prevision" && <Prevision data={data} from={from} to={to} threshold={threshold} companyName={companyName} />}
        {view === "comptes" && <Accounts companyId={companyId} data={data} canWrite={canWrite} refresh={refresh} />}
        {view === "entrees" && <Inflows companyId={companyId} data={data} canWrite={canWrite} refresh={refresh} />}
        {view === "budgets" && <Budgets companyId={companyId} canWrite={canWrite} cats={cats} />}
        {view === "reserves" && <Reserves companyId={companyId} data={data} canWrite={canWrite} refresh={refresh} today={today} />}
        {view === "scenarios" && <Scenarios companyId={companyId} data={data} canWrite={canWrite} from={from} to={to} threshold={threshold} />}
      </>}
    </div>
  );
}

type Data = Awaited<ReturnType<typeof ta.loadTreasury>>;
const run = (d: Data, from: string, to: string, thr: number, moves = d.moves) => T.forecast({ from, to, accounts: d.accounts, balances: d.balances, moves, reserves: d.reserves, thresholdC: Math.round(thr * 100) });

function Kpis({ f }: { f: T.Forecast }) {
  const k = (l: string, v: string, tone = "") => <div className="rounded-lg border border-border p-3"><div className="text-[11px] text-muted-foreground">{l}</div><div className={`font-display text-lg font-bold ${tone}`}>{v}</div></div>;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {k("Solde de départ", money(f.startC))}{k("Entrées prévues", money(f.inC))}{k("Sorties prévues", money(f.outC))}{k(f.partial.length ? "Solde projeté fin (partiel)" : "Solde projeté fin", money(f.endC), (f.endC ?? 0) < 0 ? "text-destructive" : "")}
    {k("Point bas quotidien", f.low ? `${money(f.low.c)} · ${fmtDate(f.low.date)}` : "Inconnu", (f.low?.c ?? 0) < 0 ? "text-destructive" : "")}
    {k("Premier manque", f.firstShort ? fmtDate(f.firstShort) : f.startC == null ? "Inconnu" : "Aucun")}
    {k("Montant nécessaire (seuil)", money(f.neededC))}{k("Disponible après réserves (fin)", money(f.endC == null ? null : f.endC - f.heldEndC))}
  </div>;
}

function Prevision({ data, from, to, threshold, companyName }: { data: Data; from: string; to: string; threshold: number; companyName: string }) {
  const f = useMemo(() => run(data, from, to, threshold), [data, from, to, threshold]);
  const [open, setOpen] = useState<{ title: string; moves: T.Movement[] } | null>(null);
  const by = daysInclusive(from, to) > 120 ? "month" : "week";
  const rows = T.buckets(f, by);
  const chart = f.days.map((d) => ({ date: d.date.slice(5), solde: d.closeC == null ? null : d.closeC / 100, disponible: d.availC == null ? null : d.availC / 100 }));
  const exportCsv = () => download(`tresorerie-${companyName.replace(/\W+/g, "-")}-${from}-${to}.csv`, toCsv(
    [["Entreprise", companyName], ["Du", from], ["Au", to], ["Solde de départ", f.startC == null ? "Inconnu" : f.startC / 100], ["Solde projeté fin", f.endC == null ? "Inconnu" : f.endC / 100], ["Montants inconnus (nombre)", f.unknown.length], ["Prévision", f.partial.length ? "Partielle" : "Complète"], ["Sorties non affectées", f.unassignedC / 100]],
    ["Date", "Type", "Libellé", "Entrée", "Sortie", "Mention"],
    [...f.moves, ...f.unknown].map((m) => [m.date, KIND_LABEL[m.kind], m.label, m.dir === "in" && m.cents != null ? m.cents / 100 : "", m.dir === "out" && m.cents != null ? m.cents / 100 : "", [m.cents == null ? "Montant inconnu" : m.flag ?? "", m.unassigned ? "Non affecté" : ""].filter(Boolean).join(" · ")])));
  return <div className="space-y-3">
    {f.missingBalances.length > 0 && <p className="rounded-md bg-amber-500/10 p-2 text-sm">Solde inconnu pour : {f.missingBalances.join(", ")}. Le solde projeté reste « Inconnu » tant qu'il n'est pas saisi (jamais zéro par défaut).</p>}
    {data.accounts.length === 0 && <p className="rounded-md bg-secondary p-2 text-sm">Aucun compte : ajoutez un compte et son solde dans « Comptes et soldes ».</p>}
    {f.partial.length > 0 && <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm"><strong>Prévision partielle</strong> — le solde projeté n'est pas certain :<ul className="list-disc pl-5">{f.partial.map((x) => <li key={x}>{x}</li>)}</ul><span className="text-xs">Affectez un compte prévu aux échéances dans « Comptes et soldes ».</span></div>}
    {f.unassignedC > 0 && <p className="text-xs text-muted-foreground">Dont {money(f.unassignedC)} de sorties « Non affecté » (comptées dans la prévision globale, sans compte attribué).</p>}
    {f.toReplan > 0 && <p className="rounded-md bg-amber-500/10 p-2 text-sm">{f.toReplan} échéance(s) en retard comptée(s) une seule fois au début de la prévision — <strong>À replanifier</strong>.</p>}
    {f.unknown.length > 0 && <button className="text-left text-sm underline" onClick={() => setOpen({ title: "Montants inconnus (non comptés)", moves: f.unknown })}>{f.unknown.length} mouvement(s) au montant inconnu, non comptés — voir</button>}
    {f.otherCurrencies.length > 0 && <p className="text-xs text-muted-foreground">Devises séparées, non additionnées : {f.otherCurrencies.join(", ")}.</p>}
    <Kpis f={f} />
    {f.startC != null && <div className="h-56 w-full rounded-lg border border-border p-2"><ResponsiveContainer><AreaChart data={chart}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="date" fontSize={10} minTickGap={24} /><YAxis fontSize={10} width={56} /><Tooltip formatter={(v: number) => money(Math.round(v * 100))} /><ReferenceLine y={threshold} className="stroke-destructive" strokeDasharray="4 4" /><Area type="stepAfter" dataKey="solde" name="Solde" className="fill-primary/20 stroke-primary" /><Area type="stepAfter" dataKey="disponible" name="Disponible" fillOpacity={0} className="stroke-muted-foreground" /></AreaChart></ResponsiveContainer></div>}
    <div className="flex justify-end"><Button variant="outline" size="sm" onClick={exportCsv}>Exporter CSV</Button></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">{by === "week" ? "Semaine" : "Mois"}</th><th className="p-2 text-right">Entrées</th><th className="p-2 text-right">Sorties</th><th className="p-2 text-right">Point bas</th><th className="p-2 text-right">Solde fin</th></tr></thead>
      <tbody>{rows.map((r) => { const ms = f.moves.filter((m) => m.date >= r.from && m.date <= r.to); return <tr key={r.key} className="border-t border-border">
        <td className="p-2">{fmtDate(r.from)}</td>
        <td className="p-2 text-right"><button className="underline decoration-dotted" onClick={() => setOpen({ title: `Entrées — ${fmtDate(r.from)}`, moves: ms.filter((m) => m.dir === "in") })}>{money(r.inC)}</button></td>
        <td className="p-2 text-right"><button className="underline decoration-dotted" onClick={() => setOpen({ title: `Sorties — ${fmtDate(r.from)}`, moves: ms.filter((m) => m.dir === "out") })}>{money(r.outC)}</button></td>
        <td className={`p-2 text-right ${(r.lowC ?? 0) < threshold * 100 ? "text-destructive" : ""}`}>{money(r.lowC)}</td><td className="p-2 text-right">{money(r.closeC)}</td></tr>; })}</tbody></table></div>
    <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}><DialogContent className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>{open?.title}</DialogTitle></DialogHeader>
      {open?.moves.length ? <ul className="divide-y divide-border text-sm">{open.moves.map((m) => <li key={m.id + m.date} className="flex justify-between gap-2 py-2"><span><span className="text-xs text-muted-foreground">{fmtDate(m.date)} · {KIND_LABEL[m.kind]}{m.flag ? ` · ${m.flag}` : ""}{m.unassigned ? " · Non affecté" : ""}</span><br />{m.label}</span><strong>{money(m.cents)}</strong></li>)}</ul> : <p className="text-sm text-muted-foreground">Aucune opération.</p>}
    </DialogContent></Dialog>
  </div>;
}

function Accounts({ companyId, data, canWrite, refresh }: { companyId: string; data: Data; canWrite: boolean; refresh: () => void }) {
  const [a, setA] = useState({ name: "", kind: "bank", currency: "CAD" });
  const [b, setB] = useState<{ account_id: string; amount: string; as_of: string; source: string } | null>(null);
  const [tr, setTr] = useState({ from_account: "", to_account: "", amount: "", planned_on: "" });
  const save = async (fn: () => Promise<unknown>) => { try { await fn(); toast({ title: "Enregistré" }); refresh(); } catch (e: any) { toast({ title: "Refusé", description: e.message, variant: "destructive" }); } };
  const latest = (id: string) => data.balances.find((x) => x.account_id === id);
  return <div className="space-y-4">
    <ul className="divide-y divide-border rounded-lg border border-border">{data.accounts.map((x) => { const l = latest(x.id); return <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
      <span><strong>{x.name}</strong> <span className="text-xs text-muted-foreground">· {ACC_KIND[x.kind]} · {x.currency}{x.kind === "card" || x.kind === "credit" ? " · hors encaisse (crédit disponible ≠ argent reçu)" : ""}</span><br />
        {l ? <span>{money(T.toCents(l.amount))} au {fmtDate(l.as_of)} <span className="text-xs text-muted-foreground">— source : {l.source}</span></span> : <span className="text-amber-700">Solde inconnu</span>}</span>
      {canWrite && <Button size="sm" variant="outline" onClick={() => setB({ account_id: x.id, amount: "", as_of: todayIn(TZ), source: "" })}>Saisir un solde</Button>}</li>; })}
      {!data.accounts.length && <li className="p-3 text-sm text-muted-foreground">Aucun compte.</li>}</ul>
    {canWrite && <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
      <Input aria-label="Nom du compte" placeholder="Nom du compte" className="w-48" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
      <select aria-label="Type de compte" className={sel} value={a.kind} onChange={(e) => setA({ ...a, kind: e.target.value })}>{Object.entries(ACC_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <Input aria-label="Devise" className="w-20" maxLength={3} value={a.currency} onChange={(e) => setA({ ...a, currency: e.target.value.toUpperCase() })} />
      <Button disabled={!a.name.trim()} onClick={() => save(async () => { await ta.insert("fin_accounts", { company_id: companyId, name: a.name.trim(), kind: a.kind, currency: a.currency, included: a.kind === "bank" || a.kind === "cash" }); setA({ name: "", kind: "bank", currency: "CAD" }); })}>Ajouter le compte</Button></div>}
    {canWrite && data.accounts.length > 1 && <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3"><span className="w-full text-xs text-muted-foreground">Transfert prévu entre comptes (effet global nul si les deux comptes sont inclus)</span>
      <select aria-label="De" className={sel} value={tr.from_account} onChange={(e) => setTr({ ...tr, from_account: e.target.value })}><option value="">De…</option>{data.accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select aria-label="Vers" className={sel} value={tr.to_account} onChange={(e) => setTr({ ...tr, to_account: e.target.value })}><option value="">Vers…</option>{data.accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <Input aria-label="Montant du transfert" type="number" step="0.01" className="w-28" value={tr.amount} onChange={(e) => setTr({ ...tr, amount: e.target.value })} />
      <Input aria-label="Date du transfert" type="date" className="w-40" value={tr.planned_on} onChange={(e) => setTr({ ...tr, planned_on: e.target.value })} />
      <Button disabled={!tr.from_account || !tr.to_account || tr.from_account === tr.to_account || !(Number(tr.amount) > 0) || !tr.planned_on} onClick={() => save(async () => { await ta.insert("fin_transfers", { company_id: companyId, ...tr, amount: Number(tr.amount) }); setTr({ from_account: "", to_account: "", amount: "", planned_on: "" }); })}>Ajouter</Button></div>}
    <ObligationAccounts companyId={companyId} data={data} canWrite={canWrite} save={save} />
    {data.transfers.length > 0 && <ul className="text-sm">{data.transfers.map((t) => <li key={t.id}>{fmtDate(t.planned_on)} · {money(T.toCents(t.amount))} · {data.accounts.find((x) => x.id === t.from_account)?.name} → {data.accounts.find((x) => x.id === t.to_account)?.name}{canWrite && <button className="ml-2 text-xs underline" onClick={() => save(() => ta.archive("fin_transfers", t.id))}>Retirer</button>}</li>)}</ul>}
    <Dialog open={!!b} onOpenChange={(o) => !o && setB(null)}><DialogContent><DialogHeader><DialogTitle>Solde du compte</DialogTitle></DialogHeader>{b && <div className="space-y-2">
      <Input aria-label="Montant du solde" type="number" step="0.01" placeholder="Montant" value={b.amount} onChange={(e) => setB({ ...b, amount: e.target.value })} />
      <Input aria-label="Date du solde" type="date" value={b.as_of} max={todayIn(TZ)} onChange={(e) => setB({ ...b, as_of: e.target.value })} />
      <Input aria-label="Source du solde" placeholder="Source (relevé, application bancaire…)" value={b.source} onChange={(e) => setB({ ...b, source: e.target.value })} />
      <p className="text-xs text-muted-foreground">Les règlements datés au plus tard ce jour sont considérés comme déjà inclus dans ce solde.</p>
      <Button disabled={b.amount === "" || !Number.isFinite(Number(b.amount)) || !b.as_of || !b.source.trim()} onClick={() => save(async () => { await ta.insert("fin_balances", { company_id: companyId, account_id: b.account_id, amount: Number(b.amount), as_of: b.as_of, source: b.source.trim() }); setB(null); })}>Enregistrer le solde</Button></div>}</DialogContent></Dialog>
  </div>;
}

function ObligationAccounts({ companyId, data, canWrite, save }: { companyId: string; data: Data; canWrite: boolean; save: (fn: () => Promise<unknown>) => void }) {
  const obls = useMemo(() => { const m = new Map<string, string>(); data.moves.forEach((x) => x.obligation_id && m.set(x.obligation_id, x.label)); return [...m].sort((a, b) => a[1].localeCompare(b[1])); }, [data]);
  if (!obls.length) return null;
  return <div className="rounded-lg border border-border p-3"><div className="mb-2 text-sm font-semibold">Compte de paiement prévu des échéances</div>
    <p className="mb-2 text-xs text-muted-foreground">Carte de crédit : l'achat ne réduit pas le compte bancaire; prévoyez le remboursement de la carte comme une échéance payée par le compte bancaire.</p>
    <ul className="divide-y divide-border text-sm">{obls.map(([id, l]) => <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{l}</span>
      <select aria-label={`Compte prévu — ${l}`} className={sel} disabled={!canWrite} value={data.obligationAccounts[id] ?? ""} onChange={(e) => save(() => ta.setObligationAccount(companyId, id, e.target.value || null))}>
        <option value="">Non affecté</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({ACC_KIND[a.kind]})</option>)}</select></li>)}</ul></div>;
}

function Inflows({ companyId, data, canWrite, refresh }: { companyId: string; data: Data; canWrite: boolean; refresh: () => void }) {
  const { user } = useAuthReady();
  const empty = { amount: "", expected_on: "", counterparty: "", account_id: "", certainty: "probable" };
  const [f, setF] = useState(empty);
  const draft = useDraft({
    id: user && canWrite ? { module: "finances", form: "tresorerie-entree", owner: user.id, company: companyId, recordId: null } : null,
    data: f, label: (d) => `Entrée attendue — ${d.counterparty || "nouvelle"}`, route: `/entrepreneur/finances?tab=tresorerie&vue=entrees&company=${companyId}`,
    isEmpty: (d) => !d.amount && !d.counterparty && !d.expected_on, onRestore: (d) => setF({ ...empty, ...d }),
  });
  const [recv, setRecv] = useState<{ id: string; v: string } | null>(null);
  const save = async (fn: () => Promise<unknown>) => { try { await fn(); toast({ title: "Enregistré" }); refresh(); } catch (e: any) { toast({ title: "Refusé", description: e.message, variant: "destructive" }); } };
  return <div className="space-y-3">
    {canWrite && <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <DraftStatusBar status={draft.status} savedAt={draft.savedAt} restored={!!draft.restoredMeta} onDiscard={() => { draft.finalize(); setF(empty); }} sync={draft.sync} synced={draft.synced} conflict={draft.conflict} onUseServer={draft.useServerVersion} onKeepLocal={draft.keepLocalVersion} onRestartAsNew={draft.restartAsNew} restartError={draft.restartError} onRetry={draft.retrySave} />
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="Contrepartie" placeholder="Contrepartie (client…)" className="w-48" value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} />
        <Input aria-label="Montant attendu" type="number" step="0.01" placeholder="Montant" className="w-28" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Input aria-label="Date attendue" type="date" className="w-40" value={f.expected_on} onChange={(e) => setF({ ...f, expected_on: e.target.value })} />
        <select aria-label="Compte" className={sel} value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}><option value="">Compte non précisé</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select aria-label="Certitude" className={sel} value={f.certainty} onChange={(e) => setF({ ...f, certainty: e.target.value })}><option value="certain">Certaine</option><option value="probable">Probable</option><option value="possible">Possible</option></select>
        <Button disabled={!(Number(f.amount) > 0) || !f.expected_on || !f.counterparty.trim()} onClick={() => save(async () => { await ta.insert("fin_expected_inflows", { company_id: companyId, amount: Number(f.amount), expected_on: f.expected_on, counterparty: f.counterparty.trim(), account_id: f.account_id || null, certainty: f.certainty }); draft.finalize(); setF(empty); })}>Ajouter</Button>
      </div><p className="text-xs text-muted-foreground">Un revenu attendu n'est pas de l'argent reçu : il n'entre dans le solde qu'à sa date prévue.</p></div>}
    <ul className="divide-y divide-border rounded-lg border border-border">{data.inflows.map((i) => { const left = T.remainingExpected(i.amount, i.received); return <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
      <span><strong>{i.counterparty}</strong> · {fmtDate(i.expected_on)} · {i.certainty}<br />{money(T.toCents(i.amount))}{Number(i.received) > 0 && <> · encaissé {money(T.toCents(i.received))} · reste {money(left)}</>}
        {(i.retention_schedule ?? []).map((r) => <span key={r.id} className="block text-xs text-muted-foreground">dont retenue {money(T.toCents(r.amount))} · {r.date ? `libération prévue ${fmtDate(r.date)}` : "date de libération à compléter (hors dates précises)"}</span>)}</span>
      {canWrite && <span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setRecv({ id: i.id, v: String(i.received ?? 0) })}>Encaissement déclaré</Button><Button size="sm" variant="ghost" onClick={() => save(() => ta.archive("fin_expected_inflows", i.id))}>Retirer</Button></span>}</li>; })}
      {!data.inflows.length && <li className="p-3 text-sm text-muted-foreground">Aucune entrée attendue.</li>}</ul>
    {data.retentionUndated > 0 && <p role="status" className="text-xs text-muted-foreground">Retenues sans date de libération : {money(data.retentionUndated)} — à compléter, exclues des prévisions datées.</p>}
    <Dialog open={!!recv} onOpenChange={(o) => !o && setRecv(null)}><DialogContent><DialogHeader><DialogTitle>Montant déjà encaissé</DialogTitle></DialogHeader>{recv && <div className="space-y-2">
      <Input aria-label="Montant encaissé" type="number" step="0.01" min="0" value={recv.v} onChange={(e) => setRecv({ ...recv, v: e.target.value })} />
      <p className="text-xs text-muted-foreground">L'entrée attendue est réduite d'autant, sans doublon.</p>
      <Button disabled={!(Number(recv.v) >= 0)} onClick={() => save(async () => { await ta.update("fin_expected_inflows", recv.id, { received: Number(recv.v), updated_at: new Date().toISOString() }); setRecv(null); })}>Enregistrer</Button></div>}</DialogContent></Dialog>
  </div>;
}

function Budgets({ companyId, canWrite, cats }: { companyId: string; canWrite: boolean; cats: { id: string; name: string }[] }) {
  const [list, setList] = useState<(ta.Budget & { a?: Awaited<ReturnType<typeof ta.budgetActuals>> })[] | null>(null);
  const [f, setF] = useState({ category_id: "", period_from: "", period_to: "", amount: "" });
  const [rev, setRev] = useState(0);
  useEffect(() => { ta.budgets(companyId).then(async (bs) => { setList(bs); const withA = await Promise.all(bs.map(async (b) => ({ ...b, a: await ta.budgetActuals(companyId, b) }))); setList(withA); }).catch(() => setList([])); }, [companyId, rev]);
  const [det, setDet] = useState<(typeof list extends (infer X)[] | null ? X : never) | null>(null);
  const exportB = () => list && download("budgets.csv", toCsv([["Paiements nets", "versements affectés − remboursements reçus (reliquat non affecté exclu)"]],
    ["Catégorie", "Début", "Fin", "Budget", "Versements", "Remboursements", "Payé net", "Engagé restant", "Écart"],
    list.map((b) => [cats.find((c) => c.id === b.category_id)?.name ?? "Toutes", b.period_from, b.period_to, Number(b.amount), (b.a?.grossC ?? 0) / 100, -(b.a?.refundC ?? 0) / 100, (b.a?.paidC ?? 0) / 100, (b.a?.remainC ?? 0) / 100, (b.a?.gapC ?? 0) / 100])));
  const save = async (fn: () => Promise<unknown>) => { try { await fn(); toast({ title: "Enregistré" }); setRev((r) => r + 1); } catch (e: any) { toast({ title: "Refusé", description: e.message, variant: "destructive" }); } };
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Un budget ne crée aucun paiement : il compare le prévu aux paiements déclarés nets et aux engagements restants.</p>
    {canWrite && <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
      <select aria-label="Catégorie du budget" className={sel} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">Toutes catégories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <Input aria-label="Début" type="date" className="w-40" value={f.period_from} onChange={(e) => setF({ ...f, period_from: e.target.value })} />
      <Input aria-label="Fin" type="date" className="w-40" value={f.period_to} onChange={(e) => setF({ ...f, period_to: e.target.value })} />
      <Input aria-label="Montant du budget" type="number" step="0.01" className="w-28" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      <Button disabled={!f.period_from || !f.period_to || f.period_to < f.period_from || !(Number(f.amount) >= 0) || f.amount === ""} onClick={() => save(async () => { await ta.insert("fin_budgets", { company_id: companyId, category_id: f.category_id || null, period_from: f.period_from, period_to: f.period_to, amount: Number(f.amount) }); setF({ category_id: "", period_from: "", period_to: "", amount: "" }); })}>Ajouter</Button></div>}
    {!list ? <p className="text-muted-foreground">Chargement…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Catégorie · période</th><th className="p-2 text-right">Budget</th><th className="p-2 text-right">Payé net</th><th className="p-2 text-right">Engagé restant</th><th className="p-2 text-right">Écart</th><th /></tr></thead>
      <tbody>{list.map((b) => <tr key={b.id} className="border-t border-border"><td className="p-2">{cats.find((c) => c.id === b.category_id)?.name ?? "Toutes"}<br /><span className="text-xs text-muted-foreground">{fmtDate(b.period_from)} – {fmtDate(b.period_to)}{b.a?.unknown ? ` · ${b.a.unknown} montant(s) inconnu(s)` : ""}</span></td>
        <td className="p-2 text-right">{money(T.toCents(b.amount))}</td><td className="p-2 text-right">{b.a ? <button className="underline decoration-dotted" onClick={() => setDet(b)}>{money(b.a.paidC)}</button> : "…"}</td><td className="p-2 text-right">{b.a ? money(b.a.remainC) : "…"}</td><td className={`p-2 text-right ${(b.a?.gapC ?? 0) < 0 ? "text-destructive" : ""}`}>{b.a ? money(b.a.gapC) : "…"}</td>
        <td className="p-2">{canWrite && <button className="text-xs underline" onClick={() => save(() => ta.archive("fin_budgets", b.id))}>Retirer</button>}</td></tr>)}
        {!list.length && <tr><td className="p-2 text-muted-foreground" colSpan={6}>Aucun budget.</td></tr>}</tbody></table></div>}
    {!!list?.length && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={exportB}>Exporter CSV</Button></div>}
    <Dialog open={!!det} onOpenChange={(o) => !o && setDet(null)}><DialogContent className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Paiements nets</DialogTitle></DialogHeader>{det?.a && <div className="space-y-2 text-sm">
      <p>Versements {money(det.a.grossC)} − remboursements {money(det.a.refundC)} = <strong>{money(det.a.paidC)}</strong></p>
      <ul className="divide-y divide-border">{det.a.lines.map((l, i) => <li key={i} className="flex justify-between py-1.5"><span>{fmtDate(l.date)} · {l.type}{l.note ? <span className="text-xs text-muted-foreground"> · {l.note}</span> : null}</span><strong>{money(l.cents)}</strong></li>)}{!det.a.lines.length && <li className="py-1.5 text-muted-foreground">Aucun versement.</li>}</ul></div>}</DialogContent></Dialog>
  </div>;
}

function Reserves({ companyId, data, canWrite, refresh, today }: { companyId: string; data: Data; canWrite: boolean; refresh: () => void; today: string }) {
  const [f, setF] = useState({ name: "", kind: "assurance", target: "", reserved: "", target_date: "", obligation_id: "" });
  const obls = useMemo(() => { const m = new Map<string, string>(); data.moves.forEach((x) => x.obligation_id && m.set(x.obligation_id, x.label)); return [...m]; }, [data]);
  const save = async (fn: () => Promise<unknown>) => { try { await fn(); toast({ title: "Enregistré" }); refresh(); } catch (e: any) { toast({ title: "Refusé", description: e.message, variant: "destructive" }); } };
  const held = data.reserves.reduce((s, r) => s + (T.toCents(r.reserved) ?? 0), 0);
  return <div className="space-y-3">
    <p className="text-sm">Réservé au total : <strong>{money(held)}</strong> <span className="text-xs text-muted-foreground">— réserve virtuelle : le solde bancaire ne change pas, seul le « disponible après réserves » est réduit. Le paiement lié consomme la réserve (jamais déduit deux fois).</span></p>
    {canWrite && <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
      <Input aria-label="Nom de la réserve" placeholder="Nom" className="w-40" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <select aria-label="Type de réserve" className={sel} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="assurance">Assurance</option><option value="reparation">Réparation</option><option value="autre">Autre</option></select>
      <Input aria-label="Cible" type="number" step="0.01" placeholder="Cible" className="w-28" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />
      <Input aria-label="Déjà réservé" type="number" step="0.01" placeholder="Déjà réservé" className="w-28" value={f.reserved} onChange={(e) => setF({ ...f, reserved: e.target.value })} />
      <Input aria-label="Date cible" type="date" className="w-40" value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} />
      <select aria-label="Paiement lié" className={sel} value={f.obligation_id} onChange={(e) => setF({ ...f, obligation_id: e.target.value })}><option value="">Aucun paiement lié</option>{obls.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
      <Button disabled={!f.name.trim() || !(Number(f.target) > 0) || !f.target_date} onClick={() => save(async () => { await ta.insert("fin_reserves", { company_id: companyId, name: f.name.trim(), kind: f.kind, target: Number(f.target), reserved: Number(f.reserved || 0), target_date: f.target_date, obligation_id: f.obligation_id || null }); setF({ name: "", kind: "assurance", target: "", reserved: "", target_date: "", obligation_id: "" }); })}>Ajouter</Button></div>}
    <ul className="divide-y divide-border rounded-lg border border-border">{data.reserves.map((r) => { const m = T.reserveMonthly(r, today); return <li key={r.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
      <span><strong>{r.name}</strong> · cible {money(T.toCents(r.target))} au {fmtDate(r.target_date)}<br />Réservé {money(T.toCents(r.reserved))} · reste {money(m.leftC)} · à mettre de côté {money(m.perMonthC)} / mois ({m.months} mois)</span>
      {canWrite && <button className="text-xs underline" onClick={() => save(() => ta.archive("fin_reserves", r.id))}>Retirer</button>}</li>; })}
      {!data.reserves.length && <li className="p-3 text-sm text-muted-foreground">Aucune réserve.</li>}</ul>
  </div>;
}

function Scenarios({ companyId, data, canWrite, from, to, threshold }: { companyId: string; data: Data; canWrite: boolean; from: string; to: string; threshold: number }) {
  const [list, setList] = useState<ta.Scenario[]>([]);
  const [cur, setCur] = useState<{ id: string | null; name: string; hyps: T.Hypothesis[] }>({ id: null, name: "", hyps: [] });
  const [cmp, setCmp] = useState<string[]>([]);
  const [h, setH] = useState<{ type: T.Hypothesis["type"]; a: string; b: string; c: string }>({ type: "delay_inflow", a: "", b: "", c: "" });
  const [rev, setRev] = useState(0);
  useEffect(() => { ta.scenarios(companyId).then(setList).catch(() => setList([])); }, [companyId, rev]);
  const hash = useMemo(() => T.sourceHash(data.moves), [data]);
  const base = useMemo(() => run(data, from, to, threshold), [data, from, to, threshold]);
  const sim = useMemo(() => run(data, from, to, threshold, T.applyScenario(data.moves, cur.hyps)), [data, from, to, threshold, cur.hyps]);
  const obls = useMemo(() => { const m = new Map<string, string>(); data.moves.forEach((x) => x.obligation_id && m.set(x.obligation_id, x.label)); return [...m]; }, [data]);
  const addHyp = () => {
    let x: T.Hypothesis | null = null;
    if (h.type === "delay_inflow" && Number(h.a) > 0) x = { type: "delay_inflow", days: Number(h.a), certainty: h.b || undefined };
    if (h.type === "expense_increase" && Number(h.a) > 0) x = { type: "expense_increase", pct: Number(h.a), category: h.b || undefined };
    if (h.type === "one_off" && Number(h.a) > 0 && h.b) x = { type: "one_off", amount: Number(h.a), date: h.b, label: h.c || "Réparation" };
    if (h.type === "annual_to_monthly" && h.b && Number(h.a) >= 2) x = { type: "annual_to_monthly", obligation_id: h.b, months: Number(h.a) };
    if (x) { setCur({ ...cur, hyps: [...cur.hyps, x] }); setH({ ...h, a: "", b: "", c: "" }); }
  };
  const save = async (dup = false) => {
    try {
      const row = { name: (dup ? `${cur.name} (copie)` : cur.name).trim(), hypotheses: cur.hyps, source_hash: hash, updated_at: new Date().toISOString() };
      if (cur.id && !dup) await ta.update("fin_scenarios", cur.id, row); else { const id = await ta.insert("fin_scenarios", { company_id: companyId, ...row }); setCur({ ...cur, id, name: row.name }); }
      toast({ title: dup ? "Scénario dupliqué" : "Scénario enregistré", description: "Aucune donnée réelle n'est modifiée." }); setRev((r) => r + 1);
    } catch (e: any) { toast({ title: "Refusé", description: e.message, variant: "destructive" }); }
  };
  const row = (l: string, f: T.Forecast) => <tr className="border-t border-border"><td className="p-2">{l}</td><td className="p-2 text-right">{money(f.endC)}</td><td className="p-2 text-right">{f.low ? money(f.low.c) : "Inconnu"}</td><td className="p-2 text-right">{f.firstShort ? fmtDate(f.firstShort) : "Aucun"}</td><td className="p-2 text-right">{money(f.neededC)}</td></tr>;
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Simulation seulement : aucune obligation ni aucun règlement réel n'est modifié.</p>
    <div className="flex flex-wrap gap-2">{list.map((s) => <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">
      <button className="font-semibold" onClick={() => setCur({ id: s.id, name: s.name, hyps: s.hypotheses as T.Hypothesis[] })}>{s.name}</button>{s.source_hash && s.source_hash !== hash && <span className="text-amber-700" title="Les données réelles ont changé depuis l'enregistrement">· données modifiées</span>}
      <input type="checkbox" aria-label={`Comparer ${s.name}`} checked={cmp.includes(s.id)} onChange={(e) => setCmp(e.target.checked ? [...cmp, s.id] : cmp.filter((x) => x !== s.id))} />
      {canWrite && <button aria-label={`Retirer ${s.name}`} onClick={async () => { await ta.archive("fin_scenarios", s.id); setRev((r) => r + 1); }}>×</button>}</span>)}
      <Button size="sm" variant="outline" onClick={() => setCur({ id: null, name: "", hyps: [] })}>Nouveau</Button></div>
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Input aria-label="Nom du scénario" placeholder="Nom du scénario" value={cur.name} onChange={(e) => setCur({ ...cur, name: e.target.value })} />
      <ul className="text-sm">{cur.hyps.map((x, i) => <li key={i}>• {T.describe(x)} <button className="text-xs underline" onClick={() => setCur({ ...cur, hyps: cur.hyps.filter((_, j) => j !== i) })}>retirer</button></li>)}{!cur.hyps.length && <li className="text-muted-foreground">Aucune hypothèse.</li>}</ul>
      <div className="flex flex-wrap items-end gap-2">
        <select aria-label="Hypothèse" className={sel} value={h.type} onChange={(e) => setH({ type: e.target.value as any, a: "", b: "", c: "" })}>{Object.entries(T.HYP_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {h.type === "delay_inflow" && <><Input aria-label="Jours de retard" type="number" placeholder="Jours" className="w-24" value={h.a} onChange={(e) => setH({ ...h, a: e.target.value })} /><select aria-label="Certitude visée" className={sel} value={h.b} onChange={(e) => setH({ ...h, b: e.target.value })}><option value="">Toutes</option><option value="certain">Certaines</option><option value="probable">Probables</option><option value="possible">Possibles</option></select></>}
        {h.type === "expense_increase" && <><Input aria-label="Hausse en %" type="number" placeholder="%" className="w-20" value={h.a} onChange={(e) => setH({ ...h, a: e.target.value })} /><select aria-label="Catégorie visée" className={sel} value={h.b} onChange={(e) => setH({ ...h, b: e.target.value })}><option value="">Toutes</option>{[...new Set(data.moves.map((m) => m.category).filter(Boolean))].map((c) => <option key={c!} value={c!}>{c}</option>)}</select></>}
        {h.type === "one_off" && <><Input aria-label="Montant de la réparation" type="number" placeholder="Montant" className="w-28" value={h.a} onChange={(e) => setH({ ...h, a: e.target.value })} /><Input aria-label="Date de la réparation" type="date" className="w-40" value={h.b} onChange={(e) => setH({ ...h, b: e.target.value })} /><Input aria-label="Libellé" placeholder="Libellé" className="w-36" value={h.c} onChange={(e) => setH({ ...h, c: e.target.value })} /></>}
        {h.type === "annual_to_monthly" && <><select aria-label="Paiement annuel" className={sel} value={h.b} onChange={(e) => setH({ ...h, b: e.target.value })}><option value="">Choisir…</option>{obls.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select><Input aria-label="Mensualités" type="number" placeholder="Mois" className="w-20" value={h.a} onChange={(e) => setH({ ...h, a: e.target.value })} /></>}
        <Button variant="outline" onClick={addHyp}>Ajouter l'hypothèse</Button></div>
      {canWrite && <div className="flex gap-2"><Button disabled={!cur.name.trim()} onClick={() => save()}>Enregistrer</Button>{cur.id && <Button variant="outline" onClick={() => save(true)}>Dupliquer</Button>}</div>}
    </div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Scénario</th><th className="p-2 text-right">Solde fin</th><th className="p-2 text-right">Point bas</th><th className="p-2 text-right">Premier manque</th><th className="p-2 text-right">Nécessaire</th></tr></thead>
      <tbody>{row("Réel (sans hypothèse)", base)}{cur.hyps.length > 0 && row(cur.name || "Scénario en cours", sim)}
        {list.filter((s) => cmp.includes(s.id) && s.id !== cur.id).map((s) => <Fragment key={s.id}>{row(s.name, run(data, from, to, threshold, T.applyScenario(data.moves, s.hypotheses as T.Hypothesis[])))}</Fragment>)}</tbody></table></div>
  </div>;
}
