// Exécution des opportunités du Copilote SEO.
// Ce module est PUR (aucun appel réseau) : il décrit quoi faire, sur quelles
// pages, et valide les modifications proposées. Le moteur de détection, le
// scoring et le regroupement ne sont pas touchés.

import type { ActionGroup } from "@/lib/seo/actionGroups";
import { humanize } from "@/lib/seo/actionGroups";

export type WorkCapability = "titles_meta" | "content" | "internal_links" | "verification" | "not_configured";

export type OpportunityStatus = "open" | "in_progress" | "completed" | "dismissed" | "error";

/** Capacité d'exécution réellement disponible pour un signal donné. */
export function capabilityOfType(type: string): WorkCapability {
  switch (type) {
    case "high_impr_low_ctr":
    case "ctr_top10":
    case "group_service":
    case "group_territory":
      return "titles_meta";
    case "position_gain":
      return "content";
    case "converting_page":
      return "internal_links";
    case "not_indexed":
    case "not_indexed_bulk":
    case "low_qa":
    case "cannibalization":
      return "verification";
    default:
      return "not_configured";
  }
}

export function capabilityOfGroup(group: Pick<ActionGroup, "primary">): WorkCapability {
  return capabilityOfType(group.primary.type);
}

export const CAPABILITY_LABEL: Record<WorkCapability, string> = {
  titles_meta: "Titres et metas",
  content: "Contenu de la page",
  internal_links: "CTA et maillage interne",
  verification: "Vérification",
  not_configured: "Action à configurer",
};

/** Le bouton n'est jamais décoratif : son libellé dépend du statut réel. */
export function workButtonLabel(status: string, capability: WorkCapability): string {
  if (capability === "not_configured") return "Action à configurer";
  switch (status) {
    case "in_progress": return "Continuer";
    case "completed": return "Voir le travail";
    case "error": return "Réessayer";
    case "dismissed": return "Voir";
    default: return "Travailler";
  }
}

export type StatusEvent = "work" | "applied" | "failed" | "dismiss" | "reopen";

/** Cycle de vie : OPEN → IN_PROGRESS → COMPLETED / ERROR, OPEN → IGNORED. */
export function nextStatus(current: string, event: StatusEvent): OpportunityStatus {
  switch (event) {
    case "work":
      return current === "completed" ? "completed" : "in_progress";
    case "applied": return "completed";
    case "failed": return "error";
    case "dismiss": return "dismissed";
    case "reopen": return "open";
  }
}

// ---------------------------------------------------------------- titres/metas

export type EditablePage = {
  page_id: string;
  slug: string;
  url: string;
  title: string | null;
  meta_title: string | null;
  meta_description: string | null;
  city_slug: string | null;
  service_slug: string | null;
  status?: string | null;
  noindex?: boolean | null;
  google_index_status?: string | null;
  qa_last_score?: number | null;
  qa_blockers?: unknown;
  intro?: string | null;
  word_count?: number | null;
  internal_links?: unknown;
};

export type MetaDraft = { title: string; meta_description: string };

export const TITLE_MIN = 25;
export const TITLE_MAX = 65;
export const META_MIN = 70;
export const META_MAX = 165;

/**
 * Proposition déterministe construite UNIQUEMENT à partir des données réelles
 * de la page (service, territoire, titre existant). Aucune offre ni promesse
 * inventée.
 */
export function suggestMeta(page: EditablePage): MetaDraft {
  const svc = page.service_slug ? humanize(page.service_slug) : null;
  const city = page.city_slug ? humanize(page.city_slug) : null;
  const base = svc && city ? `${svc} à ${city}` : svc ?? city ?? (page.title ?? page.slug);
  const title = `${base} | Vrac Québec`;
  const meta = svc && city
    ? `${svc} à ${city} : demandez une soumission à Vrac Québec et obtenez une réponse rapide pour votre chantier.`
    : `${base} : demandez une soumission à Vrac Québec et obtenez une réponse rapide pour votre chantier.`;
  return { title: title.slice(0, TITLE_MAX), meta_description: meta.slice(0, META_MAX) };
}

export type ValidationIssue = { field: "title" | "meta_description"; message: string };

