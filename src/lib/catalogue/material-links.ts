// Les matériaux SEO (seo_materials) et les fiches du catalogue (jsc_materials, /materiaux/:slug)
// sont deux référentiels distincts. Ce pont relie un matériau SEO à une fiche existante
// seulement quand le produit est le même ; sinon aucun lien (jamais de fiche vide).
const SEO_TO_FICHE: Record<string, string> = {
  sable: "sable",
  "terre-tamisee": "terre-tamisee",
  "poussiere-de-pierre": "poussiere-de-pierre",
  "gravier-0-3-4": "pierre-concassee-0-3-4",
  "pierre-nette": "pierre-concassee-3-4-net",
};

/** Lien vers la fiche si elle existe dans le catalogue public, sinon null. */
export function materialFicheHref(seoSlug: string, ficheSlugs: ReadonlySet<string>): string | null {
  const target = SEO_TO_FICHE[seoSlug] ?? seoSlug;
  return ficheSlugs.has(target) ? `/materiaux/${target}` : null;
}
