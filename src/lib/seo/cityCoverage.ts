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
};

export type ItemStatus =
  | "covered"          // page existante, prévue par les données/configurations
  | "covered_equiv"    // page existante, matériau demandé sous un nom équivalent (à confirmer)
  | "off_criteria"     // page existante sans critère qui la justifie
  | "to_develop"       // prévue, aucune page
  | "to_develop_equiv" // demandé sous un nom équivalent, aucune page (à confirmer)
  | "not_configured"   // service réglé « non configuré » dans le territoire
  | "not_requested"    // matériau jamais demandé / service configuré sans demande
  | "not_linked";      // service SEO sans rattachement territorial

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  covered: "Couverte",
  covered_equiv: "Couverte — nom équivalent",
  off_criteria: "Existante hors critères",
  to_develop: "À développer",
  to_develop_equiv: "À développer — équivalence à confirmer",
  not_configured: "Service non configuré",
  not_requested: "Non demandé",
  not_linked: "Non rattaché au territoire",
};

export type CoverageItem = {
  kind: "hub" | "material" | "service";
  slug: string | null;
  label: string;
  status: ItemStatus;
  reason: string;
  page: CoverageRaw["pages"][number] | null;
  published: boolean;
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
  const terms: TermMatch[] = raw.terms.map((t) => ({ ...t, ...matchTerm(t.slug, raw.materials) }));
  const pageFor = (m: string | null, s: string | null) =>
    raw.pages.find((p) => (p.material_slug ?? null) === m && (p.service_slug ?? null) === s) ?? null;

  const items: CoverageItem[] = [];
  const hub = pageFor(null, null);
  items.push({ kind: "hub", slug: null, label: "Page ville", page: hub, published: !!hub && isPublished(hub),
    status: hub ? "covered" : "to_develop", reason: "Toujours prévue pour une municipalité active." });

  for (const m of raw.materials) {
    const page = pageFor(m.slug, null);
    const exact = terms.filter((t) => t.match === "exact" && t.material === m.slug);
    const equiv = terms.filter((t) => t.match === "equiv" && t.material === m.slug);
    let status: ItemStatus; let reason: string;
    if (exact.length) { status = page ? "covered" : "to_develop"; reason = `Demandé : ${exact.map((t) => `« ${t.raw} »`).join(", ")}.`; }
    else if (equiv.length) { status = page ? "covered_equiv" : "to_develop_equiv"; reason = `Nom équivalent à confirmer : ${equiv.map((t) => `« ${t.raw} »`).join(", ")}.`; }
    else if (page) { status = "off_criteria"; reason = "La page existe, mais aucune demande de la ville ne mentionne ce matériau."; }
    else { status = "not_requested"; reason = "Aucune demande de la ville ne mentionne ce matériau."; }
    items.push({ kind: "material", slug: m.slug, label: m.name, status, reason, page, published: !!page && isPublished(page) });
  }

  for (const s of raw.services) {
    const page = pageFor(null, s.slug);
    const links = raw.territory_services.filter((t) => territoryKeyToSeo(t.key) === s.slug);
    const configured = links.filter((t) => t.status === "ACTIVE" || t.status === "PARTIELLE");
    const planned = configured.some((t) => t.requests > 0);
    let status: ItemStatus; let reason: string;
    if (planned) { status = page ? "covered" : "to_develop"; reason = "Service configuré dans le territoire, avec demandes."; }
    else if (page) { status = "off_criteria"; reason = links.length ? "La page existe, mais le service n'est pas configuré ou n'a aucune demande." : "La page existe, mais le service n'est rattaché à aucune configuration du territoire."; }
    else if (configured.length) { status = "not_requested"; reason = "Service configuré, mais aucune demande enregistrée."; }
    else if (links.length) { status = "not_configured"; reason = "Service réglé « non configuré » dans le territoire — à configurer, aucune page à créer."; }
    else { status = "not_linked"; reason = "Aucune configuration territoriale ne correspond à ce service."; }
    items.push({ kind: "service", slug: s.slug, label: s.name, status, reason, page, published: !!page && isPublished(page) });
  }

  const has = (st: ItemStatus[]) => items.filter((i) => st.includes(i.status));
  const existingItems = items.filter((i) => i.page);
  const catalogPageIds = new Set(existingItems.map((i) => i.page!.slug));
  const outsideCatalog = raw.pages.filter((p) => !catalogPageIds.has(p.slug));

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
    planned: has(["covered", "to_develop"]).length,
    plannedCovered: has(["covered"]).length,
    offCriteria: has(["off_criteria"]).length + outsideCatalog.length,
    toDevelop: has(["to_develop", "to_develop_equiv"]).length,
    notConfigured: has(["not_configured"]).length,
    outsideCatalog,
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
