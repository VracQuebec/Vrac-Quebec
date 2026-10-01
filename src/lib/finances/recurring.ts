// FIN-09C1 — Factures récurrentes. Toute écriture passe par les RPC fin_rec_* (droits, verrous,
// idempotence et taxes vérifiés côté serveur). Les dates viennent du moteur unique fin_gen_dates.
import { supabase } from "@/integrations/supabase/client";
import { presetRule, toPreset, type Preset } from "./recurrence";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RecLine = { desc: string; unit: string; qty: string; price: string; disc_pct: string; tax: "taxable" | "detaxe" | "exonere" | "" };
export const EMPTY_LINE: RecLine = { desc: "", unit: "", qty: "1", price: "", disc_pct: "", tax: "taxable" };
export const TAX_LABEL: Record<string, string> = { taxable: "Taxable (TPS/TVQ)", detaxe: "Détaxé (0 %)", exonere: "Exonéré" };
export const STATUS_LABEL: Record<string, string> = { actif: "Active", pause: "En pause", arrete: "Arrêtée" };
export const OCC_LABEL: Record<string, string> = { brouillon: "Brouillon préparé", emise: "Facture émise", abandonnee: "Ignorée (abandonnée)" };
export const EVENT_LABEL: Record<string, string> = { create: "Création", prepare: "Préparation de brouillons", issue: "Émission", abandon: "Occurrence ignorée", pause: "Pause", resume: "Reprise", stop: "Arrêt", version: "Nouvelle version (futur)", draft_save: "Brouillon corrigé" };

/** Nombre fr-CA (« 1 234,5 ») → chaîne canonique « 1234.5 »; null si illisible, non fini ou trop précis. Jamais de 0 implicite. */
export function decFr(v: string | null | undefined, maxDec = 4): string | null {
  if (v == null) return null;
  const s = String(v).replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const [, d = ""] = s.split(".");
  if (d.length > maxDec) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return s.replace(/^(-?)0+(?=\d)/, "$1");
}

/** Lignes du formulaire → lignes envoyées au serveur, ou liste d'erreurs claires (validation finale = serveur). */
export function canonLines(lines: RecLine[]): { ok: boolean; lines: J[]; errors: string[] } {
  const errors: string[] = []; const out: J[] = [];
  if (!lines.length) errors.push("Au moins une ligne est requise");
  lines.forEach((l, i) => {
    const n = i + 1; const qty = decFr(l.qty); const price = decFr(l.price); const disc = l.disc_pct.trim() === "" ? null : decFr(l.disc_pct, 2);
    if (!l.desc.trim()) errors.push(`Ligne ${n} : description requise`);
    if (qty == null || Number(qty) <= 0) errors.push(`Ligne ${n} : quantité positive requise`);
    if (price == null || Number(price) < 0) errors.push(`Ligne ${n} : prix unitaire requis`);
    if (l.disc_pct.trim() !== "" && (disc == null || Number(disc) < 0 || Number(disc) > 100)) errors.push(`Ligne ${n} : remise de 0 à 100 %`);
    if (!l.tax) errors.push(`Ligne ${n} : traitement fiscal requis`);
    const o: J = { desc: l.desc.trim(), unit: l.unit.trim(), qty, price, tax: l.tax };
    if (disc != null && Number(disc) > 0) o.disc_pct = disc;
    out.push(o);
  });
  return { ok: errors.length === 0, lines: errors.length ? [] : out, errors };
}
export const toFormLines = (ls: J[] | null | undefined): RecLine[] => (ls ?? []).map((l) => ({ desc: l.desc ?? "", unit: l.unit ?? "", qty: String(l.qty ?? "").replace(".", ","), price: String(l.price ?? "").replace(".", ","), disc_pct: l.disc_pct == null ? "" : String(l.disc_pct).replace(".", ","), tax: l.tax ?? "" }));

export type RuleForm = { preset: Preset; n: string; unit: "days" | "weeks" | "months"; anchor: string; end: string; max: string; month_day: string; month_day2: string; weekdays: number[];
  short_month: string; feb29: string; collision: string; shift: string; seasons: string; dates: string };
