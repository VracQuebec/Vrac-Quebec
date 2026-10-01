// FIN-10 — comptes clients : liste filtrée/paginée, fiche, état de compte, portail, relance (simulation).
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { todayIn } from "@/lib/finances/period";
import { makeGuard } from "@/lib/finances/recurring";
import * as AR from "@/lib/finances/accounts";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const PAGE = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Part du solde sans échéance connue : solde − (non échu + échu + retards + retenues futures), valeurs serveur seulement. */
function unk(t: Partial<AR.Sums>): number | null {
  const ks = ["rest", "not_due", "due_today", "b1_30", "b31_60", "b61_90", "b90", "future_ret"] as const;
  if (ks.some((k) => t[k] == null || !Number.isFinite(Number(t[k])))) return null;
  const v = Number(t.rest) - ks.slice(1).reduce((a, k) => a + Number(t[k]), 0);
  return Math.round(v * 100) / 100;
}
function SumsGrid({ t }: { t: Partial<AR.Sums> }) {
  const cell = (l: string, v: unknown, strong = false) => <div className="rounded border border-border p-2"><p className="text-xs text-muted-foreground">{l}</p><p className={strong ? "font-semibold" : ""}>{AR.money(v)}</p></div>;
  return <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
    {cell("Solde restant", t.rest, true)}{cell("Exigible maintenant", t.due_now, true)}{cell("dont en retard", t.overdue)}{cell("Retenues à échéance future", t.future_ret)}
    {AR.BUCKETS.map(([k, l]) => <div key={k}>{cell(l, t[k])}</div>)}
    {unk(t) != null && unk(t)! > 0 && <div className="rounded border border-destructive p-2" data-testid="ar-unknown-due"><p className="text-xs text-muted-foreground">Échéance inconnue — ventilation indéterminée (inclus dans le solde)</p><p>{AR.money(unk(t))}</p></div>}{cell("Crédits / versements non affectés (séparés)", t.unallocated)}
  </div>;
}

export default function ClientAccounts({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const [on, setOn] = useState(() => todayIn()); const [q, setQ] = useState(""); const [filter, setFilter] = useState<AR.Filter>("all"); const [page, setPage] = useState(0);
  const [data, setData] = useState<AR.Accounts | null>(null); const [err, setErr] = useState<string | null>(null); const [open, setOpen] = useState<AR.AccountRow | null>(null);
  const guard = useRef(makeGuard()).current;
  useEffect(() => () => guard.bump(), [guard]);
  useEffect(() => {
    if (!DATE_RE.test(on)) return;
    const ok = guard.take(); setErr(null);
    const t = setTimeout(() => { AR.accounts(companyId, on, q, filter, PAGE, page * PAGE).then((d) => { if (ok()) setData(d); }, (e) => { if (ok()) { setData(null); setErr(e.message); } }); }, 250);
    return () => { clearTimeout(t); guard.bump(); };
  }, [companyId, on, q, filter, page, guard]);
  if (open) return <ClientFile companyId={companyId} canWrite={canWrite} row={open} on={on} filters={`recherche « ${q || "—"} », filtre ${AR.FILTERS.find(([v]) => v === filter)?.[1]}`} onBack={() => setOpen(null)} />;
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1;
  return <div className="space-y-3" data-testid="ar-list">
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Recherche (client ou n° de facture)<Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Nom ou F-00001" className="w-56" /></label>
      <label className="text-xs">Date de référence<Input type="date" value={on} onChange={(e) => { setOn(e.target.value); setPage(0); }} className="w-40" /></label>
      <div className="flex flex-wrap gap-1">{AR.FILTERS.map(([v, l]) => <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} onClick={() => { setFilter(v); setPage(0); }}>{l}</Button>)}</div>
    </div>
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    {data && <>
      <p className="text-xs text-muted-foreground">Totaux sur les {data.count} client(s) filtré(s), pas seulement la page affichée — au {data.on}, en {data.currency}.{data.totals.partial && <strong className="text-destructive"> Total partiel : certaines factures ont une donnée manquante (filtre « Données incomplètes »).</strong>}</p>
      <SumsGrid t={data.totals} />
      <ul className="divide-y divide-border rounded border border-border">
        {data.rows.map((r) => <li key={r.client_key}><button className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(r)}>
          <span className="font-medium">{r.client_name}{!r.client_id && <span className="ml-1 text-xs text-muted-foreground">(non rattaché au CRM)</span>}{r.partial && <span className="ml-1 text-xs text-destructive">· données incomplètes</span>}</span>
          <span className="text-sm">solde {AR.money(r.rest)} · exigible {AR.money(r.due_now)} · retard {AR.money(r.overdue)}{r.unallocated > 0 && ` · crédit ${AR.money(r.unallocated)}`}</span>
        </button></li>)}
        {!data.rows.length && <li className="p-3 text-sm text-muted-foreground">Aucun compte client pour ces critères.</li>}
      </ul>
      <div className="flex items-center gap-2 text-sm"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button><span>Page {page + 1} / {pages}</span><Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Suivant</Button></div>
    </>}
    {!data && !err && <p className="text-sm text-muted-foreground">Chargement…</p>}
  </div>;
}

