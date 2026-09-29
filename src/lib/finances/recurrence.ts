// FIN-02 — Présentation des règles de récurrence. Le calcul des dates est fait
// uniquement par le moteur serveur (fin_gen_dates) : aperçu, calendrier et totaux.
import { fmtDate, fmtMoney } from "./period";

export type Preset =
  | "once" | "daily" | "every_n_days" | "weekdays" | "weekly" | "biweekly" | "four_weeks" | "twice_monthly"
  | "monthly" | "every_2_months" | "every_3_months" | "every_4_months" | "every_6_months" | "yearly" | "every_n_years" | "custom" | "schedule";

export const PRESETS: { v: Preset; l: string }[] = [
  { v: "once", l: "Ponctuelle (une seule fois)" },
  { v: "daily", l: "Chaque jour" },
  { v: "every_n_days", l: "Tous les N jours" },
  { v: "weekdays", l: "Jours de semaine choisis" },
  { v: "weekly", l: "Chaque semaine" },
  { v: "biweekly", l: "Toutes les deux semaines — 14 jours" },
  { v: "four_weeks", l: "Toutes les quatre semaines — 28 jours" },
  { v: "twice_monthly", l: "Deux fois par mois (deux jours choisis)" },
  { v: "monthly", l: "Chaque mois" },
  { v: "every_2_months", l: "Tous les deux mois" },
  { v: "every_3_months", l: "Tous les trois mois (trimestre)" },
  { v: "every_4_months", l: "Tous les quatre mois" },
  { v: "every_6_months", l: "Tous les six mois (semestre)" },
  { v: "yearly", l: "Chaque année" },
  { v: "every_n_years", l: "Tous les N ans" },
  { v: "custom", l: "Intervalle personnalisé (jours, semaines ou mois)" },
  { v: "schedule", l: "Échéancier irrégulier (dates et montants saisis)" },
];

export const FREQ_FILTERS: { v: string; l: string }[] = [
  { v: "once", l: "Ponctuelle" }, { v: "daily", l: "Jours (chaque jour / N jours)" }, { v: "weekdays", l: "Jours de semaine choisis" },
  { v: "weekly", l: "Semaines (1, 2, 4 ou N)" }, { v: "twice_monthly", l: "Deux fois par mois" }, { v: "monthly", l: "Mois (1 à N mois)" },
  { v: "yearly", l: "Années" }, { v: "schedule", l: "Échéancier irrégulier" },
];

export const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const SHIFT_LABEL: Record<string, string> = {
  none: "Conserver le jour",
  prev_weekday: "Déplacer au jour ouvrable précédent — lundi à vendredi, sans gestion des jours fériés",
  next_weekday: "Déplacer au jour ouvrable suivant — lundi à vendredi, sans gestion des jours fériés",
};
export const SHORT_MONTH_LABEL: Record<string, string> = { last_day: "Mois trop court : dernier jour disponible", skip: "Mois trop court : sauter le mois sans ce jour" };
export const FEB29_LABEL: Record<string, string> = { feb28: "Années non bissextiles : 28 février", mar1: "Années non bissextiles : 1er mars", skip: "Seulement les années où le 29 février existe" };
export const COLLISION_LABEL: Record<string, string> = { keep_both: "Deux versements distincts le même jour", skip_second: "Un seul versement ce mois-là (le second est volontairement omis)" };
export const RENEWAL_LABEL: Record<string, string> = { monthly: "Mensuel", quarterly: "Trimestriel", half: "Semestriel", yearly: "Annuel", multi_year: "Pluriannuel", other: "Autre" };

/** Préréglage → (fréquence, intervalle) du modèle commun. */
export function presetRule(p: Preset, n = 1, unit: "days" | "weeks" | "months" = "days"): { frequency: string; interval_n: number } {
  switch (p) {
    case "daily": return { frequency: "daily", interval_n: 1 };
    case "every_n_days": return { frequency: "daily", interval_n: n };
    case "weekdays": return { frequency: "weekdays", interval_n: 1 };
    case "weekly": return { frequency: "weekly", interval_n: 1 };
    case "biweekly": return { frequency: "weekly", interval_n: 2 };
    case "four_weeks": return { frequency: "weekly", interval_n: 4 };
    case "twice_monthly": return { frequency: "twice_monthly", interval_n: 1 };
    case "monthly": return { frequency: "monthly", interval_n: 1 };
    case "every_2_months": return { frequency: "monthly", interval_n: 2 };
    case "every_3_months": return { frequency: "monthly", interval_n: 3 };
    case "every_4_months": return { frequency: "monthly", interval_n: 4 };
    case "every_6_months": return { frequency: "monthly", interval_n: 6 };
    case "yearly": return { frequency: "yearly", interval_n: 1 };
    case "every_n_years": return { frequency: "yearly", interval_n: n };
    case "custom": return { frequency: unit === "days" ? "daily" : unit === "weeks" ? "weekly" : "monthly", interval_n: n };
    case "schedule": return { frequency: "schedule", interval_n: 1 };
    default: return { frequency: "once", interval_n: 1 };
  }
}

