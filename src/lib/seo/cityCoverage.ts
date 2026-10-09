// Couverture SEO RÉELLE d'une ville — logique PURE (aucune écriture, aucun appel réseau).
// Dénominateur = catalogue SEO actif (page ville + matériaux actifs + services actifs).
// Une page existante ne devient JAMAIS « prévue » du seul fait d'exister : elle est classée
// « hors critères » si aucune donnée ou configuration ne la justifie.

export type CoverageRaw = {
  city_slug: string;
  city_name: string | null;
  materials: Array<{ slug: string; name: string; keys: string[] | null }>;
  services: Array<{ slug: string; name: string }>;
  territory_services: Array<{ key: string; status: string; requests: number }>;
  terms: Array<{ raw: string; slug: string; count: number }>;
  pages: Array<{ slug: string; status: string; noindex: boolean | null; published_at: string | null; material_slug: string | null; service_slug: string | null }>;
  /** Demandes distinctes « Terre / Terre mélangée » au contexte clairement remblai (règle validée, calculée côté lecture). */
  terre_remblai?: number;
};

export const TERRE_REMBLAI_LABEL = "Terre / Terre mélangée (remblai confirmé, demandes)";

export type ItemStatus =
  | "covered"          // page publiée, opportunité pertinente
  | "draft"            // page en brouillon, opportunité pertinente
  | "covered_equiv"    // page existante, matériau demandé sous un nom équivalent (à confirmer)
  | "off_criteria"     // page existante sans critère qui la justifie
  | "to_develop"       // prévue, aucune page
  | "to_develop_equiv" // demandé sous un nom équivalent, aucune page (à confirmer)
  | "not_configured"   // service réglé « non configuré » dans le territoire
  | "not_requested"    // matériau jamais demandé / service configuré sans demande
  | "not_linked";      // service SEO sans rattachement territorial

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  covered: "Couvert",
  draft: "En brouillon",
  covered_equiv: "Correspondance à confirmer — page existante",
  off_criteria: "Hors critères",
  to_develop: "À développer",
  to_develop_equiv: "Correspondance à confirmer",
  not_configured: "Service non configuré",
  not_requested: "Non demandé",
  not_linked: "Non applicable — aucun rattachement territorial",
};

export type CoverageItem = {
  kind: "hub" | "material" | "service";
  slug: string | null;
  label: string;
  status: ItemStatus;
  reason: string;
  page: CoverageRaw["pages"][number] | null;
  published: boolean;
  /** Demandes sources (termes saisis) et correspondance utilisée, si applicable. */
  sources: Array<{ raw: string; count: number; match: "exact" | "equiv" }>;
};

export type TermMatch = { raw: string; slug: string; count: number; match: "exact" | "equiv" | "none"; material: string | null };

/** Clé de service territorial → slug du service SEO (même correspondance que le Générateur). */
export function territoryKeyToSeo(key: string): string {
  switch (key) {
    case "recherche_dompe": return "dompe";
    case "point_de_depot":
    case "disposition_remblai": return "recherche-point-de-depot";
    case "transport": return "transport-vrac";
    case "courtage_materiaux": return "courtage-materiaux";
    default: return key.replace(/_/g, "-");
  }
}

const singular = (slug: string) => slug.split("-").map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w)).join("-");

/** Rapproche un terme demandé d'un matériau du catalogue : exact, équivalent (pluriel / précision ajoutée) ou aucun. */
export function matchTerm(slug: string, materials: CoverageRaw["materials"]): { match: TermMatch["match"]; material: string | null } {
  for (const m of materials) if ((m.keys ?? []).includes(slug)) return { match: "exact", material: m.slug };
  const s = singular(slug);
  for (const m of materials) if ((m.keys ?? []).some((k) => singular(k) === s)) return { match: "equiv", material: m.slug };
  // Précision ajoutée au nom du catalogue (ex. « pierre-concassee-0-3-4 » → « pierre-concassee ») : le plus long gagne.
  let best: string | null = null; let bestLen = 0;
  for (const m of materials) for (const k of m.keys ?? []) {
    const ks = singular(k);
    if ((s.startsWith(ks + "-")) && ks.length > bestLen) { best = m.slug; bestLen = ks.length; }
  }
  return best ? { match: "equiv", material: best } : { match: "none", material: null };
}

const isPublished = (p: CoverageRaw["pages"][number]) => p.status === "published" || !!p.published_at;