function ClientFile({ companyId, canWrite, row, on, filters, onBack }: { companyId: string; canWrite: boolean; row: AR.AccountRow; on: string; filters: string; onBack: () => void }) {
  const [st, setSt] = useState<J | null>(null); const [err, setErr] = useState<string | null>(null); const [col, setCol] = useState<J | null>(null); const [n, setN] = useState(0);
  const guard = useRef(makeGuard()).current;
  useEffect(() => { const ok = guard.take(); setSt(null); setCol(null); AR.statement(companyId, row.client_key, on).then((d) => ok() && setSt(d), (e) => ok() && setErr(e.message)); return () => guard.bump(); }, [companyId, row.client_key, on, n, guard]);
  const preview = () => { const ok = guard.take(); AR.collectPreview(companyId, row.client_key, on).then((d) => ok() && setCol(d), (e) => ok() && toast({ title: "Refusé", description: e.message, variant: "destructive" })); };
  const pdf = (save: boolean) => { const d = AR.statementPdf(st, filters); save ? d.save(`etat-de-compte-${st.on}.pdf`) : window.open(URL.createObjectURL(d.output("blob")), "_blank"); };
  return <div className="space-y-3" data-testid="ar-file">
    <div className="flex flex-wrap items-center justify-between gap-2"><Button size="sm" variant="ghost" onClick={onBack}>← Comptes clients</Button><h3 className="font-display font-bold">{row.client_name}</h3></div>
    {err && <p role="alert" className="text-destructive">{err}</p>}
    {!st && !err && <p className="text-sm text-muted-foreground">Chargement…</p>}
    {st && <>
      <p className="text-xs text-muted-foreground">Solde actuel au {st.on} (CAD) — pas un solde historique : un état à une date passée ne peut pas être reconstruit avec l'historique disponible.{st.totals.partial && <strong className="text-destructive"> Total partiel.</strong>}</p>
      <SumsGrid t={st.totals} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => pdf(false)}>Aperçu de l'état de compte (PDF)</Button>
        <Button size="sm" variant="outline" onClick={() => pdf(true)}>Télécharger le PDF</Button>
        <Button size="sm" variant="outline" onClick={() => AR.statementCsv(st, filters)}>Exporter CSV</Button>
        <Button size="sm" onClick={preview}>Préparer une relance (simulation)</Button>
      </div>
      <section><h4 className="font-semibold">Factures</h4><ul className="divide-y divide-border text-sm">{st.invoices.map((l: J) => <li key={l.invoice_id} className="py-2">
        <a className="font-medium underline" href={`?tab=factures&facture=${l.invoice_id}`}>{l.number}</a>{l.is_test && " (TEST)"} · émise {l.issue_date} · échéance {l.due_date ?? "non disponible"} · total {AR.money(l.total)} · avoirs {AR.money(l.credits)} · encaissé {AR.money(l.collected)} · <strong>solde {AR.money(l.rest)}</strong>
        {Number(l.future_ret) > 0 && <> · retenue à échéance future {AR.money(l.future_ret)}</>}{(l.unknown ?? []).length > 0 && <span className="text-destructive"> · donnée manquante : {l.unknown.join(" ; ")}</span>}
      </li>)}{!st.invoices.length && <li className="py-2 text-muted-foreground">Aucune facture émise.</li>}</ul></section>
      <section><h4 className="font-semibold">Règlements</h4><ul className="text-sm">{st.receipts.map((r: J) => <li key={r.id}>{r.received_on} · {r.invoice_number} · {AR.money(r.amount)}{r.reference && ` · réf. ${r.reference}`}</li>)}{!st.receipts.length && <li className="text-muted-foreground">Aucun</li>}</ul></section>
      <section><h4 className="font-semibold">Notes de crédit</h4><ul className="text-sm">{st.credits.map((c: J) => <li key={c.id}>{c.number} sur {c.invoice_number} · {AR.money(c.total)}</li>)}{!st.credits.length && <li className="text-muted-foreground">Aucune</li>}</ul></section>
      {col && <section data-testid="ar-collect" className="space-y-1 rounded border border-dashed border-border p-2 text-sm">
        <p className="font-semibold">SIMULATION — aucune relance envoyée ni mise en file, aucun intérêt ni frais ajouté</p>
        {col.manual.map((m: string, k: number) => <p key={k} className="text-destructive">{m}</p>)}
        <p>Montant en retard proposé : {AR.money(col.overdue_total)} au {col.on}</p>
        <ul className="list-disc pl-4">{col.proposals.map((p: J) => <li key={p.invoice_id}>{p.number} · échéance {p.due_date} · restant dû {AR.money(p.rest)} · en retard {AR.money(p.overdue)}{Number(p.future_ret) > 0 && ` (retenue future ${AR.money(p.future_ret)} exclue)`}</li>)}</ul>
        {col.excluded.length > 0 && <><p>Exclues :</p><ul className="list-disc pl-4">{col.excluded.map((e: J, k: number) => <li key={k}>{e.number} — {e.reason}</li>)}</ul></>}
        <p className="text-xs text-muted-foreground">Préférences FIN-06 : {col.preferences.configured ? `canaux ${(col.preferences.channels ?? []).join(", ") || "aucun"}, relance aux ${col.preferences.overdue_every_days ?? "—"} j, heures calmes ${col.preferences.quiet_start ?? "—"}–${col.preferences.quiet_end ?? "—"} h` : "non configurées"} · courriel client {col.preferences.client_email ? "présent" : "absent"} · clé de déduplication {col.dedupe_key}</p>
        <p>{col.can_prepare ? "Relance prête à être préparée manuellement (aucun envoi dans ce lot)." : "Aucune relance proposée."}</p>
      </section>}
      {row.client_id && <Portal companyId={companyId} clientId={row.client_id} canWrite={canWrite} requests={st.requests ?? []} onChanged={() => setN((x) => x + 1)} />}
      {!row.client_id && <p className="text-xs text-muted-foreground">Portail client : disponible seulement pour un client rattaché au CRM.</p>}
    </>}
  </div>;
}

