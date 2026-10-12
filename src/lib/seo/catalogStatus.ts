// Couverture RÉELLE du catalogue (28 combinaisons par ville : page ville, 17 matériaux, 10 services).
// Chaque combinaison reçoit UN seul état (aucun double comptage), avec une règle commune à toutes les villes.
// La file du Générateur n'est qu'une source parmi d'autres : une file vide ne rend jamais une ville « couverte ».
import { findUnverifiedClaims } from "../../../supabase/functions/_shared/seo-claims";

export type CatState =
  | "published_indexable" | "published_noindex"
  | "draft_ready" | "draft_noindex" | "draft_error"
  | "pending" | "stalled" | "failed"
  | "missing_confirmed" | "missing_unknown"
  | "excluded_missing";

export const CAT_STATE_LABEL: Record<CatState, string> = {
  published_indexable: "Publiées et indexables",
  published_noindex: "Publiées volontairement en noindex",
  draft_ready: "Brouillons prêts à publier",
  draft_noindex: "Brouillons noindex (décision requise)",
  draft_error: "Brouillons en erreur",
  pending: "Générations en cours",
  stalled: "Générations interrompues (à reprendre)",
  failed: "Échecs de génération (à reprendre)",
  missing_confirmed: "Manquantes — disponibilité confirmée",
  missing_unknown: "Manquantes — disponibilité inconnue",
  excluded_missing: "Exclues explicitement (sans page)",
};

export type CatItem = {
  kind: "hub" | "material" | "service";
  slug: string | null;
  page: { status: string; noindex: boolean | null } | null;
};

export type CatInput = {
  items: CatItem[];
  /** Clés « kind|slug » des combinaisons présentes dans la file du Générateur (disponibilité confirmée). */
  queueKeys: Set<string>;
  /** Clés des brouillons signalés en erreur par le contrôle serveur. */
  draftErrorKeys: Set<string>;
  pendingKeys: Set<string>;
  stalledKeys: Set<string>;
  failedKeys: Set<string>;
  /** Exclusions actives « kind|slug ». */
  excluded: Set<string>;
};

export const catKey = (kind: string, slug: string | null) => `${kind}|${slug ?? ""}`;

export function classify(it: CatItem, i: CatInput): CatState {
  const k = catKey(it.kind, it.slug);
  if (it.page) {
    if (it.page.status === "published") return it.page.noindex ? "published_noindex" : "published_indexable";
    if (i.draftErrorKeys.has(k)) return "draft_error";
    if (it.page.noindex) return "draft_noindex";
    return "draft_ready";
  }
  if (i.pendingKeys.has(k)) return "pending";
  if (i.stalledKeys.has(k)) return "stalled";
  if (i.failedKeys.has(k)) return "failed";
  if (it.kind !== "hub" && i.excluded.has(k)) return "excluded_missing";
  if (i.queueKeys.has(k) || it.kind === "hub") return "missing_confirmed";
  return "missing_unknown";
}

export type CatSummary = Record<CatState, number> & {
  total: number;
  /** Combinaisons exclues mais dont une page existe déjà (conservées, à décider). */
  excludedExisting: number;
  /** Couverture réelle : publiées (indexables + noindex volontaire) / catalogue hors exclusions sans page. */
  coveredPct: number;
  complete: boolean;
};

export function emptySummary(): CatSummary {
  const z = Object.fromEntries(Object.keys(CAT_STATE_LABEL).map((s) => [s, 0])) as Record<CatState, number>;
  return { ...z, total: 0, excludedExisting: 0, coveredPct: 0, complete: false };
}

export function summarizeCatalog(i: CatInput): CatSummary {
  const s = emptySummary();
  for (const it of i.items) {
    s[classify(it, i)] += 1;
    s.total += 1;
    if (it.page && it.kind !== "hub" && i.excluded.has(catKey(it.kind, it.slug))) s.excludedExisting += 1;
  }
  return finalize(s);
}

function finalize(s: CatSummary): CatSummary {
  const target = s.total - s.excluded_missing;
  const covered = s.published_indexable + s.published_noindex;
  s.coveredPct = target > 0 ? Math.round((covered / target) * 1000) / 10 : 0;
  s.complete = target > 0 && covered === target;
  return s;
}

export function mergeSummaries(list: CatSummary[]): CatSummary {
  const s = emptySummary();
  for (const x of list) {
    for (const k of Object.keys(CAT_STATE_LABEL) as CatState[]) s[k] += x[k];
    s.total += x.total; s.excludedExisting += x.excludedExisting;
  }
  return finalize(s);
}

/** Coût IA estimé (crédits) : une génération ≈ 0,05 crédit, mesuré lors de l'essai réel de 3 pages. */
export const CREDIT_PER_PAGE = 0.05;
export const estimateCredits = (pages: number) => Math.round(pages * CREDIT_PER_PAGE * 100) / 100;

// ── Contrôle avant publication (pur, testable) ──

export type DraftForGate = {
  slug: string; status: string; noindex: boolean | null;
  meta_title: string | null; meta_description: string | null; h1: string | null; title: string | null;
  content_html: string | null; word_count: number | null; internal_link_count: number | null;
};

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const TECH = /(lorem ipsum|\bundefined\b|\[object |\{\{|\}\}|\bTODO\b|\bnull\b|<script)/i;

export function publishGate(p: DraftForGate, ctx: { cityName: string; slugCopies: number }): string[] {
  const r: string[] = [];
  if (p.status === "published") return ["Déjà publiée — ignorée (publication idempotente)."];
  if (p.noindex) r.push("Noindex volontaire — ne sera pas retiré automatiquement; décision explicite requise.");
  const title = (p.meta_title || p.title || "").trim();
  if (title.length < 30) r.push("Titre SEO trop court ou absent.");
  if ((p.meta_description ?? "").trim().length < 70) r.push("Meta description trop courte ou absente.");
  if (!(p.h1 ?? "").trim()) r.push("H1 absent.");
  const city = norm(ctx.cityName);
  if (city && (!norm(title).includes(city) || !norm(p.h1 ?? "").includes(city))) r.push(`Titre ou H1 sans le nom de la ville (${ctx.cityName}).`);
  const html = p.content_html ?? "";
  if ((p.word_count ?? 0) < 300 || html.replace(/<[^>]+>/g, " ").trim().length < 1500) r.push("Contenu vide ou insuffisant.");
  if (TECH.test(html) || TECH.test(title) || TECH.test(p.h1 ?? "")) r.push("Texte technique ou incomplet détecté.");
  if ((p.internal_link_count ?? 0) < 2) r.push("Liens internes insuffisants.");
  for (const h of findUnverifiedClaims(html)) r.push(`Promesse non confirmée : ${h.reason} (« ${h.excerpt} »).`);
  if (ctx.slugCopies > 1) r.push("Collision de slug (URL en double).");
  return r;
}