export function computeCoverage(raw: CoverageRaw) {
  const baseTerms = [...raw.terms];
  if ((raw.terre_remblai ?? 0) > 0) baseTerms.push({ raw: TERRE_REMBLAI_LABEL, slug: "remblai", count: raw.terre_remblai! });
  const terms: TermMatch[] = baseTerms.map((t) => ({ ...t, ...matchTerm(t.slug, raw.materials) }));
  const pageFor = (m: string | null, s: string | null) =>
    raw.pages.find((p) => (p.material_slug ?? null) === m && (p.service_slug ?? null) === s) ?? null;

  const items: CoverageItem[] = [];
  const hub = pageFor(null, null);
  items.push({ kind: "hub", slug: null, label: "Page ville", page: hub, sources: [], published: !!hub && isPublished(hub),
    status: hub ? (isPublished(hub) ? "covered" : "draft") : "to_develop", reason: "Toujours prévue pour une municipalité active." });

  for (const m of raw.materials) {
    const page = pageFor(m.slug, null);
    const exact = terms.filter((t) => t.match === "exact" && t.material === m.slug);
    const equiv = terms.filter((t) => t.match === "equiv" && t.material === m.slug);
    let status: ItemStatus; let reason: string;
    if (exact.length) { status = page ? (isPublished(page) ? "covered" : "draft") : "to_develop"; reason = `Demandé : ${exact.map((t) => `« ${t.raw} »`).join(", ")}.`; }
    else if (equiv.length) { status = page ? "covered_equiv" : "to_develop_equiv"; reason = `Nom équivalent à confirmer : ${equiv.map((t) => `« ${t.raw} »`).join(", ")}.`; }
    else if (page) { status = "off_criteria"; reason = "La page existe, mais aucune demande de la ville ne mentionne ce matériau."; }
    else { status = "not_requested"; reason = "Aucune demande de la ville ne mentionne ce matériau."; }
    items.push({ kind: "material", slug: m.slug, label: m.name, status, reason, page,
      sources: [...exact, ...equiv].map((t) => ({ raw: t.raw, count: t.count, match: t.match as "exact" | "equiv" })), published: !!page && isPublished(page) });
  }

  for (const s of raw.services) {
    const page = pageFor(null, s.slug);
    const links = raw.territory_services.filter((t) => territoryKeyToSeo(t.key) === s.slug);
    const configured = links.filter((t) => t.status === "ACTIVE" || t.status === "PARTIELLE");
    const planned = configured.some((t) => t.requests > 0);
    let status: ItemStatus; let reason: string;
    if (planned) { status = page ? (isPublished(page) ? "covered" : "draft") : "to_develop"; reason = "Service configuré dans le territoire, avec demandes."; }
    else if (page) { status = "off_criteria"; reason = links.length ? "La page existe, mais le service n'est pas configuré ou n'a aucune demande." : "La page existe, mais le service n'est rattaché à aucune configuration du territoire."; }
    else if (configured.length) { status = "not_requested"; reason = "Service configuré, mais aucune demande enregistrée."; }
    else if (links.length) { status = "not_configured"; reason = "Service réglé « non configuré » dans le territoire — à configurer, aucune page à créer."; }
    else { status = "not_linked"; reason = "Aucune configuration territoriale ne correspond à ce service."; }
    items.push({ kind: "service", slug: s.slug, label: s.name, status, reason, page,
      sources: links.filter((t) => t.requests > 0).map((t) => ({ raw: `${t.key} (${t.status})`, count: t.requests, match: "exact" as const })), published: !!page && isPublished(page) });
  }

  const has = (st: ItemStatus[]) => items.filter((i) => st.includes(i.status));
  const existingItems = items.filter((i) => i.page);
  const catalogPageIds = new Set(existingItems.map((i) => i.page!.slug));
  const outsideCatalog = raw.pages.filter((p) => !catalogPageIds.has(p.slug));

  // Services configurés avec demandes, mais sans service SEO correspondant dans le catalogue :
  // jamais comptés comme opportunités (aucune correspondance autorisée), signalés à valider.
  const seoSlugs = new Set(raw.services.map((x) => x.slug));
  const unmappedServices = raw.territory_services
    .filter((t) => (t.status === "ACTIVE" || t.status === "PARTIELLE") && t.requests > 0 && !seoSlugs.has(territoryKeyToSeo(t.key)))
    .map((t) => ({ key: t.key, status: t.status, requests: t.requests }));

  const territoryUnconfigured = raw.territory_services
    .filter((t) => !(t.status === "ACTIVE" || t.status === "PARTIELLE"))
    .map((t) => t.key);
  const territoryConfigured = raw.territory_services
    .filter((t) => t.status === "ACTIVE" || t.status === "PARTIELLE")
    .map((t) => t.key);

  return {
    items,
    terms,
    possible: items.length,
    existing: raw.pages.length,
    existingInCatalog: existingItems.length,
    published: raw.pages.filter(isPublished).length,
    drafts: raw.pages.filter((p) => !isPublished(p)).length,
    /** Potentiel théorique du catalogue (jamais un objectif). */
    theoretical: items.length,
    /** Opportunités SEO pertinentes : page ville + matériaux demandés (nom exact) + services configurés avec demandes. */
    planned: has(["covered", "draft", "to_develop"]).length,
    /** Couvertes = pages PUBLIÉES seulement; les brouillons restent comptés à part. */
    plannedCovered: has(["covered"]).length,
    plannedDrafts: has(["draft"]).length,
    toConfirm: has(["covered_equiv", "to_develop_equiv"]).length,
    offCriteria: has(["off_criteria"]).length + outsideCatalog.length,
    toDevelop: has(["to_develop"]).length,
    notConfigured: has(["not_configured"]).length,
    outsideCatalog,
    unmappedServices,
    territoryConfigured,
    territoryUnconfigured,
  };
}