/** Vérifie longueur, vide et doublons entre pages du lot. */
export function validateMeta(draft: MetaDraft, otherTitles: string[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const title = draft.title.trim();
  const meta = draft.meta_description.trim();
  if (!title) issues.push({ field: "title", message: "Le titre est obligatoire." });
  else if (title.length < TITLE_MIN) issues.push({ field: "title", message: `Titre trop court (${title.length} caractères, minimum ${TITLE_MIN}).` });
  else if (title.length > TITLE_MAX) issues.push({ field: "title", message: `Titre trop long (${title.length} caractères, maximum ${TITLE_MAX}).` });
  if (title && otherTitles.some((t) => t.trim().toLowerCase() === title.toLowerCase())) {
    issues.push({ field: "title", message: "Ce titre est déjà utilisé par une autre page du lot." });
  }
  if (!meta) issues.push({ field: "meta_description", message: "La meta description est obligatoire." });
  else if (meta.length < META_MIN) issues.push({ field: "meta_description", message: `Meta trop courte (${meta.length} caractères, minimum ${META_MIN}).` });
  else if (meta.length > META_MAX) issues.push({ field: "meta_description", message: `Meta trop longue (${meta.length} caractères, maximum ${META_MAX}).` });
  return issues;
}

export function hasChanges(page: EditablePage, draft: MetaDraft): boolean {
  return (page.title ?? "") !== draft.title || (page.meta_description ?? "") !== draft.meta_description;
}

// ------------------------------------------------------------------- lot

export type BatchItemStatus = "pending" | "running" | "done" | "error" | "skipped";

export type BatchItem = {
  page_id: string;
  slug: string;
  status: BatchItemStatus;
  error?: string | null;
};

export function buildBatchPlan(pageIds: string[], selected: Set<string> | string[], slugBy: Record<string, string> = {}): BatchItem[] {
  const sel = selected instanceof Set ? selected : new Set(selected);
  return pageIds.map((id) => ({
    page_id: id,
    slug: slugBy[id] ?? id,
    status: sel.has(id) ? "pending" : "skipped",
  }));
}

export function applyBatchResult(items: BatchItem[], pageId: string, ok: boolean, error?: string): BatchItem[] {
  return items.map((it) => (it.page_id === pageId ? { ...it, status: ok ? "done" : "error", error: ok ? null : (error ?? "Erreur inconnue") } : it));
}

export function batchProgress(items: BatchItem[]): { done: number; errors: number; total: number; finished: boolean } {
  const total = items.filter((i) => i.status !== "skipped").length;
  const done = items.filter((i) => i.status === "done").length;
  const errors = items.filter((i) => i.status === "error").length;
  return { done, errors, total, finished: done + errors >= total && total > 0 };
}

/** Réessai : seules les pages en erreur repassent en attente, les réussites sont conservées. */
export function retryErrors(items: BatchItem[]): BatchItem[] {
  return items.map((it) => (it.status === "error" ? { ...it, status: "pending", error: null } : it));
}

// ------------------------------------------------------------ vérifications

export type CheckResult = { label: string; ok: boolean | null; detail: string };

/** Vérifications factuelles issues des champs réels de la page. */
export function runVerification(page: EditablePage): CheckResult[] {
  const checks: CheckResult[] = [];
  checks.push({
    label: "Page publiée",
    ok: page.status === "published",
    detail: page.status ? `statut « ${page.status} »` : "statut inconnu",
  });
  checks.push({
    label: "Balise robots",
    ok: page.noindex ? false : true,
    detail: page.noindex ? "noindex actif" : "indexation autorisée",
  });
  checks.push({
    label: "Indexation Google connue",
    ok: page.google_index_status ? page.google_index_status.toLowerCase().includes("index") && !page.google_index_status.toLowerCase().includes("not") : null,
    detail: page.google_index_status ?? "aucun statut Search Console enregistré",
  });
  checks.push({
    label: "Score QA",
    ok: page.qa_last_score == null ? null : page.qa_last_score >= 90,
    detail: page.qa_last_score == null ? "aucun score QA enregistré" : `${page.qa_last_score}/100`,
  });
  const blockers = Array.isArray(page.qa_blockers) ? page.qa_blockers : [];
  checks.push({
    label: "Blocages QA",
    ok: blockers.length === 0,
    detail: blockers.length === 0 ? "aucun blocage" : `${blockers.length} blocage(s)`,
  });
  return checks;
}

// ------------------------------------------------------------ journalisation

export type WorkLogEntry = {
  opportunity_id: string;
  action_key: string;
  action_kind: string;
  action_type: string;
  capability: WorkCapability;
  status: "started" | "applied" | "failed" | "cancelled" | "dismissed";
  page_id: string | null;
  page_slug: string | null;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  error: string | null;
  note: string | null;
};

export function buildLogEntry(
  group: ActionGroup,
  partial: Pick<WorkLogEntry, "status"> & Partial<WorkLogEntry>,
): WorkLogEntry {
  return {
    opportunity_id: group.primary.id,
    action_key: group.key,
    action_kind: group.kind,
    action_type: group.primary.type,
    capability: capabilityOfGroup(group),
    page_id: null,
    page_slug: null,
    before_data: {},
    after_data: {},
    error: null,
    note: null,
    ...partial,
  };
}
