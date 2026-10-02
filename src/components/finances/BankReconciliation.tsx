// FIN-13A — Rapprochement bancaire : import CSV d'un relevé (observations) et rapprochement confirmé par une personne autorisée.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import * as B from "@/lib/finances/bank";
import { accounts as loadAccounts } from "@/lib/finances/treasuryApi";
import { openFile } from "@/lib/finances/purchases";
import { fmtDate, fmtMoney } from "@/lib/finances/period";

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
type Saved = { account: string; fileName: string; text: string; map: B.BField[]; s: B.Settings; opening: string; closing: string; complete: boolean; decisions: Record<string, "add" | "skip">; key: string | null; fileId: string | null; sha: string | null };
const dl = (name: string, text: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); };
const sens = (n: number | null) => (n == null ? "—" : n > 0 ? "Entrée" : "Sortie");
const OUT: Record<string, string> = { nouveau: "Nouvelle", deja_present: "Déjà présente", a_examiner: "À examiner", refuse: "Refusée" };
const RES: Record<string, string> = { ajoutee: "Ajoutée", ajoutee_distincte: "Ajoutée (distincte confirmée)", deja_presente: "Déjà présente", doublon_confirme: "Doublon confirmé (non ajoutée)", a_examiner: "À examiner (non ajoutée)", refusee: "Refusée" };
const pnum = (s: string) => { const t = s.replace(/[\s\u00a0$]/g, "").replace(",", "."); return t === "" ? null : /^-?\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN; };