/** Couverture affichée sur la carte d'une ville : pages existantes sur possibilités du catalogue. */
export function coverageLabel(existing: number, possible: number): string {
  return `${existing} / ${possible}`;
}
export function coveragePct(existing: number, possible: number): number {
  return possible > 0 ? Math.min(100, Math.round((existing / possible) * 100)) : 0;
}

// ── Moteur global : mêmes règles pour toutes les municipalités actives ──

export type CoverageAllRaw = {
  computed_at: string;
  materials: CoverageRaw["materials"];
  services: CoverageRaw["services"];
  cities: Array<Omit<CoverageRaw, "materials" | "services">>;
};

export type Coverage = ReturnType<typeof computeCoverage>;

/** Découpe la lecture globale en lectures par ville, sans aucune règle propre à une ville. */
export function splitAll(all: CoverageAllRaw): CoverageRaw[] {
  return all.cities.map((c) => ({ ...c, materials: all.materials, services: all.services }));
}

export type CoverageBadge = "covered" | "to_develop" | "drafts";
export const COVERAGE_BADGE_LABEL: Record<CoverageBadge, string> = {
  covered: "COUVERTE",
  drafts: "PAGES EN BROUILLON",
  to_develop: "OPPORTUNITÉS À DÉVELOPPER",
};

/** Statut d'une ville, fondé uniquement sur les opportunités pertinentes (jamais sur la file du Générateur). */
export function coverageFlags(c: Coverage) {
  return {
    badge: (c.toDevelop > 0 ? "to_develop" : c.plannedDrafts > 0 ? "drafts" : "covered") as CoverageBadge,
    toConfigure: c.notConfigured > 0,
    toValidate: c.toConfirm > 0 || c.unmappedServices.length > 0,
    offCriteria: c.offCriteria > 0,
  };
}

/**
 * Ancien compteur du Générateur (« X / X ») : il ajoutait chaque page existante au total.
 * Une ville est suspecte quand cet ancien ratio paraît complet alors que la couverture réelle
 * comporte des pages hors critères, des opportunités non couvertes ou des éléments à valider.
 */
export function suspiciousLegacyRatio(legacy: { planned: number; generated: number }, c: Coverage): string[] {
  if (legacy.planned === 0 || legacy.generated !== legacy.planned) return [];
  const why: string[] = [];
  if (c.offCriteria > 0) why.push(`${c.offCriteria} page(s) hors critères incluses dans l'ancien total`);
  if (c.toDevelop > 0) why.push(`${c.toDevelop} opportunité(s) non couverte(s)`);
  if (c.toConfirm > 0) why.push(`${c.toConfirm} correspondance(s) à confirmer`);
  if (c.unmappedServices.length > 0) why.push(`${c.unmappedServices.length} service(s) configuré(s) sans page SEO correspondante`);
  return why;
}
