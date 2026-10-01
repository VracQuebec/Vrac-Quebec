// FIN-09C1 — Finances > Factures > Récurrences. Aperçu en lecture seule, préparation explicite de brouillons,
// correction d'un brouillon, puis émission confirmée (une facture, un numéro, une entrée attendue). Aucun envoi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import TaxSummary from "@/components/finances/TaxSummary";
import { useDraft } from "@/lib/drafts/useDraft";
import { useAuthReady } from "@/hooks/useAuthReady";
import * as api from "@/lib/finances/api";
import * as R from "@/lib/finances/recurring";
import { COLLISION_LABEL, DAYS, FEB29_LABEL, PRESETS, SHIFT_LABEL, SHORT_MONTH_LABEL } from "@/lib/finances/recurrence";
import { fmtDate, todayIn } from "@/lib/finances/period";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const TZ = "America/Toronto";
const addDaysIso = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const msg = (e: unknown) => (e as Error)?.message || "Erreur serveur";

/* ------------------------------------------------------------------ lignes */
function LinesEditor({ lines, onChange, disabled }: { lines: R.RecLine[]; onChange: (l: R.RecLine[]) => void; disabled?: boolean }) {
  const set = (i: number, k: keyof R.RecLine, v: string) => onChange(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return <div className="space-y-2">
    {lines.map((l, i) => <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-6">
      <Input className="col-span-2" aria-label={`Description ligne ${i + 1}`} placeholder="Description" value={l.desc} disabled={disabled} onChange={(e) => set(i, "desc", e.target.value)} />
      <Input aria-label={`Quantité ligne ${i + 1}`} inputMode="decimal" placeholder="Qté" value={l.qty} disabled={disabled} onChange={(e) => set(i, "qty", e.target.value)} />
      <Input aria-label={`Unité ligne ${i + 1}`} placeholder="Unité" value={l.unit} disabled={disabled} onChange={(e) => set(i, "unit", e.target.value)} />
      <Input aria-label={`Prix ligne ${i + 1}`} inputMode="decimal" placeholder="Prix unitaire" value={l.price} disabled={disabled} onChange={(e) => set(i, "price", e.target.value)} />
      <Input aria-label={`Remise % ligne ${i + 1}`} inputMode="decimal" placeholder="Remise %" value={l.disc_pct} disabled={disabled} onChange={(e) => set(i, "disc_pct", e.target.value)} />
      <select className={`${sel} col-span-2`} aria-label={`Traitement fiscal ligne ${i + 1}`} value={l.tax} disabled={disabled} onChange={(e) => set(i, "tax", e.target.value)}>
        <option value="">— traitement fiscal —</option>{Object.entries(R.TAX_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      {lines.length > 1 && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(lines.filter((_, j) => j !== i))}>Retirer</Button>}
    </div>)}
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...lines, { ...R.EMPTY_LINE }])}>Ajouter une ligne</Button>
  </div>;
}