export const EMPTY_RULE: RuleForm = { preset: "monthly", n: "2", unit: "days", anchor: "", end: "", max: "", month_day: "", month_day2: "", weekdays: [], short_month: "last_day", feb29: "feb28", collision: "keep_both", shift: "none", seasons: "", dates: "" };

const N_PRESETS = ["every_n_days", "every_n_years", "custom"];
const MONTHLY_PRESETS = ["monthly", "every_2_months", "every_3_months", "every_4_months", "every_6_months"];
export const isMonthlyForm = (f: RuleForm) => MONTHLY_PRESETS.includes(f.preset) || (f.preset === "custom" && f.unit === "months");

/** Formulaire → règle du modèle commun FIN-02. Aucune normalisation silencieuse : toute saisie hors bornes est une erreur affichée. */
export function buildRule(f: RuleForm): { rule: J; errors: string[] } {
  const errors: string[] = [];
  if (f.preset === "schedule") {
    const ds = f.dates.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!ds.length) errors.push("Dates personnalisées : au moins une date");
    ds.forEach((d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.push(`Date invalide : ${d}`); });
    return { rule: { frequency: "schedule", schedule: ds.map((date) => ({ date })) }, errors };
  }
  let n = 1;
  if (N_PRESETS.includes(f.preset)) {
    if (!/^\d{1,3}$/.test(f.n.trim()) || Number(f.n) < 1) errors.push("Intervalle N : nombre entier positif requis");
    else n = Number(f.n);
  }
  const { frequency, interval_n } = presetRule(f.preset, n, f.unit);
  if (!f.anchor) errors.push("Date d'ancrage requise");
  const r: J = { frequency, interval_n, anchor_date: f.anchor || null, planned_shift: f.shift };
  const day = (v: string, label: string) => { if (!/^\d{1,2}$/.test(v.trim()) || Number(v) < 1 || Number(v) > 31) errors.push(`${label} : entier de 1 à 31`); return v.trim(); };
  if (frequency !== "once") {
    if (f.end) r.end_date = f.end;
    else if (f.max.trim()) { if (!/^\d{1,3}$/.test(f.max.trim()) || Number(f.max) < 1 || Number(f.max) > 600) errors.push("Nombre maximal : entier de 1 à 600"); r.max_count = f.max.trim(); }
  }
  if (frequency === "monthly") { r.month_day = f.month_day.trim() ? day(f.month_day, "Jour du mois") : (f.anchor ? String(Number(f.anchor.slice(8))) : null); r.short_month_policy = f.short_month; }
  if (frequency === "twice_monthly") { r.month_day = day(f.month_day, "Premier jour"); r.month_day2 = day(f.month_day2, "Second jour"); r.collision_policy = f.collision; }
  if (frequency === "weekdays") { if (!f.weekdays.length) errors.push("Choisissez au moins un jour"); r.weekdays = f.weekdays; }
  if (frequency === "yearly" && f.anchor.slice(5) === "02-29") r.feb29_policy = f.feb29;
  const seasons = f.seasons.split(";").map((s) => s.trim()).filter(Boolean).map((s) => { const m = s.match(/^(\d{2}-\d{2})\s*(?:au|-|→)\s*(\d{2}-\d{2})$/); if (!m) errors.push(`Saison illisible : ${s}`); return m ? { from: m[1], to: m[2] } : { from: s, to: "" }; });
  if (seasons.length && frequency !== "once") r.seasons = seasons;
  return { rule: r, errors };
}

