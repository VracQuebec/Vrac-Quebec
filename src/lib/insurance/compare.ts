// ASSUR-01 — logique pure (testable) : statuts, échéances, comparaison des soumissions.
export const TZ = "America/Toronto";
export const torontoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/** Mois calendaire en arrière, ramené au dernier jour du mois (31 mai − 3 mois = 28/29 février). */
export function minusMonths(iso: string, m: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1 - m, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/** Miroir de asr_occurrences (serveur = référence). */
export function occurrences(exp: string, notice?: string | null) {
  const m1 = minusMonths(exp, 1);
  const out = [{ code: "m3", on: minusMonths(exp, 3) }, { code: "m2", on: minusMonths(exp, 2) }, { code: "m1", on: m1 }];
  for (let d = addDays(m1, 7); d < exp; d = addDays(d, 7)) out.push({ code: "s" + d, on: d });
  out.push({ code: "j0", on: exp });
  if (notice && notice < exp) out.push({ code: "preavis_j14", on: addDays(notice, -14) }, { code: "preavis_j0", on: notice });
  return out.sort((a, b) => a.on.localeCompare(b.on));
}

export type PolicyStatus = "a_completer" | "a_venir" | "en_vigueur" | "echeance_proche" | "depassee";
export function policyStatus(p: { effective_from?: string | null; expires_on?: string | null }, today = torontoToday()): PolicyStatus {
  if (!p.expires_on) return "a_completer";
  if (p.effective_from && p.effective_from > today) return "a_venir";
  if (p.expires_on < today) return "depassee";
  return daysBetween(today, p.expires_on) <= 90 ? "echeance_proche" : "en_vigueur";
}
export const POLICY_STATUS: Record<PolicyStatus, { label: string; icon: string; cls: string }> = {
  a_completer: { label: "Échéance non renseignée", icon: "?", cls: "bg-muted text-muted-foreground" },
  a_venir: { label: "Période à venir", icon: "◷", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  en_vigueur: { label: "Période en cours (selon les dates saisies)", icon: "●", cls: "bg-primary/15 text-foreground" },
  echeance_proche: { label: "Échéance dans moins de 3 mois", icon: "!", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  depassee: { label: "Échéance dépassée — renouvellement à confirmer", icon: "✕", cls: "bg-destructive/15 text-destructive" },
};
export const STAGES: Record<string, string> = {
  a_preparer: "À préparer", magasinage: "En magasinage", soumissions_recues: "Soumissions reçues", choix_en_attente: "Choix en attente (confirmation en attente)",
  renouvellement_confirme: "Renouvellement confirmé", remplacement_confirme: "Remplacement confirmé", non_renouvellement: "Non-renouvellement déclaré",
};
export const CONTINUITY: Record<string, string> = {
  documentee: "Continuité documentée", intervalle: "Intervalle sans couverture documentée", a_confirmer: "Continuité à confirmer (heure ou date manquante)", non_documentee: "Continuité non documentée",
};
export const COV_STATE: Record<string, string> = { indique: "Indiqué au document", exclu: "Exclu explicitement", a_confirmer: "À confirmer", non_renseigne: "Non renseigné" };
export const DOC_TYPES: Record<string, string> = {
  police: "Police", avenant: "Avenant", certificat: "Certificat", preuve_provisoire: "Preuve provisoire", avis_renouvellement: "Avis de renouvellement",
  soumission: "Soumission", confirmation: "Confirmation écrite", correspondance: "Correspondance", autre: "Autre",
};
export const OCC_LABEL = (o: string) => {
  const c = o.split(":")[0];
  if (c === "m3") return "Rappel 3 mois"; if (c === "m2") return "Rappel 2 mois"; if (c === "m1") return "Rappel 1 mois";
  if (c.startsWith("s")) return "Rappel hebdomadaire"; if (c === "j0") return "Jour de l’échéance — continuité non documentée";
  if (c.startsWith("retard")) return "Échéance dépassée — renouvellement à confirmer";
  if (c === "continuite") return "Continuité à vérifier"; if (c.startsWith("preavis")) return "Préavis contractuel"; return "Rappel";
};

export type Quote = { id: string; insurer?: string | null; total?: number | null; currency?: string | null; cost_basis?: string | null; period_from?: string | null; period_to?: string | null; limit_amount?: number | null; deductible?: number | null; exclusions?: string | null };
export type Ref = { total?: number | null; currency?: string | null; cost_basis?: string | null; period_from?: string | null; period_to?: string | null; limit_amount?: number | null; deductible?: number | null };

const months = (a?: string | null, b?: string | null) => (a && b ? Math.round(daysBetween(a, b) / 30.44) : null);

/** Comparable seulement si même devise, même composition connue du coût et même durée. */
export function comparable(a: Ref, b: Ref): { ok: boolean; why?: string } {
  if (a.total == null || b.total == null) return { ok: false, why: "Coût manquant" };
  if ((a.currency ?? "CAD") !== (b.currency ?? "CAD")) return { ok: false, why: "Devises différentes" };
  if (!a.cost_basis || !b.cost_basis || a.cost_basis === "a_confirmer" || b.cost_basis === "a_confirmer") return { ok: false, why: "Composition du coût à confirmer" };
  if (a.cost_basis !== b.cost_basis) return { ok: false, why: "Composition du coût différente" };
  const ma = months(a.period_from, a.period_to), mb = months(b.period_from, b.period_to);
  if (ma == null || mb == null) return { ok: false, why: "Période manquante" };
  if (ma !== mb) return { ok: false, why: "Durées différentes" };
  return { ok: true };
}
export function diff(ref: Ref, q: Ref): { dollars: number; pct: number | null } | null {
  if (!comparable(ref, q).ok) return null;
  const d = Math.round(((q.total as number) - (ref.total as number)) * 100) / 100;
  return { dollars: d, pct: ref.total === 0 ? null : Math.round((d / (ref.total as number)) * 1000) / 10 };
}
/** Estimation annualisée, toujours identifiée comme estimation. */
export function annualized(q: Ref): number | null {
  const m = months(q.period_from, q.period_to);
  return q.total == null || !m ? null : Math.round(((q.total as number) * 12) / m);
}
/** Id de la soumission la moins chère, seulement si toutes les soumissions avec prix sont comparables entre elles. */
export function lowestComparable(qs: Quote[]): string | null {
  const priced = qs.filter((q) => q.total != null);
  if (priced.length < 2) return null;
  if (!priced.every((q) => comparable(priced[0], q).ok)) return null;
  return [...priced].sort((a, b) => (a.total as number) - (b.total as number))[0].id;
}
/** Alertes vs police actuelle : protection réduite, franchise augmentée, renseignement manquant. */
export function flags(ref: Ref, q: Quote): string[] {
  const f: string[] = [];
  if (q.limit_amount == null) f.push("Limite non renseignée");
  else if (ref.limit_amount != null && q.limit_amount < ref.limit_amount) f.push("Limite réduite");
  if (q.deductible == null) f.push("Franchise non renseignée");
  else if (ref.deductible != null && q.deductible > ref.deductible) f.push("Franchise augmentée");
  if (!q.exclusions) f.push("Exclusions non renseignées");
  return f;
}
export const money = (n?: number | null, c = "CAD") => (n == null ? "Inconnu" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: c || "CAD" }).format(n));