/* --------------------------------------------------------------- calendrier */
function RuleEditor({ f, onChange, disabled }: { f: R.RuleForm; onChange: (f: R.RuleForm) => void; disabled?: boolean }) {
  const set = <K extends keyof R.RuleForm>(k: K, v: R.RuleForm[K]) => onChange({ ...f, [k]: v });
  const freq = f.preset === "schedule" ? "schedule" : f.preset;
  const monthly = ["monthly", "every_2_months", "every_3_months", "every_4_months", "every_6_months"].includes(f.preset) || (f.preset === "custom" && f.unit === "months");
  return <div className="grid gap-2 sm:grid-cols-2">
    <label className="text-sm sm:col-span-2">Fréquence
      <select className={`${sel} w-full`} value={f.preset} disabled={disabled} onChange={(e) => set("preset", e.target.value as R.RuleForm["preset"])}>
        {PRESETS.map((p) => <option key={p.v} value={p.v}>{p.v === "schedule" ? "Dates personnalisées (les lignes du modèle sont reprises)" : p.l}</option>)}
      </select></label>
    {freq === "schedule" ? <label className="text-sm sm:col-span-2">Dates (AAAA-MM-JJ, séparées par des virgules)
      <Textarea value={f.dates} disabled={disabled} onChange={(e) => set("dates", e.target.value)} />
      <span className="text-xs text-muted-foreground">Le calendrier reprend les lignes du modèle à chaque date. Un montant propre à une date se corrige dans le brouillon de cette occurrence; aucun montant d'obligation n'est importé.</span></label>
    : <>
      <label className="text-sm">Date d'ancrage<Input type="date" value={f.anchor} disabled={disabled} onChange={(e) => set("anchor", e.target.value)} /></label>
      {["every_n_days", "every_n_years", "custom"].includes(f.preset) && <label className="text-sm">Intervalle N<Input inputMode="numeric" value={f.n} disabled={disabled} onChange={(e) => set("n", e.target.value)} /></label>}
      {f.preset === "custom" && <label className="text-sm">Unité<select className={`${sel} w-full`} value={f.unit} disabled={disabled} onChange={(e) => set("unit", e.target.value as R.RuleForm["unit"])}><option value="days">jours</option><option value="weeks">semaines</option><option value="months">mois</option></select></label>}
      {monthly && <label className="text-sm">Jour du mois (31 = dernier)<Input inputMode="numeric" value={f.month_day} placeholder="jour de l'ancrage" disabled={disabled} onChange={(e) => set("month_day", e.target.value)} /></label>}
      {f.preset === "twice_monthly" && <>
        <label className="text-sm">Premier jour<Input inputMode="numeric" value={f.month_day} disabled={disabled} onChange={(e) => set("month_day", e.target.value)} /></label>
        <label className="text-sm">Second jour<Input inputMode="numeric" value={f.month_day2} disabled={disabled} onChange={(e) => set("month_day2", e.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Collision<select className={`${sel} w-full`} value={f.collision} disabled={disabled} onChange={(e) => set("collision", e.target.value)}>{Object.entries(COLLISION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </>}
      {(monthly || f.preset === "twice_monthly") && <label className="text-sm sm:col-span-2">Mois courts<select className={`${sel} w-full`} value={f.short_month} disabled={disabled} onChange={(e) => set("short_month", e.target.value)}>{Object.entries(SHORT_MONTH_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
      {f.preset === "weekdays" && <fieldset className="text-sm sm:col-span-2"><legend>Jours</legend><div className="flex flex-wrap gap-2">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" disabled={disabled} checked={f.weekdays.includes(i + 1)} onChange={(e) => set("weekdays", e.target.checked ? [...f.weekdays, i + 1].sort() : f.weekdays.filter((x) => x !== i + 1))} />{d}</label>)}</div></fieldset>}
      {["yearly", "every_n_years"].includes(f.preset) && f.anchor.slice(5) === "02-29" && <label className="text-sm sm:col-span-2">29 février<select className={`${sel} w-full`} value={f.feb29} disabled={disabled} onChange={(e) => set("feb29", e.target.value)}>{Object.entries(FEB29_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
      {f.preset !== "once" && <>
        <label className="text-sm">Fin (incluse, facultative)<Input type="date" value={f.end} disabled={disabled} onChange={(e) => set("end", e.target.value)} /></label>
        <label className="text-sm">ou nombre maximal<Input inputMode="numeric" value={f.max} disabled={disabled || !!f.end} onChange={(e) => set("max", e.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Saisons (MM-JJ au MM-JJ; séparées par « ; », facultatif)<Input value={f.seasons} placeholder="04-01 au 11-30" disabled={disabled} onChange={(e) => set("seasons", e.target.value)} /></label>
      </>}
      <label className="text-sm sm:col-span-2">Date de facturation planifiée<select className={`${sel} w-full`} value={f.shift} disabled={disabled} onChange={(e) => set("shift", e.target.value)}>{Object.entries(SHIFT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    </>}
  </div>;
}

/* ------------------------------------------- création / nouvelle version */
type TplForm = { client: string; project: string; label: string; contract_ref: string; rule: R.RuleForm; lines: R.RecLine[]; pit: boolean; terms: string; due_days: string; effective: string };
const EMPTY_TPL: TplForm = { client: "", project: "", label: "", contract_ref: "", rule: { ...R.EMPTY_RULE }, lines: [{ ...R.EMPTY_LINE }], pit: false, terms: "", due_days: "30", effective: "" };

export function TemplateForm({ companyId, version, onClose, onSaved }: { companyId: string; version?: { template: J }; onClose: () => void; onSaved: (id: string) => void }) {
  const { user } = useAuthReady();
  const base: TplForm = useMemo(() => {
    if (!version) return EMPTY_TPL;
    const t = version.template; const v = (t.versions ?? []).find((x: J) => x.version === t.current_version) ?? {};
    return { ...EMPTY_TPL, client: t.client_id, label: t.label, contract_ref: t.contract_ref ?? "", lines: R.toFormLines(v.lines), pit: !!v.prices_include_tax, terms: v.terms ?? "", due_days: v.due_days == null ? "" : String(v.due_days) };
  }, [version]);
  const [f, setF] = useState<TplForm>(base);
  const [lk, setLk] = useState<{ clients: { id: string; name: string }[]; projects: { id: string; name: string }[] }>({ clients: [], projects: [] });
  const [prev, setPrev] = useState<{ sig: string; dates: J[] } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const guard = useRef(R.makeGuard()).current;
  useEffect(() => () => guard.bump(), [guard]);
  useEffect(() => { guard.bump(); }, [companyId, guard]);
  useEffect(() => { const ok = guard.take(); api.lookups(companyId).then((x) => ok() && setLk(x)); }, [companyId, guard]);
  const store = useDraft({
    id: user ? { module: "finances", form: version ? "recurrence-version" : "recurrence", owner: user.id, company: companyId, ...(version ? { recordId: version.template.id } : {}) } : null,
    data: f, isEmpty: (d) => JSON.stringify(d) === JSON.stringify(base), onRestore: (d) => setF(d),
    label: (d) => version ? `Nouvelle version de « ${version.template.label} »` : d.label ? `Récurrence « ${d.label} »` : "Nouvelle récurrence",
    route: `/entrepreneur/finances?company=${companyId}&tab=factures`,
  });
  const edit = (p: Partial<TplForm>) => { setF((x) => ({ ...x, ...p })); setErr(null); };
  const rule = R.buildRule(f.rule);
  const sig = JSON.stringify(rule);
  const doPreview = async () => {
    const ok = guard.take(); const s = sig; setBusy(true); setErr(null);
    try { const from = f.rule.anchor || todayIn(TZ); const r = await R.rulePreview(companyId, rule, from, addDaysIso(from, 400)); if (ok()) setPrev({ sig: s, dates: r.dates }); }
    catch (e) { if (ok()) setErr(msg(e)); } finally { if (ok()) setBusy(false); }
  };
  const save = async () => {
    const cl = R.canonLines(f.lines);
    if (!cl.ok) { setErr(cl.errors.join(" ; ")); return; }
    const due = f.due_days.trim() === "" ? null : Number(f.due_days);
    if (due != null && (!Number.isInteger(due) || due < 0 || due > 365)) { setErr("Délai de paiement : nombre de jours entier de 0 à 365"); return; }
    if (!version && (!f.client || !f.label.trim())) { setErr("Client et libellé requis"); return; }
    if (version && !f.effective) { setErr("Date d'effet requise"); return; }
    const payload = version
      ? { template: version.template.id, effective: f.effective, rule, lines: cl.lines, pit: f.pit, terms: f.terms.trim() || null, due_days: due, rev: version.template.rev }
      : { company: companyId, client: f.client, project: f.project || null, label: f.label.trim(), contract_ref: f.contract_ref.trim() || null, rule, lines: cl.lines, pit: f.pit, terms: f.terms.trim() || null, due_days: due };
    const key = R.keyFor(keyRef, payload); const ok = guard.take(); setBusy(true); setErr(null);
    try {
      const r = version ? await R.addVersion({ ...(payload as J), key }) : await R.createTemplate({ ...(payload as J), key });
      if (!ok()) return;
      store.finalize?.(); onSaved(version ? version.template.id : r.id);
    } catch (e) { if (ok()) setErr(msg(e) + (R.isConflict(e) ? " — saisie conservée; rechargez la récurrence puis réessayez." : "")); }
    finally { if (ok()) setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{version ? `Nouvelle version — ${version.template.label}` : "Nouvelle facture récurrente"}</DialogTitle></DialogHeader>
      <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); setF(base); }} sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />
      <fieldset disabled={busy} className="space-y-3">
        {version ? <><p className="text-sm text-muted-foreground">Une version s'applique seulement aux occurrences futures non préparées, à partir de la date d'effet (postérieure à la dernière occurrence préparée, émise ou ignorée). Les brouillons, factures et documents existants restent inchangés.</p>
          <label className="text-sm">Date d'effet<Input type="date" value={f.effective} onChange={(e) => edit({ effective: e.target.value })} /></label></>
        : <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Client<select className={`${sel} w-full`} value={f.client} onChange={(e) => edit({ client: e.target.value })}><option value="">— choisir —</option>{lk.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm">Projet (facultatif)<select className={`${sel} w-full`} value={f.project} onChange={(e) => edit({ project: e.target.value })}><option value="">—</option>{lk.projects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm">Libellé<Input value={f.label} onChange={(e) => edit({ label: e.target.value })} /></label>
          <label className="text-sm">Référence de contrat<Input value={f.contract_ref} onChange={(e) => edit({ contract_ref: e.target.value })} /></label>
        </div>}
        <h3 className="font-semibold">Calendrier</h3>
        <RuleEditor f={f.rule} onChange={(rule) => edit({ rule })} />
        <Button type="button" variant="outline" onClick={doPreview}>Aperçu des dates (lecture seule)</Button>
        {prev && prev.sig === sig && <div className="rounded-md bg-secondary p-2 text-sm"><p className="font-medium">{prev.dates.length} date(s) sur 400 jours — aucune facture créée</p>
          <p className="text-xs">{prev.dates.slice(0, 24).map((d: J) => fmtDate(d.scheduled) + (d.planned !== d.scheduled ? ` (planifiée ${fmtDate(d.planned)})` : "")).join(" · ")}{prev.dates.length > 24 ? " …" : ""}</p></div>}
        {prev && prev.sig !== sig && <p className="text-xs text-muted-foreground">Calendrier modifié : refaites l'aperçu.</p>}
        <h3 className="font-semibold">Lignes facturées à chaque occurrence</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pit} onChange={(e) => edit({ pit: e.target.checked })} />Prix taxes incluses (TTC)</label>
        <LinesEditor lines={f.lines} onChange={(lines) => edit({ lines })} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Conditions de paiement<Input value={f.terms} onChange={(e) => edit({ terms: e.target.value })} /></label>
          <label className="text-sm">Délai de paiement (jours)<Input inputMode="numeric" value={f.due_days} onChange={(e) => edit({ due_days: e.target.value })} /></label>
        </div>
      </fieldset>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Fermer</Button><Button disabled={busy} onClick={save}>{busy ? "Enregistrement…" : version ? "Enregistrer la version" : "Créer la récurrence"}</Button></div>
    </DialogContent>
  </Dialog>;
}

/* ------------------------------------------------ brouillon d'une occurrence */
type OccForm = { issue: string; due: string; sf: string; st: string; lines: R.RecLine[]; note: string };
const occForm = (o: J): OccForm => ({ issue: o.issue_date ?? "", due: o.due_date ?? "", sf: o.service_from ?? "", st: o.service_to ?? "", lines: R.toFormLines(o.lines), note: o.note ?? "" });

export function OccurrenceEditor({ occ: occ0, companyId, canWrite, onClose, onChanged }: { occ: J; companyId: string; canWrite: boolean; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuthReady();
  const [occ, setOcc] = useState<J>(occ0);
  const [f, setF] = useState<OccForm>(() => occForm(occ0));
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null); // `${id}|${rev}|${hash}`
  const [reason, setReason] = useState(""); const [abandonOpen, setAbandonOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [conflict, setConflict] = useState(false);
  const issueKey = useRef<{ sig: string; key: string } | null>(null); const abKey = useRef<{ sig: string; key: string } | null>(null);
  const guard = useRef(R.makeGuard()).current;
  useEffect(() => () => guard.bump(), [guard]);
  useEffect(() => { guard.bump(); setBusy(false); }, [companyId, occ0.id, canWrite, guard]);
  const draft = occ.status === "brouillon";
  const store = useDraft({
    id: user && draft && canWrite ? { module: "finances", form: "recurrence-occurrence", owner: user.id, company: companyId, recordId: occ.id } : null,
    data: { ...f, base: occ.rev }, isEmpty: (d) => JSON.stringify({ ...d, base: undefined }) === JSON.stringify({ ...occForm(occ), base: undefined }),
    onRestore: (d) => { if ((d as J).base === occ.rev) { setF({ issue: d.issue, due: d.due, sf: d.sf, st: d.st, lines: d.lines, note: d.note }); setDirty(true); } },
    label: () => `Brouillon de facture récurrente du ${fmtDate(occ.scheduled_on)}`, route: `/entrepreneur/finances?company=${companyId}&tab=factures`,
  });
  const token = `${occ.id}|${occ.rev}|${occ.hash}`;
  const edit = (p: Partial<OccForm>) => { setF((x) => ({ ...x, ...p })); setDirty(true); setConfirm(null); setErr(null); };
  const save = async () => {
    if (!canWrite || busy) return;
    const cl = R.canonLines(f.lines);
    if (!cl.ok) { setErr(cl.errors.join(" ; ")); return; }
    if (!f.issue) { setErr("Date réelle d'émission requise"); return; }
    if (!!f.sf !== !!f.st) { setErr("Période de service : début et fin ensemble (ou aucune)"); return; }
    const ok = guard.take(); setBusy(true); setErr(null);
    try {
      const r = await R.draftSave({ occ: occ.id, issue: f.issue, due: f.due || null, sf: f.sf || null, st: f.st || null, lines: cl.lines, note: f.note.trim() || null, rev: occ.rev });
      if (!ok()) return;
      setOcc((o: J) => ({ ...o, ...r })); setF(occForm(r));
      setDirty(false); setConfirm(null); setConflict(false); store.discard();
    } catch (e) { if (!ok()) return; setConflict(R.isConflict(e)); setErr(msg(e) + (R.isConflict(e) ? " — votre saisie est conservée." : "")); }
    finally { if (ok()) setBusy(false); }
  };
  const doIssue = async () => {
    if (!canWrite || busy || dirty || confirm !== token) return;
    const key = R.keyFor(issueKey, { occ: occ.id, rev: occ.rev, hash: occ.hash });
    const ok = guard.take(); setBusy(true); setErr(null);
    try { const r = await R.issue(occ.id, key, occ.rev, occ.hash); if (!ok()) return; setOcc((o: J) => ({ ...o, status: "emise", invoice_id: r.invoice_id, invoice_number: r.number })); setConfirm(null); onChanged(); }
    catch (e) { if (!ok()) return; setConflict(R.isConflict(e)); setConfirm(null); setErr(msg(e) + (R.isConflict(e) ? " — aucune émission. Actualisez l'aperçu puis confirmez de nouveau." : "")); }
    finally { if (ok()) setBusy(false); }
  };
  const doAbandon = async () => {
    if (!canWrite || busy || !reason.trim()) return;
    const key = R.keyFor(abKey, { occ: occ.id, reason: reason.trim(), rev: occ.rev, hash: occ.hash });
    const ok = guard.take(); setBusy(true); setErr(null);
    try { await R.abandon(occ.id, key, reason.trim(), occ.rev, occ.hash); if (!ok()) return; setOcc((o: J) => ({ ...o, status: "abandonnee", abandon_reason: reason.trim() })); setAbandonOpen(false); store.discard(); onChanged(); }
    catch (e) { if (!ok()) return; setConflict(R.isConflict(e)); setErr(msg(e)); }
    finally { if (ok()) setBusy(false); }
  };
  const tax = occ.computed?.tax;
  return <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>Occurrence du {fmtDate(occ.scheduled_on)} — {R.OCC_LABEL[occ.status] ?? occ.status}</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">Date prévue de facturation : {fmtDate(occ.scheduled_on)}{occ.planned_on && occ.planned_on !== occ.scheduled_on ? ` (planifiée ${fmtDate(occ.planned_on)})` : ""} · version {occ.version}. Seul ce brouillon est modifié; le modèle et les autres occurrences restent inchangés.</p>
      {draft && canWrite && <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); setF(occForm(occ)); setDirty(false); }} sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />}
      <fieldset disabled={busy || !draft || !canWrite} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Date réelle d'émission<Input type="date" value={f.issue} onChange={(e) => edit({ issue: e.target.value })} /></label>
          <label className="text-sm">Échéance<Input type="date" value={f.due} onChange={(e) => edit({ due: e.target.value })} /></label>
          <label className="text-sm">Période de service — début (facultatif)<Input type="date" value={f.sf} onChange={(e) => edit({ sf: e.target.value })} /></label>
          <label className="text-sm">Période de service — fin<Input type="date" value={f.st} onChange={(e) => edit({ st: e.target.value })} /></label>
        </div>
        <p className="text-xs text-muted-foreground">La période de service n'est jamais déduite du calendrier : saisissez-la si elle doit figurer sur la facture.</p>
        <LinesEditor lines={f.lines} onChange={(lines) => edit({ lines })} />
        <label className="text-sm">Note<Textarea value={f.note} onChange={(e) => edit({ note: e.target.value })} /></label>
      </fieldset>
      {tax && <div className="rounded-md border p-2"><p className="mb-1 text-xs font-medium">Aperçu fiscal serveur (révision {occ.rev}){dirty ? " — périmé : enregistrez pour actualiser" : ""}</p><TaxSummary r={tax} /></div>}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {occ.status === "emise" && <p className="text-sm">Facture {occ.invoice_number ?? ""} émise. Encaissements et notes de crédit se gèrent depuis la facture.</p>}
      {occ.status === "abandonnee" && <p className="text-sm">Occurrence ignorée : {occ.abandon_reason}. Elle reste conservée et n'est pas recréée.</p>}
      {draft && canWrite && <div className="space-y-2 border-t pt-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={save}>{dirty ? "Enregistrer et actualiser l'aperçu" : conflict ? "Refaire l'aperçu" : "Actualiser l'aperçu"}</Button>
          <Button variant="outline" disabled={busy} onClick={() => setAbandonOpen((x) => !x)}>Ignorer cette occurrence…</Button>
        </div>
        {dirty && <p className="text-xs text-muted-foreground">Brouillon modifié : enregistrez-le avant d'émettre.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || dirty || !tax?.resolved} checked={confirm === token} onChange={(e) => setConfirm(e.target.checked ? token : null)} />Je confirme l'émission de cette facture (numéro définitif, aucun envoi)</label>
        <Button disabled={busy || dirty || confirm !== token} onClick={doIssue}>Émettre</Button>
        {abandonOpen && <div className="space-y-1"><label className="text-sm">Motif (obligatoire)<Input value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} /></label>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={doAbandon}>Confirmer : ignorer l'occurrence</Button></div>}
      </div>}
      <div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={onClose}>Fermer</Button></div>
    </DialogContent>
  </Dialog>;
}

/* --------------------------------------------------------- fiche modèle */
export function RecurringDetail({ id, companyId, canWrite, onClose, onChanged }: { id: string; companyId: string; canWrite: boolean; onClose: () => void; onChanged: () => void }) {
  const [s, setS] = useState<J | null>(null); const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const [occ, setOcc] = useState<J | null>(null); const [ver, setVer] = useState(false);
  const [act, setAct] = useState<{ action: "pause" | "resume" | "stop"; reason: string } | null>(null);
  const prepKey = useRef<{ sig: string; key: string } | null>(null); const stKey = useRef<{ sig: string; key: string } | null>(null);
  const guard = useRef(R.makeGuard()).current;
  useEffect(() => () => guard.bump(), [guard]);
  const load = useCallback(async () => {
    const ok = guard.take(); const from = todayIn(TZ).slice(0, 8) + "01";
    try { const r = await R.summary(id, addDaysIso(from, -366), addDaysIso(from, 400)); if (!ok()) return; if (r.company_id !== companyId) { setErr("Récurrence d'une autre entreprise : affichage refusé"); setS(null); return; } setS(r); setErr(null); }
    catch (e) { if (ok()) { setErr(msg(e)); setS(null); } }
  }, [id, companyId, guard]);
  useEffect(() => { guard.bump(); setS(null); setPick([]); setBusy(false); setOcc(null); load(); }, [id, companyId, canWrite, load, guard]);
  const run = async (fn: (ok: () => boolean) => Promise<void>) => { const ok = guard.take(); setBusy(true); setErr(null); try { await fn(ok); } catch (e) { if (ok()) setErr(msg(e) + (R.isConflict(e) ? " — rechargé; vérifiez puis réessayez." : "")); if (ok() && R.isConflict(e)) load(); } finally { if (ok()) setBusy(false); } };
  const doPrepare = () => run(async (ok) => { const key = R.keyFor(prepKey, { t: id, keys: [...pick].sort(), rev: s.rev }); await R.prepare(id, key, [...pick].sort(), s.rev); if (!ok()) return; setPick([]); await load(); if (ok()) onChanged(); });
  const doStatus = () => act && act.reason.trim() && run(async (ok) => { const key = R.keyFor(stKey, { t: id, a: act.action, r: act.reason.trim(), rev: s.rev }); await R.setStatus(id, key, act.action, act.reason.trim(), s.rev); if (!ok()) return; setAct(null); await load(); if (ok()) onChanged(); });
  const occByKey = useMemo(() => Object.fromEntries(((s?.occurrences ?? []) as J[]).map((o) => [o.occ_key, o])), [s]);
  const drafts = ((s?.occurrences ?? []) as J[]).filter((o) => o.status === "brouillon");
  return <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader><DialogTitle>{s ? `${s.label} — ${R.STATUS_LABEL[s.status] ?? s.status}` : "Récurrence"}</DialogTitle></DialogHeader>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {!s && !err && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {s && <div className="space-y-4 text-sm">
        <p>Client : {s.client_name}{s.project_name ? ` · projet ${s.project_name}` : ""}{s.contract_ref ? ` · contrat ${s.contract_ref}` : ""} · version {s.current_version}</p>
        {s.status !== "actif" && drafts.length > 0 && <p className="rounded-md bg-secondary p-2">{drafts.length} brouillon(s) déjà préparé(s) à traiter explicitement (émettre ou ignorer) : {drafts.map((o) => fmtDate(o.scheduled_on)).join(", ")}.</p>}
        <section><h3 className="mb-1 font-semibold">Calendrier (aperçu en lecture seule — aucune facture créée)</h3>
          <ul className="divide-y rounded-md border">
            {(s.calendar as J[]).map((c) => { const o = occByKey[c.key]; return <li key={c.key} className="flex items-center gap-2 px-2 py-1">
              {!o && canWrite && s.status === "actif" && <input type="checkbox" aria-label={`Choisir ${c.scheduled}`} disabled={busy} checked={pick.includes(c.key)} onChange={(e) => setPick((p) => e.target.checked ? (p.length < 24 ? [...p, c.key] : p) : p.filter((k) => k !== c.key))} />}
              <span className="w-28">{fmtDate(c.scheduled)}</span><span className="text-xs text-muted-foreground">v{c.version}{c.planned !== c.scheduled ? ` · planifiée ${fmtDate(c.planned)}` : ""}</span>
              <span className="ml-auto text-xs">{o ? (R.OCC_LABEL[o.status] + (o.invoice_number ? ` ${o.invoice_number}` : "")) : "Non préparée"}</span>
              {o && <Button size="sm" variant="ghost" onClick={() => setOcc(o)}>Ouvrir</Button>}
            </li>; })}
          </ul>
          {canWrite && s.status === "actif" && <Button className="mt-2" disabled={busy || !pick.length} onClick={doPrepare}>Préparer {pick.length} brouillon(s) (24 au plus, sans numéro ni émission)</Button>}
        </section>
        {canWrite && s.status !== "arrete" && <section className="space-y-2"><h3 className="font-semibold">Cycle</h3>
          <div className="flex flex-wrap gap-2">
            {s.status === "actif" && <Button variant="outline" disabled={busy} onClick={() => setAct({ action: "pause", reason: "" })}>Mettre en pause…</Button>}
            {s.status === "pause" && <Button variant="outline" disabled={busy} onClick={() => setAct({ action: "resume", reason: "" })}>Reprendre…</Button>}
            <Button variant="outline" disabled={busy} onClick={() => setAct({ action: "stop", reason: "" })}>Arrêter définitivement…</Button>
            <Button variant="outline" disabled={busy} onClick={() => setVer(true)}>Nouvelle version (futur)…</Button>
          </div>
          {act && <div className="flex flex-wrap items-end gap-2"><label className="text-sm">Motif (obligatoire)<Input value={act.reason} disabled={busy} onChange={(e) => setAct({ ...act, reason: e.target.value })} /></label>
            <Button disabled={busy || !act.reason.trim()} onClick={doStatus}>Confirmer</Button><Button variant="ghost" disabled={busy} onClick={() => setAct(null)}>Annuler</Button></div>}
          <p className="text-xs text-muted-foreground">Aucun renouvellement ni émission automatique. Pause et arrêt bloquent seulement la préparation de nouvelles occurrences.</p>
        </section>}
        <section><h3 className="mb-1 font-semibold">Versions</h3><ul className="text-xs">{(s.versions as J[]).map((v) => <li key={v.version}>v{v.version} — effet {fmtDate(v.effective_from)} · {v.lines.length} ligne(s){v.prices_include_tax ? " · TTC" : " · HT"}{v.due_days != null ? ` · ${v.due_days} j` : ""}</li>)}</ul></section>
        <section><h3 className="mb-1 font-semibold">Historique</h3><ul className="text-xs">{(s.events as J[]).map((e, i) => <li key={i}>{new Date(e.at).toLocaleString("fr-CA")} — {R.EVENT_LABEL[e.action] ?? e.action}{e.reason ? ` : ${e.reason}` : ""}{e.actor ? ` (${e.actor})` : ""}</li>)}</ul></section>
      </div>}
      <div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={onClose}>Fermer</Button></div>
      {occ && <OccurrenceEditor key={occ.id} occ={occ} companyId={companyId} canWrite={canWrite} onClose={() => { setOcc(null); load(); }} onChanged={() => { load(); onChanged(); }} />}
      {ver && s && <TemplateForm companyId={companyId} version={{ template: s }} onClose={() => setVer(false)} onSaved={() => { setVer(false); load(); onChanged(); }} />}
    </DialogContent>
  </Dialog>;
}

/* ------------------------------------------------------------- liste */
export default function RecurringInvoices({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<J[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); const [creating, setCreating] = useState(false); const [seq, setSeq] = useState(0);
  const guard = useRef(R.makeGuard()).current;
  useEffect(() => () => guard.bump(), [guard]);
  useEffect(() => { guard.bump(); setOpen(null); setCreating(false); setRows(null); }, [companyId, guard]);
  useEffect(() => { const ok = guard.take(); R.list(companyId).then((r) => { if (ok()) { setRows(r); setErr(null); } }).catch((e) => ok() && setErr(msg(e))); }, [companyId, seq, guard]);
  return <div className="space-y-3">
    <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Modèles de factures répétées. Rien n'est émis ni envoyé automatiquement.</p>
      {canWrite && <Button onClick={() => setCreating(true)}>Nouvelle récurrence</Button>}</div>
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    {!rows && !err && <p className="text-sm text-muted-foreground">Chargement…</p>}
    {rows && !rows.length && <p className="text-sm text-muted-foreground">Aucune récurrence.</p>}
    {rows && rows.length > 0 && <ul className="divide-y rounded-md border">{rows.map((r) => <li key={r.id}><button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary" onClick={() => setOpen(r.id)}>
      <span className="font-medium">{r.label}</span><span className="text-muted-foreground">{r.client_name}{r.contract_ref ? ` · ${r.contract_ref}` : ""}</span>
      <span className="ml-auto text-xs">{R.STATUS_LABEL[r.status]} · {r.drafts} brouillon(s) · {r.issued} émise(s)</span></button></li>)}</ul>}
    {creating && <TemplateForm companyId={companyId} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setSeq((x) => x + 1); setOpen(id); }} />}
    {open && <RecurringDetail key={`${companyId}|${open}`} id={open} companyId={companyId} canWrite={canWrite} onClose={() => setOpen(null)} onChanged={() => setSeq((x) => x + 1)} />}
  </div>;
}
