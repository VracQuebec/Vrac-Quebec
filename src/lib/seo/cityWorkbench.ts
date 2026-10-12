// Poste de travail d'une ville : UNE ligne par combinaison du catalogue (page ville, matériaux, services),
// avec son état, sa disponibilité, ses problèmes précis et la SEULE action manuelle possible.
// Pur et testable : aucune écriture, aucun appel IA. Les actions sont lancées par l'administrateur.
import { classify, catKey, publishGate, type CatState, type CatInput, type DraftForGate } from "./catalogStatus";
import { availabilityOf, type Decision } from "./slotDecisions";
import { MAX_ATTEMPTS } from "../../../prepared/seo-generator/_shared/seo-repair-guard";

export type WbAction = "generate" | "repair" | "autofix" | "publish" | "decide" | "none";
export type Availability = "confirmee" | "exclue" | "inconnue";

export type WbItem = { kind: "hub" | "material" | "service"; slug: string | null; label: string; status: string };
export type WbDraft = DraftForGate & { id: string; updated_at?: string; material_slug?: string | null; service_slug?: string | null };
export type WbPublished = { slug: string; noindex: boolean | null; material_slug?: string | null; service_slug?: string | null };
export type WbProblem = { kind: string; material_slug: string | null; service_slug: string | null; gen_state: string; issues: string[] | null; task_attempts: number | null; task_error?: string | null };

export type WbRow = {
  key: string; kind: WbItem["kind"]; slug: string | null; label: string;
  state: CatState; availability: Availability;
  pageSlug: string | null; pageId: string | null; noindexVolontaire: boolean;
  attempts: number;
  /** Problèmes précis (génération, qualité, disponibilité). */
  problems: string[];
  action: WbAction;
  /** Action secondaire possible (ex. corriger la qualité d'un brouillon en erreur sans IA). */
  alt: WbAction | null;
  /** Pourquoi aucune action, ou ce qui bloque la publication. */
  blocked: string | null;
};

// Problèmes de qualité qu'une correction automatique SANS IA peut traiter.
const AUTOFIXABLE = /(Titre SEO|Meta description|H1|Liens internes|nom de la ville)/;

const itemKey = (kind: string, m?: string | null, s?: string | null) =>
  catKey(kind, kind === "material" ? m ?? null : kind === "service" ? s ?? null : null);
const kindOf = (d: { material_slug?: string | null; service_slug?: string | null }) =>
  d.material_slug ? "material" : d.service_slug ? "service" : "hub";

export function buildWorkbench(input: {
  cityName: string; items: WbItem[]; cat: CatInput;
  drafts: WbDraft[]; published: WbPublished[]; problems: WbProblem[];
  decisionOf: (kind: string, slug: string | null) => Decision | undefined;
  excluded: Set<string>; slugCopies: Map<string, number>;
}): WbRow[] {
  const draftBy = new Map(input.drafts.map((d) => [itemKey(kindOf(d), d.material_slug, d.service_slug), d]));
  const pubBy = new Map(input.published.map((p) => [itemKey(kindOf(p), p.material_slug, p.service_slug), p]));
  const probBy = new Map(input.problems.map((p) => [itemKey(p.kind, p.material_slug, p.service_slug), p]));
  return input.items.map((it) => {
    const key = catKey(it.kind, it.slug);
    const draft = draftBy.get(key) ?? null;
    const pub = pubBy.get(key) ?? null;
    const prob = probBy.get(key) ?? null;
    const page = draft ? { status: draft.status, noindex: draft.noindex } : pub ? { status: "published", noindex: pub.noindex } : null;
    const state = classify({ kind: it.kind, slug: it.slug, page }, input.cat);
    const excl = it.kind !== "hub" && input.excluded.has(key);
    const availability: Availability = excl ? "exclue" : availabilityOf(it, input.decisionOf(it.kind, it.slug));
    const attempts = prob?.task_attempts ?? 0;
    const row: WbRow = {
      key, kind: it.kind, slug: it.slug, label: it.label, state, availability,
      pageSlug: draft?.slug ?? pub?.slug ?? null, pageId: draft?.id ?? null,
      noindexVolontaire: !!draft?.noindex_volontaire, attempts,
      problems: [], action: "none", alt: null, blocked: null,
    };
    const availReason = availability === "exclue" ? "Combinaison exclue pour cette ville."
      : availability === "inconnue" ? "Disponibilité inconnue — décision requise." : null;

    if (pub) { row.blocked = "En ligne — protégée (aucune modification automatique)."; return row; }

    if (!draft) {
      if (prob?.task_error) row.problems.push(`Erreur de génération : ${prob.task_error}`);
      if (state === "pending") { row.blocked = "Génération en cours."; return row; }
      if (availability === "exclue") { row.blocked = availReason; return row; }
      if (availability === "inconnue") { row.problems.push(availReason!); row.action = "decide"; return row; }
      row.action = "generate"; return row;
    }

    // Brouillon existant : qualité + disponibilité.
    const gate = publishGate(draft, { cityName: input.cityName, slugCopies: input.slugCopies.get(draft.slug) ?? 1, removeGenerationNoindex: true });
    row.problems.push(...gate);
    for (const x of prob?.issues ?? []) if (!row.problems.includes(x)) row.problems.push(`Contrôle serveur : ${x}`);
    if (availReason) row.problems.push(availReason);
    const fixable = gate.some((r) => AUTOFIXABLE.test(r));
    const repairable = state === "draft_error" && !draft.noindex_volontaire && attempts < MAX_ATTEMPTS;

    if (draft.noindex_volontaire) row.blocked = "Noindex volontaire — décision distincte requise.";
    if (gate.length === 0 && !availReason && !draft.noindex_volontaire) { row.action = "publish"; return row; }
    if (repairable) { row.action = "repair"; row.alt = fixable ? "autofix" : null; }
    else if (fixable) row.action = "autofix";
    else if (availReason && availability === "inconnue") row.action = "decide";
    if (state === "draft_error" && attempts >= MAX_ATTEMPTS) row.problems.push(`Limite de ${MAX_ATTEMPTS} régénérations atteinte — correction manuelle requise.`);
    if (row.action === "none" && !row.blocked) row.blocked = availReason ?? "Correction manuelle du contenu requise (texte trop court ou promesse non confirmée).";
    if (row.action !== "decide" && availability === "inconnue" && row.alt === null) row.alt = "decide";
    return row;
  });
}

export const ACTION_LABEL: Record<WbAction, string> = {
  generate: "Générer", repair: "Régénérer (IA)", autofix: "Corriger la qualité (sans IA)",
  publish: "Publier", decide: "Décider la disponibilité", none: "—",
};

export function summarizeWorkbench(rows: WbRow[]) {
  const n = (f: (r: WbRow) => boolean) => rows.filter(f).length;
  return {
    total: rows.length,
    published: n((r) => r.state.startsWith("published")),
    drafts: n((r) => !!r.pageId),
    missing: n((r) => !r.pageSlug && r.state !== "excluded_missing"),
    genErrors: n((r) => r.state === "failed" || r.state === "stalled" || r.state === "draft_error"),
    qualityErrors: n((r) => !!r.pageId && r.problems.some((p) => !/Disponibilité|exclue/.test(p))),
    unknown: n((r) => r.availability === "inconnue" && !r.state.startsWith("published")),
    excluded: n((r) => r.availability === "exclue"),
    byAction: Object.fromEntries((["generate", "repair", "autofix", "publish", "decide"] as WbAction[]).map((a) => [a, n((r) => r.action === a || r.alt === a)])) as Record<WbAction, number>,
  };
}