export default function BankReconciliation({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const [accs, setAccs] = useState<{ id: string; name: string; currency: string }[] | null>(null);
  const [account, setAccount] = useState<string>(() => sessionStorage.getItem(`fin13a.acc.${companyId}`) ?? "");
  const [mode, setMode] = useState<"control" | "import">("control");
  const [ov, setOv] = useState<B.Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => { loadAccounts(companyId).then((a: any[]) => setAccs(a.map((x) => ({ id: x.id, name: x.name, currency: x.currency ?? "CAD" })))).catch((e) => setErr(e.message)); }, [companyId]);
  useEffect(() => { if (account) sessionStorage.setItem(`fin13a.acc.${companyId}`, account); }, [account, companyId]);
  useEffect(() => { if (!account) return; setOv(null); setErr(null); B.overview(companyId, account).then(setOv).catch((e) => setErr(e.message)); }, [companyId, account, rev]);
  const reload = useCallback(() => setRev((r) => r + 1), []);
  return <div className="space-y-4">
    <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">Le relevé importé est une <strong>observation</strong> : il ne crée ni facture, ni règlement, ni revenu, ni dépense, et ne s'ajoute pas à la trésorerie. Un rapprochement relie une ligne du relevé à des mouvements déjà enregistrés, sans les modifier. Données TEST seulement, dollars canadiens seulement.</div>
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[220px] flex-1 text-sm">Compte financier
        <select aria-label="Compte financier" className={sel} value={account} onChange={(e) => setAccount(e.target.value)}><option value="">— Choisir un compte —</option>{accs?.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</select></label>
      {account && canWrite && <Button variant={mode === "import" ? "default" : "outline"} onClick={() => setMode(mode === "import" ? "control" : "import")}>{mode === "import" ? "Retour au contrôle" : "Importer un relevé CSV"}</Button>}
      <Button variant="outline" onClick={() => dl("modele-releve-bancaire-FICTIF.csv", B.TEMPLATE)}>Modèle fictif (CSV)</Button>
    </div>
    {err && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
    {!account ? <p className="text-sm text-muted-foreground">Choisissez le compte financier du relevé.</p>
      : mode === "import" ? <ImportFlow companyId={companyId} account={account} onDone={() => { reload(); }} onClose={() => { setMode("control"); reload(); }} />
      : ov ? <Control companyId={companyId} ov={ov} canWrite={canWrite} reload={reload} /> : !err && <p className="text-sm text-muted-foreground">Chargement…</p>}
  </div>;
}

function ImportFlow({ companyId, account, onDone, onClose }: { companyId: string; account: string; onDone: () => void; onClose: () => void }) {
  const store = `fin13a.imp.${companyId}.${account}`;
  const [s, setS] = useState<Saved | null>(() => { try { return JSON.parse(sessionStorage.getItem(store) ?? "null"); } catch { return null; } });
  const [ev, setEv] = useState<B.Eval[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<B.Summary | null>(null);
  useEffect(() => { if (s) sessionStorage.setItem(store, JSON.stringify(s)); else sessionStorage.removeItem(store); }, [s, store]);
  const up = (p: Partial<Saved>) => { setS((x) => (x ? { ...x, ...p, ...(p.key === undefined && !("decisions" in p) && !("opening" in p) && !("closing" in p) && !("complete" in p) ? {} : {}) } : x)); setEv(null); };
  const parsed = useMemo(() => (s ? B.parseCsv(s.text) : null), [s?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const headers = parsed?.rows[0] ?? [];
  const rows = useMemo(() => (s && parsed ? B.buildRows(parsed.rows, s.map) : []), [s, parsed]);
  const problem = s ? B.settingsProblem(s.map, s.s) : null;
  const open = s?.opening ? pnum(s.opening) : null; const close = s?.closing ? pnum(s.closing) : null;
  const balProblem = (open !== null && Number.isNaN(open)) || (close !== null && Number.isNaN(close)) ? "Solde illisible (ex. 1234,56)." : (open === null) !== (close === null) ? "Saisissez les deux soldes ou aucun." : null;

  const pick = async (f: File | undefined) => {
    if (!f) return; setRes(null); setError(null);
    if (f.size > 2 * 1024 * 1024) { setError("Fichier trop lourd (2 Mo au maximum)."); return; }
    const text = await f.text(); const p = B.parseCsv(text);
    if (p.rows.length < 2) { setError("Le fichier ne contient aucune ligne."); return; }
    setS({ account, fileName: f.name, text, map: B.autoMapBank(p.rows[0]), s: { date_fmt: null, num_fmt: null, mode: null, sign: null }, opening: "", closing: "", complete: false, decisions: {}, key: null, fileId: null, sha: null });
    setEv(null);
  };
  const doPreview = async () => {
    if (!s || problem) return; setBusy(true); setError(null);
    try { setEv(await B.preview(companyId, account, rows, s.s)); } catch (e: any) { setError(`${e.message} — votre saisie est conservée.`); } finally { setBusy(false); }
  };
  const doCommit = async () => {
    if (!s || !ev || busy) return; setBusy(true); setError(null);
    const key = s.key ?? crypto.randomUUID(); let fileId = s.fileId; let sha = s.sha;
    setS({ ...s, key });
    try {
      if (!fileId || !sha) { const f = await B.uploadStatement(companyId, new File([s.text], s.fileName, { type: "text/csv" })); fileId = f.id; sha = f.sha; setS((x) => (x ? { ...x, key, fileId, sha } : x)); }
      const r = await B.commit({ company: companyId, account, rows, settings: s.s, fileName: s.fileName, sha: sha!, fileId, key, decisions: s.decisions, opening: open as number | null, closing: close as number | null, complete: s.complete });
      setRes(r); setS(null); setEv(null); onDone();
    } catch (e: any) { setError(`${e.message} — la correspondance, vos choix et le fichier sont conservés; « Valider » reprend la même demande sans rien recréer.`); } finally { setBusy(false); }
  };
  const tin = ev?.filter((e) => e.outcome !== "refuse" && (e.amount ?? 0) > 0).reduce((a, e) => a + (e.amount ?? 0), 0) ?? 0;
  const tout = ev?.filter((e) => e.outcome !== "refuse" && (e.amount ?? 0) < 0).reduce((a, e) => a - (e.amount ?? 0), 0) ?? 0;
  const undecided = ev?.filter((e) => e.outcome === "a_examiner" && !s?.decisions[e.row_no]).length ?? 0;

  if (res) return <section className="space-y-3 rounded-md border border-border p-3" aria-label="Bilan de l'import">
    <h3 className="font-display font-semibold">Bilan de l'import{res.replay ? " (demande déjà traitée — aucun ajout)" : ""}</h3>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Ajoutées", res.ajoutees], ["Déjà présentes", res.deja_presentes], ["À examiner", res.a_examiner], ["Refusées", res.refusees]].map(([l, n]) => <div key={l as string} className="rounded-md bg-secondary p-2 text-sm"><div className="text-xs text-muted-foreground">{l}</div><strong className="text-lg">{n as number}</strong></div>)}</div>
    {res.balance && <p className={`text-sm ${res.balance.ok ? "" : "text-destructive"}`}>Contrôle des soldes : ouverture {fmtMoney(res.balance.opening)} + entrées {fmtMoney(res.balance.in)} − sorties {fmtMoney(res.balance.out)} = {fmtMoney(res.balance.expected)} ; clôture du relevé {fmtMoney(res.balance.closing)} → {res.balance.ok ? "concordant" : `écart ${fmtMoney(res.balance.diff)}`}</p>}
    <ul className="max-h-80 space-y-1 overflow-auto text-xs">{res.rows.map((r) => <li key={r.row_no} className="flex flex-wrap gap-x-2 border-b border-border py-1"><span>Ligne {r.row_no}</span><strong>{RES[r.result] ?? r.result}</strong>{r.amount != null && <span>{sens(r.amount)} {fmtMoney(Math.abs(r.amount))}</span>}<span className="text-muted-foreground">{r.description}</span>{r.reason && <span className="w-full text-muted-foreground">{r.reason}</span>}</li>)}</ul>
    <Button onClick={onClose}>Voir les transactions à rapprocher</Button>
  </section>;

  return <section className="space-y-3 rounded-md border border-border p-3" aria-label="Importer un relevé">
    <h3 className="font-display font-semibold">Importer un relevé CSV</h3>
    <input aria-label="Fichier CSV du relevé" type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} className="block w-full text-sm" />
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
    {s && <>
      <p className="text-xs text-muted-foreground">Fichier : {s.fileName} · {rows.length} ligne(s){s.key ? " · demande en cours conservée" : ""}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{headers.map((h, i) => <label key={i} className="text-xs">Colonne « {h || `col${i + 1}`} » <span className="text-muted-foreground">(ex. {parsed?.rows[1]?.[i] ?? ""})</span>
        <select aria-label={`Correspondance ${h}`} className={sel} value={s.map[i] ?? ""} onChange={(e) => { const m = [...s.map]; m[i] = e.target.value as B.BField; up({ map: m }); }}>{B.BFIELDS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}</select></label>)}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">Montants<select aria-label="Type de montant" className={sel} value={s.s.mode ?? ""} onChange={(e) => up({ s: { ...s.s, mode: (e.target.value || null) as any } })}><option value="">— Choisir —</option><option value="signed">Une colonne de montant signé</option><option value="split">Deux colonnes débit / crédit</option></select></label>
        {s.s.mode === "signed" && <label className="text-xs">Sens du montant signé<select aria-label="Sens du montant" className={sel} value={s.s.sign ?? ""} onChange={(e) => up({ s: { ...s.s, sign: (e.target.value || null) as any } })}><option value="">— Choisir —</option><option value="positive_in">Positif = entrée d'argent</option><option value="positive_out">Positif = sortie d'argent</option></select></label>}
        <label className="text-xs">Format des dates<select aria-label="Format des dates" className={sel} value={s.s.date_fmt ?? ""} onChange={(e) => up({ s: { ...s.s, date_fmt: (e.target.value || null) as any } })}><option value="">— Choisir —</option><option value="iso">AAAA-MM-JJ</option><option value="dmy">JJ/MM/AAAA</option><option value="mdy">MM/JJ/AAAA</option></select></label>
        <label className="text-xs">Format des nombres<select aria-label="Format des nombres" className={sel} value={s.s.num_fmt ?? ""} onChange={(e) => up({ s: { ...s.s, num_fmt: (e.target.value || null) as any } })}><option value="">— Choisir —</option><option value="fr">1 234,56</option><option value="en">1,234.56</option></select></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">Solde d'ouverture du relevé (facultatif)<Input inputMode="decimal" value={s.opening} onChange={(e) => up({ opening: e.target.value })} /></label>
        <label className="text-xs">Solde de clôture du relevé (facultatif)<Input inputMode="decimal" value={s.closing} onChange={(e) => up({ closing: e.target.value })} /></label>
        <label className="flex items-center gap-2 pt-4 text-xs"><input type="checkbox" checked={s.complete} onChange={(e) => up({ complete: e.target.checked })} /> Relevé complet pour la période</label>
      </div>
      {(problem || balProblem) && <p className="text-sm text-amber-700 dark:text-amber-400">{problem ?? balProblem}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!!problem || !!balProblem || busy} onClick={doPreview}>{busy && !ev ? "Vérification…" : "Aperçu (rien n'est créé)"}</Button><Button variant="outline" onClick={() => { setS(null); setEv(null); }}>Abandonner ce fichier</Button></div>
      {ev && <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
          <div className="rounded-md bg-secondary p-2"><div className="text-xs text-muted-foreground">Entrées (crédits)</div><strong>{fmtMoney(tin)}</strong></div>
          <div className="rounded-md bg-secondary p-2"><div className="text-xs text-muted-foreground">Sorties (débits)</div><strong>{fmtMoney(tout)}</strong></div>
          {(["nouveau", "deja_present", "a_examiner", "refuse"] as const).map((o) => <div key={o} className="rounded-md bg-secondary p-2"><div className="text-xs text-muted-foreground">{OUT[o]}</div><strong>{ev.filter((e) => e.outcome === o).length}</strong></div>)}
        </div>
        {open != null && close != null && !Number.isNaN(open) && !Number.isNaN(close) && <p className="text-sm">Contrôle : {fmtMoney(open)} + {fmtMoney(tin)} − {fmtMoney(tout)} = {fmtMoney(Math.round((open + tin - tout) * 100) / 100)} ; clôture saisie {fmtMoney(close)} {Math.round((open + tin - tout) * 100) === Math.round(close * 100) ? "→ concordant" : "→ écart"}</p>}
        <ul className="max-h-[28rem] space-y-1 overflow-auto">{ev.map((e) => <li key={e.row_no} className={`rounded-md border p-2 text-sm ${e.outcome === "refuse" ? "border-destructive/50" : e.outcome === "a_examiner" ? "border-amber-500/60" : "border-border"}`}>
          <div className="flex flex-wrap items-baseline gap-x-3"><span className="text-xs text-muted-foreground">Ligne {e.row_no}</span><strong>{OUT[e.outcome]}</strong>{e.date && <span>{fmtDate(e.date)}</span>}<span className={e.amount != null && e.amount > 0 ? "text-primary" : ""}>{sens(e.amount)} {e.amount != null ? fmtMoney(Math.abs(e.amount)) : ""}</span><span className="break-all">{e.description}</span>{e.reference && <span className="text-xs">Réf. {e.reference}</span>}</div>
          {e.reason && <p className="text-xs text-muted-foreground">{e.reason}</p>}
          {e.outcome === "a_examiner" && <div className="mt-1 space-y-1">
            {e.existing.map((x: any) => <p key={x.id} className="text-xs">Déjà au compte : {fmtDate(x.date)} · {fmtMoney(Math.abs(x.amount))} · {x.description}</p>)}
            <div className="flex flex-wrap gap-2"><Button size="sm" variant={s.decisions[e.row_no] === "add" ? "default" : "outline"} onClick={() => setS({ ...s, decisions: { ...s.decisions, [e.row_no]: "add" } })}>Transaction distincte : ajouter</Button><Button size="sm" variant={s.decisions[e.row_no] === "skip" ? "default" : "outline"} onClick={() => setS({ ...s, decisions: { ...s.decisions, [e.row_no]: "skip" } })}>Même transaction : ne pas ajouter</Button></div></div>}
        </li>)}</ul>
        {undecided > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{undecided} ligne(s) à examiner sans décision ne seront pas ajoutées (elles figureront au bilan « À examiner »).</p>}
        <Button disabled={busy} onClick={doCommit}>{busy ? "Validation…" : "Valider l'import"}</Button>
      </div>}
    </>}
  </section>;
}

function Control({ companyId, ov, canWrite, reload }: { companyId: string; ov: B.Overview; canWrite: boolean; reload: () => void }) {
  const [f, setF] = useState<string>(""); const [q, setQ] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const t = ov.totals;
  const lines = ov.lines.filter((l) => (!f || B.displayStatus(l) === f) && (!q || `${l.description ?? ""} ${l.reference ?? ""} ${Math.abs(l.amount)} ${l.date}`.toLowerCase().includes(q.toLowerCase())));
  const card = (l: string, v: string, sub?: string) => <div className="rounded-md bg-secondary p-2"><div className="text-xs text-muted-foreground">{l}</div><strong>{v}</strong>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>;
  return <div className="space-y-4">
    <section aria-label="Totaux" className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
      {card("Relevé importé", `+${fmtMoney(t.in)} / −${fmtMoney(t.out)}`, `${t.count} transaction(s), exclues comprises`)}
      {card("Rapproché", `+${fmtMoney(t.matched_in)} / −${fmtMoney(t.matched_out)}`, `${t.matched_count} transaction(s)`)}
      {card("Reste à examiner", `+${fmtMoney(t.open_in)} / −${fmtMoney(t.open_out)}`, `${t.open_count} transaction(s), dont ${t.review_count} « À examiner »`)}
      {card("Mouvements internes non rapprochés", `+${fmtMoney(ov.internal.in)} / −${fmtMoney(ov.internal.out)}`, `${ov.internal.count} sur la période du relevé`)}
    </section>
    <p className={`text-sm ${ov.fully_reconciled ? "text-primary" : "text-muted-foreground"}`}>{ov.fully_reconciled ? "Compte entièrement concilié pour les relevés importés (relevés complets, soldes concordants, aucune transaction ouverte)." : "Compte non présenté comme entièrement concilié : relevé incomplet, soldes non fournis ou non concordants, ou transactions encore ouvertes."}{t.excluded_count > 0 && ` ${t.excluded_count} transaction(s) exclue(s) restent dans les totaux du relevé.`}</p>
    <p className="text-xs text-muted-foreground">Ces totaux décrivent le relevé : ils ne s'additionnent jamais aux mouvements de la trésorerie, qui restent la seule source des flux d'argent.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Filtre statut" className={`${sel} w-auto`} value={f} onChange={(e) => setF(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(B.STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <Input aria-label="Rechercher dans le relevé" placeholder="Rechercher libellé, référence, montant…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
    </div>
    <ul className="space-y-2">{lines.map((l) => <li key={l.id} className="rounded-md border border-border">
      <button className="flex w-full flex-wrap items-baseline gap-x-3 p-2 text-left text-sm" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
        <span>{fmtDate(l.date)}</span><strong className={l.amount > 0 ? "text-primary" : ""}>{l.amount > 0 ? "Entrée" : "Sortie"} {fmtMoney(Math.abs(l.amount))}</strong>
        <span className="min-w-0 flex-1 break-words">{l.description}{l.reference ? ` · Réf. ${l.reference}` : ""}</span>
        <span className="rounded bg-secondary px-2 py-0.5 text-xs">{B.STATUS_LABEL[B.displayStatus(l)]}</span>
        {l.twins > 1 && <span className="w-full text-xs text-muted-foreground">{l.twins} transactions identiques conservées séparément dans ce compte</span>}
      </button>
      {open === l.id && <LineDetail companyId={companyId} l={l} canWrite={canWrite} reload={reload} />}
    </li>)}{!lines.length && <li className="text-sm text-muted-foreground">Aucune transaction.</li>}</ul>
    <section aria-label="Mouvements internes non rapprochés" className="space-y-1">
      <h3 className="font-display font-semibold">Mouvements internes non rapprochés (période du relevé)</h3>
      <ul className="space-y-1 text-sm">{ov.internal.rows.map((m) => <li key={`${m.kind}:${m.id}`} className="flex flex-wrap gap-x-3 border-b border-border py-1"><span>{fmtDate(m.date)}</span><strong>{m.dir === "in" ? "Entrée" : "Sortie"} {fmtMoney(m.amount)}</strong><span>{m.label}{m.party ? ` — ${m.party}` : ""}</span>{m.reference && <span className="text-xs">Réf. {m.reference}</span>}<a className="text-xs underline" href={`?tab=${B.KIND_LINK[m.kind]}&company=${companyId}`}>Voir</a></li>)}{!ov.internal.rows.length && <li className="text-muted-foreground">Aucun.</li>}</ul>
    </section>
    <section aria-label="Relevés importés" className="space-y-1">
      <h3 className="font-display font-semibold">Relevés importés</h3>
      <ul className="space-y-1 text-sm">{ov.imports.map((i) => <li key={i.id} className="border-b border-border py-1">
        <div className="flex flex-wrap gap-x-3"><strong className="break-all">{i.file_name}</strong><span>{i.period_from ? `${fmtDate(i.period_from)} → ${fmtDate(i.period_to)}` : "aucune ligne valide"}</span><span className="text-xs text-muted-foreground">importé le {new Date(i.at).toLocaleString("fr-CA")}</span>
          {i.file_id && <button className="text-xs underline" onClick={async () => { try { window.open(await openFile(i.file_id, true), "_blank"); } catch (e: any) { toast({ title: e.message, variant: "destructive" }); } }}>Télécharger l'original</button>}</div>
        <div className="text-xs text-muted-foreground">Ajoutées {i.summary?.ajoutees ?? 0} · déjà présentes {i.summary?.deja_presentes ?? 0} · à examiner {i.summary?.a_examiner ?? 0} · refusées {i.summary?.refusees ?? 0}{i.balance ? ` · soldes ${i.balance.ok ? "concordants" : `écart ${fmtMoney(i.balance.diff)}`}` : " · soldes non fournis"}{i.complete ? " · relevé complet" : " · relevé non déclaré complet"}</div>
      </li>)}</ul>
    </section>
  </div>;
}

function LineDetail({ companyId, l, canWrite, reload }: { companyId: string; l: B.Line; canWrite: boolean; reload: () => void }) {
  const [cands, setCands] = useState<B.Cand[] | null>(null); const [q, setQ] = useState(""); const [days, setDays] = useState(10);
  const [picked, setPicked] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const [reason, setReason] = useState(() => sessionStorage.getItem(`fin13a.reason.${l.id}`) ?? "");
  useEffect(() => { sessionStorage.setItem(`fin13a.reason.${l.id}`, reason); }, [reason, l.id]);
  const keyStore = `fin13a.mkey.${l.id}`;
  const load = useCallback(() => { if (l.status === "rapproche") return; B.candidates(l.id, q, days).then(setCands).catch((e) => setMsg(e.message)); }, [l.id, l.status, q, days]);
  useEffect(() => { load(); }, [load]);
  const sum = (cands ?? []).filter((c) => picked.includes(`${c.kind}:${c.id}`)).reduce((a, c) => a + Math.round(c.amount * 100), 0) / 100;
  const target = Math.abs(l.amount); const diff = Math.round((target - sum) * 100) / 100;
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(null); try { await fn(); toast({ title: ok }); sessionStorage.removeItem(keyStore); sessionStorage.removeItem(`fin13a.reason.${l.id}`); reload(); } catch (e: any) { setMsg(`${e.message} — votre sélection et votre motif sont conservés.`); } finally { setBusy(false); } };
  const confirm = () => { const key = sessionStorage.getItem(keyStore) ?? crypto.randomUUID(); sessionStorage.setItem(keyStore, key);
    act(() => B.match(l.id, picked.map((p) => { const [kind, id] = p.split(":"); return { kind, id }; }), key), "Rapprochement confirmé"); };
  return <div className="space-y-3 border-t border-border p-2 text-sm">
    {l.reason && <p className="text-xs">Motif : {l.reason}</p>}
    {msg && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{msg}</p>}
    {l.match ? <div className="space-y-1">
      <p className="font-semibold">Rapproché avec :</p>
      <ul className="text-xs">{l.match.items.map((i) => <li key={i.id}>{i.date ? fmtDate(i.date) : ""} · {fmtMoney(i.amount)} · {i.label} <a className="underline" href={`?tab=${B.KIND_LINK[i.kind]}&company=${companyId}`}>Voir</a></li>)}</ul>
      {canWrite && <div className="flex flex-wrap gap-2"><Input aria-label="Motif d'annulation" placeholder="Motif d'annulation (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm" /><Button size="sm" variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => act(() => B.unmatch(l.match!.id, reason), "Rapprochement annulé (le mouvement d'origine est conservé)")}>Annuler le rapprochement</Button></div>}
    </div> : <>
      <div className="flex flex-wrap gap-2"><Input aria-label="Rechercher un mouvement" placeholder="Rechercher un mouvement…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select aria-label="Fenêtre de dates" className={`${sel} w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={10}>± 10 jours</option><option value={30}>± 30 jours</option><option value={90}>± 90 jours</option></select></div>
      <p className="text-xs text-muted-foreground">Mouvements réalisés seulement (règlements, encaissements, remboursements reçus, avances, restitutions). Les échéances, factures impayées et affectations internes de crédit ne sont jamais proposées.</p>
      <ul className="space-y-1">{cands?.map((c) => { const k = `${c.kind}:${c.id}`; return <li key={k} className={`rounded-md border p-2 ${c.exact ? "border-primary/60" : "border-border"}`}>
        <label className="flex items-start gap-2"><input type="checkbox" disabled={!canWrite} checked={picked.includes(k)} onChange={(e) => setPicked(e.target.checked ? [...picked, k] : picked.filter((x) => x !== k))} className="mt-1" />
          <span className="min-w-0 flex-1"><strong>{fmtMoney(c.amount)}</strong> · {fmtDate(c.date)} · {c.label}{c.party ? ` — ${c.party}` : ""}{c.reference ? ` · Réf. ${c.reference}` : ""}
            <span className="block text-xs text-muted-foreground">{c.exact ? "Suggestion : " : ""}{c.reasons?.join(" · ")}</span></span></label>
        <a className="text-xs underline" href={`?tab=${B.KIND_LINK[c.kind]}&company=${companyId}`}>Voir l'élément</a></li>; })}
        {cands && !cands.length && <li className="text-xs text-muted-foreground">Aucun mouvement compatible non rapproché. Élargissez la fenêtre ou laissez la transaction « À examiner ».</li>}</ul>
      {canWrite && <>
        <p className={`text-xs ${picked.length && diff !== 0 ? "text-destructive" : ""}`}>Sélection : {fmtMoney(sum)} sur {fmtMoney(target)}{picked.length ? (diff === 0 ? " — correspondance exacte" : ` — écart ${fmtMoney(diff)} (aucun écart n'est absorbé : rapprochement impossible)`) : ""}</p>
        <Button size="sm" disabled={busy || !picked.length || diff !== 0} onClick={confirm}>Confirmer le rapprochement</Button>
        <div className="flex flex-wrap gap-2 border-t border-border pt-2"><Input aria-label="Motif" placeholder="Motif (obligatoire pour À examiner / Exclure)" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm" />
          {l.status !== "a_examiner" && <Button size="sm" variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => act(() => B.setStatus(l.id, "a_examiner", reason, l.rev), "Transaction à examiner")}>À examiner</Button>}
          {l.status !== "exclu" && <Button size="sm" variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => act(() => B.setStatus(l.id, "exclu", reason, l.rev), "Transaction exclue (conservée dans le relevé)")}>Exclure</Button>}
          {l.status !== "a_rapprocher" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => B.setStatus(l.id, "a_rapprocher", reason, l.rev), "Transaction remise à rapprocher")}>Remettre à rapprocher</Button>}</div>
      </>}
    </>}
    <details className="text-xs"><summary>Ligne source et historique</summary>
      <p className="break-all">Ligne {l.row_no} : {Object.entries(l.raw).map(([k, v]) => `${k} = ${v}`).join(" · ")}</p>
      <ul>{(l.history ?? []).map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("fr-CA")} · {({ match: "Rapprochement", unmatch: "Rapprochement annulé", status: "Statut modifié" } as Record<string, string>)[h.kind] ?? h.kind}{h.detail?.reason ? ` — ${h.detail.reason}` : ""}</li>)}</ul></details>
  </div>;
}
