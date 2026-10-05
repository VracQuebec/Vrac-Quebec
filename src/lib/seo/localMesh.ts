// Maillage local entre VRAIES pages SEO d'une même ville (jamais vers les pages de secours).
// Familles d'intention : regroupent les pages qui se recoupent pour qu'elles se lient entre elles.
export type LocalPageRef = { slug: string; title: string; service_slug: string | null; material_slug: string | null };

const FAMILIES: Record<string, string[]> = {
  sable: ["livraison-sable", "sable"],
  gravier: ["livraison-gravier", "gravier", "gravier-0-3-4", "mg-20", "mg-56"],
  pierre: ["livraison-pierre", "pierre", "pierre-concassee", "pierre-nette", "roche", "poussiere-de-pierre"],
  terre: ["livraison-terre", "terre-tamisee"],
  evacuation: ["dompe", "recherche-point-de-depot", "remblai", "terre-contaminee", "beton", "asphalte", "brique", "neige"],
  travaux: ["transport-vrac", "excavation", "nivellement", "courtage-materiaux"],
};

export function familyOf(key: string | null): string | null {
  if (!key) return null;
  for (const [f, keys] of Object.entries(FAMILIES)) if (keys.includes(key)) return f;
  return null;
}

const keyOf = (p: LocalPageRef) => p.service_slug || p.material_slug;

/** Liens contextuels pour une page enfant : page ville + dompe + transport + pages de la même famille (max 6). */
export function childLinks(current: LocalPageRef, all: LocalPageRef[]): LocalPageRef[] {
  const others = all.filter((p) => p.slug !== current.slug);
  const pillar = others.find((p) => !keyOf(p));
  const fam = familyOf(keyOf(current));
  const anchors = ["dompe", "transport-vrac"].map((k) => others.find((p) => keyOf(p) === k));
  const siblings = others.filter((p) => fam && familyOf(keyOf(p)) === fam);
  const out: LocalPageRef[] = [];
  for (const p of [pillar, ...anchors, ...siblings]) {
    if (p && !out.some((o) => o.slug === p.slug)) out.push(p);
    if (out.length >= 6) break;
  }
  return out;
}

/** Page ville : toutes les vraies pages de la ville, groupées services / matériaux. */
export function pillarGroups(all: LocalPageRef[]) {
  return {
    services: all.filter((p) => p.service_slug),
    materials: all.filter((p) => p.material_slug),
  };
}
