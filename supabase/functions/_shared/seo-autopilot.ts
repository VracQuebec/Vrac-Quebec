// Traitement automatique « START — Compléter le SEO » : règles pures, testables sans base ni IA.
// Une combinaison = une seule tâche par traitement. Jamais de disponibilité inventée :
// seule la disponibilité « confirmee » renvoyée par le serveur (preuve ou décision enregistrée) est traitée.

export type Slot = { kind: string; material_slug: string | null; service_slug: string | null; availability: string };
export type PageRef = { id: string; slug: string; status: string; material_slug: string | null; service_slug: string | null };

export type PlannedTask = {
  kind: "auto_generate" | "auto_finish" | "auto_wait" | "auto_excluded";
  status: "queued" | "skipped";
  material_slug: string | null; service_slug: string | null;
  page_id: string | null; page_slug: string | null;
  outcome: string | null; last_error: string | null; step: string;
};

const key = (m: string | null, s: string | null) => `${m ?? ""}::${s ?? ""}`;

export const WAIT_REASON = "Disponibilité inconnue — aucune preuve ni décision enregistrée. En attente d'une preuve commerciale.";
export const EXCLUDED_REASON = "Combinaison exclue — jamais générée ni publiée.";

export function planCityTasks(slots: Slot[], pages: PageRef[]): PlannedTask[] {
  const byKey = new Map<string, PageRef>();
  for (const p of pages) {
    const k = key(p.material_slug, p.service_slug);
    const cur = byKey.get(k);
    if (!cur || (p.status === "published" && cur.status !== "published")) byKey.set(k, p);
  }
  const seen = new Set<string>();
  const out: PlannedTask[] = [];
  for (const s of slots) {
    const k = key(s.material_slug, s.service_slug);
    if (seen.has(k)) continue;
    seen.add(k);
    const page = byKey.get(k) ?? null;
    if (page?.status === "published") continue; // en ligne : protégée, rien à faire
    const base = { material_slug: s.material_slug, service_slug: s.service_slug, page_id: page?.id ?? null, page_slug: page?.slug ?? null };
    if (s.availability === "exclue") { out.push({ ...base, kind: "auto_excluded", status: "skipped", outcome: "excluded", last_error: EXCLUDED_REASON, step: "exclue" }); continue; }
    if (s.availability !== "confirmee") { out.push({ ...base, kind: "auto_wait", status: "skipped", outcome: "waiting_evidence", last_error: WAIT_REASON, step: "en attente de preuve" }); continue; }
    out.push({ ...base, kind: page ? "auto_finish" : "auto_generate", status: "queued", outcome: null, last_error: null, step: "en file" });
  }
  return out;
}

/** Arrêt du traitement complet : crédits épuisés / accès refusé (hors refus de disponibilité). */
export function isCircuitBreak(status: number, error: string | undefined): boolean {
  if (status === 402) return true;
  if (status === 403 && !/Disponibilit|exclue/i.test(error ?? "")) return true;
  return false;
}

export function finalOutcome(o: { generated: boolean; fixed: boolean; published: boolean }): string {
  if (o.published) return o.generated ? "generated_published" : o.fixed ? "fixed_published" : "published";
  if (o.generated) return "generated";
  if (o.fixed) return "fixed";
  return "kept_draft";
}