/** Règle enregistrée → formulaire (préchargement fidèle d'une nouvelle version). */
export function ruleToForm(r: J): RuleForm {
  if (!r) return { ...EMPTY_RULE };
  const f: RuleForm = { ...EMPTY_RULE, anchor: r.anchor_date ?? "", end: r.end_date ?? "", max: r.max_count == null ? "" : String(r.max_count), shift: r.planned_shift ?? "none",
    month_day: r.month_day == null ? "" : String(r.month_day), month_day2: r.month_day2 == null ? "" : String(r.month_day2), weekdays: (r.weekdays ?? []).map(Number),
    short_month: r.short_month_policy ?? "last_day", feb29: r.feb29_policy ?? "feb28", collision: r.collision_policy ?? "keep_both",
    seasons: (r.seasons ?? []).map((s: J) => `${s.from} au ${s.to}`).join("; ") };
  const n = Number(r.interval_n ?? 1);
  if (r.frequency === "schedule") return { ...f, preset: "schedule", dates: (r.schedule ?? []).map((x: J) => x.date).join(", ") };
  const p = toPreset(r.frequency, n);
  if (p === "custom") return { ...f, preset: "custom", n: String(n), unit: r.frequency === "daily" ? "days" : r.frequency === "weekly" ? "weeks" : "months" };
  return { ...f, preset: p, n: String(n) };
}

/** Garde de contexte : toute réponse arrivée après un changement d'entreprise/modèle/occurrence/droits ou un démontage est ignorée. */
export function makeGuard() {
  let gen = 0;
  return { bump: () => { gen += 1; }, take: () => { const g = gen; return () => g === gen; } };
}

/** Clé d'idempotence stable tant que la demande (payload) est identique : une reprise après perte réseau réutilise la même clé. */
export function keyFor(store: { current: { sig: string; key: string } | null }, payload: unknown): string {
  const sig = JSON.stringify(payload);
  if (store.current?.sig === sig) return store.current.key;
  const key = crypto.randomUUID(); store.current = { sig, key }; return key;
}

const call = async (fn: string, args: J) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) { const e = new Error(error.message || "Erreur serveur") as Error & { code?: string }; e.code = error.code; throw e; }
  return data as J;
};
export const isConflict = (e: unknown) => (e as { code?: string })?.code === "P0409";

export const list = (company: string) => call("fin_rec_list", { _company: company });
export const summary = (template: string, from: string, to: string) => call("fin_rec_summary", { _template: template, _from: from, _to: to });
export const rulePreview = (company: string, rule: J, from: string, to: string, effective: string | null = null) => call("fin_rec_rule_preview", { _company: company, _rule: rule, _from: from, _to: to, _effective: effective });
export const createTemplate = (a: { company: string; key: string; client: string; project: string | null; label: string; contract_ref: string | null; rule: J; lines: J[]; pit: boolean; terms: string | null; due_days: number | null }) =>
  call("fin_rec_template_create", { _company: a.company, _key: a.key, _client: a.client, _project: a.project, _label: a.label, _contract_ref: a.contract_ref, _rule: a.rule, _lines: a.lines, _pit: a.pit, _terms: a.terms, _due_days: a.due_days });
export const addVersion = (a: { template: string; key: string; effective: string; rule: J; lines: J[]; pit: boolean; terms: string | null; due_days: number | null; rev: number }) =>
  call("fin_rec_version_add", { _template: a.template, _key: a.key, _effective: a.effective, _rule: a.rule, _lines: a.lines, _pit: a.pit, _terms: a.terms, _due_days: a.due_days, _expect_rev: a.rev });
export const setStatus = (template: string, key: string, action: "pause" | "resume" | "stop", reason: string, rev: number) => call("fin_rec_set_status", { _template: template, _key: key, _action: action, _reason: reason, _expect_rev: rev });
export const prepare = (template: string, key: string, keys: string[], rev: number) => call("fin_rec_prepare", { _template: template, _key: key, _occ_keys: keys, _expect_rev: rev });
export const draftSave = (a: { occ: string; issue: string; due: string | null; sf: string | null; st: string | null; lines: J[]; note: string | null; rev: number }) =>
  call("fin_rec_draft_save", { _occ: a.occ, _issue: a.issue, _due: a.due, _sf: a.sf, _st: a.st, _lines: a.lines, _note: a.note, _base_rev: a.rev });
export const issue = (occ: string, key: string, rev: number, hash: string) => call("fin_rec_issue", { _occ: occ, _key: key, _expect_rev: rev, _expect_hash: hash });
export const abandon = (occ: string, key: string, reason: string, rev: number, hash: string) => call("fin_rec_abandon", { _occ: occ, _key: key, _reason: reason, _expect_rev: rev, _expect_hash: hash });
