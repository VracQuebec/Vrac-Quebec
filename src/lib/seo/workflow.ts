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
    case "local_potential":
      // Constat territoire × service : exécutable sur les pages existantes.
      return "titles_meta";
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

export type WorkNature = "action" | "verification";

/** Une carte est soit une ACTION exécutable, soit une VÉRIFICATION de diagnostic. */
export function natureOfType(type: string): WorkNature {
  return capabilityOfType(type) === "verification" ? "verification" : "action";
}

export const NATURE_LABEL: Record<WorkNature, string> = {
  action: "ACTION",
  verification: "VÉRIFICATION",
};

/** Vocabulaire d'état propre aux actions exécutables. */
export function actionStatusLabel(status: string): string {
  switch (status) {
    case "in_progress": return "En cours";
    case "completed": return "Terminée";
    case "error": return "À réessayer";
    case "dismissed": return "Ignorée";
    default: return "À travailler";
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
  id: string;
  slug: string;
  url: string;
  title: string | null;
  meta_title: string | null;
  meta_description: string | null;
  city_slug: string | null;
  service_slug: string | null;
  material_slug?: string | null;
  status?: string | null;
  noindex?: boolean | null;
  google_index_status?: string | null;
  qa_last_score?: number | null;
  qa_blockers?: unknown;
  intro?: string | null;
  word_count?: number | null;
  internal_links?: unknown;
  content_html?: string | null;
};

// ------------------------------------------------ référentiels officiels
// Les noms affichés proviennent TOUJOURS du référentiel (seo_cities,
// seo_services, seo_materials). Jamais d'une reconstruction depuis le slug :
// « sainte-anne-de-beaupre » ne doit jamais devenir « Sainte Anne de Beaupre ».

export type SeoReferential = {
  cities: Record<string, string>;
  services: Record<string, string>;
  materials: Record<string, string>;
  /** Couverture transporteur réellement configurée, clé `city` ou `city|service`. */
  coverage?: Record<string, boolean>;
};

export const EMPTY_REFERENTIAL: SeoReferential = { cities: {}, services: {}, materials: {}, coverage: {} };

const refName = (dict: Record<string, string>, slug: string | null | undefined): string | null => {
  if (!slug) return null;
  const v = dict[slug];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export function officialCity(slug: string | null | undefined, ref: SeoReferential = EMPTY_REFERENTIAL): string | null {
  return refName(ref.cities, slug);
}
export function officialService(slug: string | null | undefined, ref: SeoReferential = EMPTY_REFERENTIAL): string | null {
  return refName(ref.services, slug);
}
export function officialMaterial(slug: string | null | undefined, ref: SeoReferential = EMPTY_REFERENTIAL): string | null {
  return refName(ref.materials, slug);
}

/** Vrai uniquement si une couverture transporteur est réellement configurée. */
export function hasCarrierCoverage(
  page: Pick<EditablePage, "city_slug" | "service_slug">,
  ref: SeoReferential = EMPTY_REFERENTIAL,
): boolean {
  const cov = ref.coverage ?? {};
  if (!page.city_slug) return false;
  if (page.service_slug && cov[`${page.city_slug}|${page.service_slug}`] === true) return true;
  return cov[page.city_slug] === true;
}

export type MetaDraft = { title: string; meta_description: string; notes?: string[] };

export const TITLE_MIN = 25;
export const TITLE_MAX = 65;
export const META_MIN = 70;
export const META_MAX = 165;

const BRAND = " | Vrac Québec";

/**
 * Proposition déterministe construite UNIQUEMENT à partir des données réelles
 * de la page et des référentiels officiels. Le matériau d'une page
 * matériau × territoire reste toujours présent dans le titre et la meta.
 */
export function suggestMeta(page: EditablePage, ref: SeoReferential = EMPTY_REFERENTIAL): MetaDraft {
  const notes: string[] = [];
  const svc = officialService(page.service_slug, ref);
  const city = officialCity(page.city_slug, ref);
  const mat = officialMaterial(page.material_slug, ref);

  if (page.city_slug && !city) notes.push(`Territoire « ${page.city_slug} » absent du référentiel : le nom officiel n'est pas reconstruit.`);
  if (page.material_slug && !mat) notes.push(`Matériau « ${page.material_slug} » absent du référentiel : aucune proposition inventée.`);
  if (page.service_slug && !svc) notes.push(`Service « ${page.service_slug} » absent du référentiel.`);

  // Le sujet réel de la page : matériau prioritaire, sinon service.
  const subject = mat ?? svc;
  if (!subject && !city) {
    notes.push("Information insuffisante pour proposer cette modification automatiquement.");
    return { title: page.title ?? "", meta_description: page.meta_description ?? "", notes };
  }
  const base = subject && city ? `${subject} à ${city}` : subject ?? city!;
  const title = base.length + BRAND.length <= TITLE_MAX ? `${base}${BRAND}` : base;
  const meta = `${base} : demandez une soumission à Vrac Québec et obtenez une réponse rapide pour votre chantier.`;
  return { title, meta_description: meta.slice(0, META_MAX), notes };
}

export type ValidationIssue = { field: "title" | "meta_description"; message: string };

/**
 * Vérifie longueur, vide et doublons. `otherTitles` doit contenir les titres
 * des autres pages du lot ET des autres pages existantes (même matériau,
 * même territoire) pour éviter les titres identiques à grande échelle.
 */
export function validateMeta(draft: MetaDraft, otherTitles: string[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const title = draft.title.trim();
  const meta = draft.meta_description.trim();
  if (!title) issues.push({ field: "title", message: "Le titre est obligatoire." });
  else if (title.length < TITLE_MIN) issues.push({ field: "title", message: `Titre trop court (${title.length} caractères, minimum ${TITLE_MIN}).` });
  else if (title.length > TITLE_MAX) issues.push({ field: "title", message: `Titre trop long (${title.length} caractères, maximum ${TITLE_MAX}).` });
  if (title && otherTitles.some((t) => t.trim().toLowerCase() === title.toLowerCase())) {
    issues.push({ field: "title", message: "Ce titre est déjà utilisé par une autre page (lot, matériau ou territoire)." });
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
  status: "started" | "applied" | "failed" | "cancelled" | "dismissed" | "checked" | "issue" | "check_failed";
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

// =====================================================================
// Modes de travail additionnels : contenu, CTA, maillage interne.
// Tout est déterministe et construit uniquement à partir des données
// réelles de la page. Aucune URL, offre ou service inventé.
// =====================================================================

export type WorkMode = "titles_meta" | "content" | "cta" | "internal_links" | "publish";

export const MODE_LABEL: Record<WorkMode, string> = {
  titles_meta: "Titres et metas",
  content: "Renforcer le contenu",
  cta: "Renforcer le CTA",
  internal_links: "Renforcer le maillage interne",
  publish: "Publication",
};

/** Modes réellement exécutables pour un signal donné (le premier est le mode par défaut). */
export function availableModes(type: string): WorkMode[] {
  switch (type) {
    case "high_impr_low_ctr":
    case "ctr_top10":
    case "group_service":
    case "group_territory":
      return ["titles_meta", "content", "cta", "internal_links", "publish"];
    case "position_gain":
      return ["content", "titles_meta", "internal_links", "cta", "publish"];
    case "converting_page":
      return ["cta", "internal_links", "content", "titles_meta", "publish"];
    case "local_potential":
      return ["titles_meta", "content", "cta", "internal_links", "publish"];
    case "not_indexed":
    case "not_indexed_bulk":
    case "low_qa":
    case "cannibalization":
      return [];
    default:
      return [];
  }
}

// ------------------------------------------------------------------ contenu

export type ContentDraft = { intro: string; content_html: string };

export type ContentProposal = {
  draft: ContentDraft;
  additions: string[];
  notes: string[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function contentTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length;
}

export function contentWordCount(html: string): number {
  const t = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.split(" ").length : 0;
}

/** Signature générique d'un bloc : les noms propres sont retirés. */
export function contentBlockSignature(html: string, names: Array<string | null> = []): string {
  let t = html.replace(/<[^>]*>/g, " ");
  for (const n of names) if (n) t = t.split(n).join(" ");
  return t.toLowerCase().replace(/[^a-zà-ÿ0-9]+/gi, " ").replace(/\s+/g, " ").trim();
}

export type ContentProposalOptions = {
  /** Signatures des blocs déjà proposés sur d'autres pages du lot. */
  peerSignatures?: string[];
};

/**
 * Proposition de renforcement : le contenu existant est TOUJOURS conservé et
 * les sections proposées sont ajoutées à la suite. Un bloc n'est proposé que
 * s'il apporte une information réellement spécifique à la page (matériau,
 * service, territoire officiels) et qu'il n'a pas déjà été proposé à
 * l'identique sur une autre page. Aucune affirmation de couverture sans
 * donnée transporteur réelle.
 */
export function buildContentProposal(
  page: EditablePage,
  ref: SeoReferential = EMPTY_REFERENTIAL,
  opts: ContentProposalOptions = {},
): ContentProposal {
  const svc = officialService(page.service_slug, ref);
  const city = officialCity(page.city_slug, ref);
  const mat = officialMaterial(page.material_slug, ref);
  const subject = mat ?? svc;
  const current = page.content_html ?? "";
  const additions: string[] = [];
  const notes: string[] = [];
  const peers = new Set(opts.peerSignatures ?? []);
  const names = [city, svc, mat];

  const has = (needle: string) => current.toLowerCase().includes(needle.toLowerCase());
  const push = (html: string) => {
    const sig = contentBlockSignature(html, names);
    if (peers.has(sig)) {
      notes.push("Bloc identique déjà proposé sur une autre page : il n'est pas répété.");
      return;
    }
    peers.add(sig);
    additions.push(html);
  };

  if (!subject || !city) {
    notes.push("Information insuffisante pour proposer cette modification automatiquement.");
    return { draft: { intro: page.intro ?? "", content_html: current }, additions, notes };
  }

  const cible = `${subject} à ${city}`;

  if (!has("Comment ça fonctionne")) {
    push(
      `<h2>${esc(cible)} : comment ça fonctionne</h2>\n<p>Vous décrivez votre besoin (${esc(mat ? `quantité de ${mat.toLowerCase()}` : "matériau et quantité")}, adresse du chantier à ${esc(city)} et délai) dans le formulaire de demande. Vrac Québec transmet ensuite la demande et vous recevez une soumission.</p>`,
    );
  } else {
    notes.push("Une section « comment ça fonctionne » existe déjà : elle n'est pas dupliquée.");
  }

  if (!has("secteur desservi")) {
    if (hasCarrierCoverage(page, ref)) {
      push(
        `<h2>Secteur desservi</h2>\n<p>Les demandes de ${esc(subject.toLowerCase())} à ${esc(city)} sont prises en charge par des transporteurs configurés pour ce secteur.</p>`,
      );
    } else {
      notes.push("Aucune couverture transporteur configurée pour ce territoire : aucune affirmation de disponibilité locale n'est proposée.");
    }
  }

  if (!has("préparer votre demande")) {
    push(
      `<h2>Préparer votre demande de ${esc(subject.toLowerCase())} à ${esc(city)}</h2>\n<ul><li>${esc(mat ? `Quantité de ${mat.toLowerCase()} requise` : "Type de matériau et quantité approximative")}</li><li>Adresse exacte du chantier à ${esc(city)}</li><li>Accès au site et dates souhaitées</li></ul>`,
    );
  }

  if (additions.length === 0 && notes.length === 0) {
    notes.push("Le contenu couvre déjà les sections proposées : aucune addition automatique.");
  }

  const draft: ContentDraft = {
    intro: page.intro ?? "",
    content_html: additions.length ? `${current}${current.endsWith("\n") ? "" : "\n"}${additions.join("\n")}` : current,
  };
  return { draft, additions, notes };
}

export function validateContent(before: ContentDraft, draft: ContentDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!draft.content_html.trim()) {
    issues.push({ field: "title", message: "Le contenu ne peut pas être vidé." });
  } else if (contentTextLength(draft.content_html) < contentTextLength(before.content_html) * 0.8) {
    issues.push({ field: "title", message: "La proposition supprime plus de 20 % du contenu existant : vérifiez avant d'enregistrer." });
  }
  return issues;
}

export function contentDiffSummary(before: ContentDraft, after: ContentDraft) {
  return {
    wordsBefore: contentWordCount(before.content_html),
    wordsAfter: contentWordCount(after.content_html),
    addedWords: contentWordCount(after.content_html) - contentWordCount(before.content_html),
    introChanged: (before.intro ?? "") !== (after.intro ?? ""),
  };
}

// ---------------------------------------------------------------------- CTA

export const CTA_START = "<!--copilot:cta-->";
export const CTA_END = "<!--/copilot:cta-->";

export type CtaDraft = { text: string; href: string };

export type CtaDestination = { href: string; label: string };

/** Destinations RÉELLES du site — aucune URL inventée. */
export function ctaDestinations(page: Pick<EditablePage, "city_slug">): CtaDestination[] {
  const list: CtaDestination[] = [
    { href: "#soumission", label: "Formulaire de demande de cette page" },
    { href: "/soumission", label: "Assistant de soumission" },
    { href: "tel:+15819947717", label: "Appel téléphonique 581-994-7717" },
    { href: "https://wa.me/15819947717", label: "WhatsApp 581-994-7717" },
    { href: "/calculateur", label: "Calculateur de matériaux" },
    { href: "/materiaux", label: "Catalogue de matériaux" },
    { href: "/remblai", label: "Page remblai" },
    { href: "/demande-transport", label: "Demande de transport" },
  ];
  if (page.city_slug) list.push({ href: `/livraison/${page.city_slug}`, label: `Zone desservie — ${humanize(page.city_slug)}` });
  return list;
}

export function extractCta(html: string): CtaDraft | null {
  const i = html.indexOf(CTA_START);
  const j = html.indexOf(CTA_END);
  if (i === -1 || j === -1 || j < i) return null;
  const block = html.slice(i + CTA_START.length, j);
  const href = /href="([^"]*)"/.exec(block)?.[1] ?? "";
  const text = /<a[^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1]?.replace(/<[^>]*>/g, "").trim() ?? "";
  return { text, href };
}

export function buildCtaHtml(draft: CtaDraft): string {
  return `${CTA_START}<p class="copilot-cta"><a href="${draft.href}">${esc(draft.text)}</a></p>${CTA_END}`;
}

export function upsertCtaBlock(html: string, draft: CtaDraft): string {
  const block = buildCtaHtml(draft);
  const i = html.indexOf(CTA_START);
  const j = html.indexOf(CTA_END);
  if (i !== -1 && j !== -1 && j > i) return html.slice(0, i) + block + html.slice(j + CTA_END.length);
  return `${html}${html.endsWith("\n") ? "" : "\n"}${block}`;
}

export function suggestCta(page: EditablePage): CtaDraft {
  const svc = page.service_slug ? humanize(page.service_slug).toLowerCase() : null;
  const city = page.city_slug ? humanize(page.city_slug) : null;
  const text = svc && city
    ? `Demander une soumission pour ${svc} à ${city}`
    : `Demander une soumission à Vrac Québec`;
  return { text, href: "#soumission" };
}

export function validateCta(draft: CtaDraft, page: Pick<EditablePage, "city_slug">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const text = draft.text.trim();
  if (!text) issues.push({ field: "title", message: "Le texte du CTA est obligatoire." });
  else if (text.length > 80) issues.push({ field: "title", message: "Texte du CTA trop long (maximum 80 caractères)." });
  const allowed = ctaDestinations(page).map((d) => d.href);
  if (!draft.href) issues.push({ field: "meta_description", message: "La destination du CTA est obligatoire." });
  else if (!allowed.includes(draft.href)) {
    issues.push({ field: "meta_description", message: "Destination non disponible sur Vrac Québec — choisissez un parcours existant." });
  }
  return issues;
}

// -------------------------------------------------------- maillage interne

export type InternalLinkItem = { label: string; href: string; kind?: string };

export type LinkCandidate = {
  slug: string;
  title: string | null;
  city_slug: string | null;
  service_slug: string | null;
};

export type LinkSuggestion = InternalLinkItem & {
  city: string | null;
  service: string | null;
  reason: string;
};

export function currentInternalLinks(page: EditablePage): InternalLinkItem[] {
  const raw = page.internal_links;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = r as Record<string, unknown>;
      const href = typeof o.href === "string" ? o.href : null;
      const label = typeof o.label === "string" ? o.label : href;
      if (!href || !label) return null;
      const item: InternalLinkItem = { label, href };
      if (typeof o.kind === "string") item.kind = o.kind;
      return item;
    })
    .filter((x): x is InternalLinkItem => x !== null);
}

/** Suggestions issues UNIQUEMENT de pages SEO réellement présentes en base. */
export function suggestInternalLinks(page: EditablePage, candidates: LinkCandidate[], limit = 12): LinkSuggestion[] {
  const existing = new Set(currentInternalLinks(page).map((l) => l.href));
  const out: LinkSuggestion[] = [];
  for (const c of candidates) {
    if (!c.slug || c.slug === page.slug) continue;
    const href = `/${c.slug}`;
    if (existing.has(href)) continue;
    const sameCity = Boolean(page.city_slug && c.city_slug === page.city_slug);
    const sameService = Boolean(page.service_slug && c.service_slug === page.service_slug);
    if (!sameCity && !sameService) continue;
    const reason = sameCity && sameService
      ? "Même territoire et même service"
      : sameCity
        ? `Même territoire (${humanize(page.city_slug!)}), service complémentaire`
        : `Même service (${humanize(page.service_slug!)}), autre territoire`;
    out.push({
      label: c.title ?? humanize(c.slug),
      href,
      kind: "seo_page",
      city: c.city_slug,
      service: c.service_slug,
      reason,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function mergeInternalLinks(current: InternalLinkItem[], added: InternalLinkItem[]): InternalLinkItem[] {
  const seen = new Set(current.map((l) => l.href));
  const merged = [...current];
  for (const l of added) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    merged.push(l);
  }
  return merged;
}

export function validateInternalLinks(added: InternalLinkItem[], knownSlugs: string[]): ValidationIssue[] {
  const known = new Set(knownSlugs.map((s) => `/${s}`));
  const issues: ValidationIssue[] = [];
  for (const l of added) {
    if (!known.has(l.href)) issues.push({ field: "title", message: `Lien inconnu : ${l.href} ne correspond à aucune page SEO existante.` });
  }
  return issues;
}

// ======================================================================
// F. PUBLICATION — action sensible : jamais automatique.
// ======================================================================

export type PublishState = {
  isDraft: boolean;
  isPublished: boolean;
  label: string;
  /** Vrai quand l'action « Publier » a un effet réel sur cette page. */
  canPublish: boolean;
};

export function publishState(page: Pick<EditablePage, "status">): PublishState {
  const status = (page.status ?? "").toLowerCase();
  const isPublished = status === "published";
  const isDraft = !isPublished;
  return {
    isDraft,
    isPublished,
    canPublish: isDraft,
    label: isPublished
      ? "Page publiée — toute modification est immédiatement visible en ligne"
      : `Brouillon (statut « ${page.status ?? "inconnu"} ») — non visible en ligne`,
  };
}

export function validatePublish(page: EditablePage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!(page.title ?? "").trim()) issues.push({ field: "title", message: "Impossible de publier : la page n'a pas de titre." });
  if (!(page.meta_description ?? "").trim()) issues.push({ field: "meta_description", message: "Impossible de publier : la page n'a pas de meta description." });
  if (contentTextLength(page.content_html ?? "") < 200) {
    issues.push({ field: "title", message: "Impossible de publier : contenu insuffisant (moins de 200 caractères)." });
  }
  return issues;
}

// ======================================================================
// 16. PROTECTION CONTRE LES MODIFICATIONS CONCURRENTES
// ======================================================================

/** Champs opérationnels comparés avant toute écriture. */
export const CONCURRENCY_FIELDS = ["title", "meta_description", "intro", "content_html", "internal_links", "status"] as const;

export function pageFingerprint(page: Partial<EditablePage>): string {
  return CONCURRENCY_FIELDS
    .map((f) => {
      const v = (page as Record<string, unknown>)[f];
      if (v == null) return "";
      return typeof v === "string" ? v : JSON.stringify(v);
    })
    .join("\u0000");
}

/**
 * Compare l'état chargé dans le panneau et l'état actuel en base.
 * Retourne un message bloquant si la page a changé entre-temps.
 */
export function detectConcurrentChange(
  loaded: Partial<EditablePage> | null,
  current: Partial<EditablePage> | null,
): string | null {
  if (!current) return "La page n'existe plus en base : relancez une analyse.";
  if (!loaded) return "État de référence introuvable : rechargez l'opportunité.";
  if (pageFingerprint(loaded) === pageFingerprint(current)) return null;
  const changed = CONCURRENCY_FIELDS.filter((f) => {
    const a = (loaded as Record<string, unknown>)[f];
    const b = (current as Record<string, unknown>)[f];
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  });
  return `Modification concurrente détectée (${changed.join(", ")}) : rechargez l'opportunité avant d'écrire.`;
}

// ======================================================================
// 8. RESTAURATION SÉCURISÉE d'une modification appliquée
// ======================================================================

export type RestorablePayload = Record<string, unknown> | null | undefined;

export type RestorePlan = {
  update: Record<string, unknown>;
  summary: string;
};

/**
 * Construit la restauration à partir du `before_data` réellement journalisé.
 * Aucune valeur inventée : seuls les champs présents dans l'historique sont rétablis.
 */
export function buildRestorePlan(before: RestorablePayload, slug?: string | null): RestorePlan | null {
  if (!before || typeof before !== "object") return null;
  const update: Record<string, unknown> = {};
  const parts: string[] = [];
  const b = before as Record<string, unknown>;

  if ("title" in b) { update.title = b.title ?? null; parts.push("titre"); }
  if ("meta_description" in b) { update.meta_description = b.meta_description ?? null; parts.push("meta description"); }
  if ("intro" in b) { update.intro = b.intro ?? null; parts.push("intro"); }
  if ("content_html" in b) {
    update.content_html = b.content_html ?? null;
    update.word_count = contentWordCount(typeof b.content_html === "string" ? b.content_html : "");
    parts.push("contenu");
  }
  if ("internal_links" in b && Array.isArray(b.internal_links)) {
    update.internal_links = b.internal_links;
    update.internal_link_count = (b.internal_links as unknown[]).length;
    parts.push("liens internes");
  }
  if ("status" in b) { update.status = b.status ?? null; parts.push("statut de publication"); }
  if ("cta" in b && !("content_html" in b)) {
    // Le CTA est stocké dans le contenu : sans `content_html` la restauration est impossible.
    return null;
  }
  if (Object.keys(update).length === 0) return null;
  return { update, summary: `${slug ? `/${slug} — ` : ""}restaurer ${parts.join(", ")}` };
}

export function canRestore(log: { status: string; before_data?: RestorablePayload; page_id?: string | null }): boolean {
  if (log.status !== "applied") return false;
  if (!log.page_id) return false;
  return buildRestorePlan(log.before_data) !== null;
}