/** Obligation enregistrée → préréglage affiché. */
export function toPreset(f: string, n = 1): Preset {
  if (f === "daily") return n === 1 ? "daily" : "every_n_days";
  if (f === "weekly") return n === 1 ? "weekly" : n === 2 ? "biweekly" : n === 4 ? "four_weeks" : "custom";
  if (f === "monthly") return ({ 1: "monthly", 2: "every_2_months", 3: "every_3_months", 4: "every_4_months", 6: "every_6_months" } as Record<number, Preset>)[n] ?? "custom";
  if (f === "yearly") return n === 1 ? "yearly" : "every_n_years";
  return (["once", "weekdays", "twice_monthly", "schedule"].includes(f) ? f : "once") as Preset;
}

export function freqLabel(f: string, n = 1): string {
  switch (f) {
    case "once": return "ponctuelle";
    case "daily": return n === 1 ? "chaque jour" : `tous les ${n} jours`;
    case "weekdays": return "jours de semaine choisis";
    case "weekly": return n === 1 ? "chaque semaine" : `toutes les ${n} semaines (${n * 7} jours)`;
    case "twice_monthly": return "deux fois par mois";
    case "monthly": return n === 1 ? "mensuelle" : `tous les ${n} mois`;
    case "yearly": return n === 1 ? "annuelle" : `tous les ${n} ans`;
    case "schedule": return "échéancier irrégulier";
    default: return f;
  }
}

const dayName = (d: number) => (d >= 31 ? "dernier jour" : d === 1 ? "1er" : String(d));

/** Phrase compréhensible, ex. « 100 $ tous les 14 jours à partir du 1er janvier 2026 ». */
export function sentence(p: any): string {
  const f = p.frequency; const n = Number(p.interval_n || 1);
  if (f === "schedule") return `Échéancier de ${(p.schedule ?? []).length} versement(s) saisis`;
  if (!p.anchor_date) return "";
  const amt = p.amount_quality === "unknown" ? "Montant à compléter" : `${fmtMoney(Number(p.amount || 0))}${p.amount_quality === "estimated" ? " (estimé)" : ""}`;
  let rule = "";
  if (f === "once") rule = `le ${fmtDate(p.anchor_date)}`;
  else {
    if (f === "daily") rule = n === 1 ? "chaque jour" : `tous les ${n} jours`;
    else if (f === "weekly") rule = n === 1 ? "chaque semaine" : `tous les ${n * 7} jours`;
    else if (f === "weekdays") rule = `chaque ${(p.weekdays ?? []).map((d: number) => DAYS[d - 1]).join(", ")}`;
    else if (f === "twice_monthly") rule = `deux fois par mois, le ${dayName(Number(p.month_day))} et le ${dayName(Number(p.month_day2))}`;
    else if (f === "monthly") rule = `${n === 1 ? "chaque mois" : `tous les ${n} mois`}, le ${dayName(Number(p.month_day || p.anchor_date.slice(8)))}`;
    else if (f === "yearly") rule = n === 1 ? "chaque année" : `tous les ${n} ans`;
    rule += ` à partir du ${fmtDate(p.anchor_date)}`;
    if (p.end_date) rule += `, jusqu'au ${fmtDate(p.end_date)} inclus`;
    else if (p.max_count) rule += `, ${p.max_count} versement(s) au maximum`;
    else rule += ", sans date de fin";
  }
  return `${amt} ${rule}`;
}

/** Politiques actives à rappeler dans l'aperçu. */
export function policies(p: any): string[] {
  const out: string[] = [];
  if (p.frequency === "monthly" || p.frequency === "twice_monthly") out.push(SHORT_MONTH_LABEL[p.short_month_policy || "last_day"]);
  if (p.frequency === "yearly" && p.anchor_date?.slice(5) === "02-29") out.push(FEB29_LABEL[p.feb29_policy || "feb28"] ?? "");
  if (p.frequency === "twice_monthly" && p.collision_policy) out.push(`Collision : ${COLLISION_LABEL[p.collision_policy]}`);
  if ((p.seasons ?? []).length) out.push(`Saison(s) : ${(p.seasons as { from: string; to: string }[]).map((s) => `${s.from} au ${s.to}`).join(" ; ")} (hors saison : aucune échéance, cadence d'origine conservée)`);
  out.push(`Date planifiée : ${SHIFT_LABEL[p.planned_shift || "none"]}`);
  return out.filter(Boolean);
}