function Portal({ companyId, clientId, canWrite, requests, onChanged }: { companyId: string; clientId: string; canWrite: boolean; requests: J[]; onChanged: () => void }) {
  const [list, setList] = useState<J[] | null>(null); const [email, setEmail] = useState(""); const [exp, setExp] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => AR.portalStaffList(companyId, clientId).then(setList, () => setList([]));
  useEffect(() => { void load(); }, [companyId, clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); await load(); onChanged(); } catch (e) { toast({ title: "Refusé", description: (e as Error).message, variant: "destructive" }); } finally { setBusy(false); } };
  return <section className="space-y-2 rounded border border-border p-2 text-sm" data-testid="ar-portal">
    <h4 className="font-semibold">Portail client privé</h4>
    <p className="text-xs text-muted-foreground">Accès à un compte déjà existant seulement — aucune invitation ni courriel envoyé. Le client voit uniquement ses factures émises, règlements et son état de compte.</p>
    <ul>{(list ?? []).map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2">{a.email} · {a.revoked_at ? `révoqué le ${a.revoked_at.slice(0, 10)}` : a.expires_at ? `expire le ${a.expires_at.slice(0, 10)}` : "sans expiration"}
      {!a.revoked_at && canWrite && <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => AR.portalRevoke(a.id, "Révocation manuelle"))}>Révoquer</Button>}</li>)}
      {list && !list.length && <li className="text-muted-foreground">Aucun accès.</li>}</ul>
    {canWrite && <div className="flex flex-wrap items-end gap-2"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="courriel d'un compte existant" className="w-60" />
      <label className="text-xs">Expiration (facultative)<Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} className="w-40" /></label>
      <Button size="sm" disabled={busy || !email.trim()} onClick={() => act(async () => { await AR.portalGrant(companyId, clientId, email, exp || null); setEmail(""); setExp(""); })}>Donner l'accès</Button></div>}
    <h4 className="font-semibold">Demandes du client</h4>
    <ul className="space-y-1">{requests.map((r) => <li key={r.id}>{AR.KIND[r.kind]} · {r.created_at.slice(0, 10)}{r.reference && ` · réf. ${r.reference}`}{r.amount != null && ` · ${AR.money(r.amount)}`}{r.message && ` · « ${r.message} »`} · <strong>{r.status === "a_verifier" ? "à vérifier" : "traitée"}</strong>
      {r.status === "a_verifier" && canWrite && <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => AR.requestHandle(r.id, "Vérifiée"))}>Marquer traitée</Button>}</li>)}
      {!requests.length && <li className="text-muted-foreground">Aucune demande.</li>}</ul>
    <p className="text-xs text-muted-foreground">Un « J'ai payé » ne crée aucun encaissement : enregistrez le règlement vous-même après vérification.</p>
  </section>;
}
