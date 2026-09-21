// Regroupement d'opportunités en ACTIONS DISTINCTES (présentation uniquement).
// Aucune opportunité n'est supprimée ni modifiée : ce module ne fait que
// regrouper, dédupliquer et prioriser l'affichage du Top 10.
// Règle absolue : aucune donnée inventée — une valeur absente reste `null`.

import type { Opportunity } from "@/lib/seo/useCopilot";

export type ActionKind = "page" | "territoire_service" | "service" | "groupe" | "technique";

export type ActionGroup = {
  key: string;
  /** Opportunité la plus concrète du groupe : l'action à faire en premier. */
  primary: Opportunity;
  members: Opportunity[];
  kind: ActionKind;
  /** Titre d'action VERBE + OBJET + CIBLE, jamais un simple nom de service ou de ville. */
  title: string;
  /** Titre original du signal, conservé tel quel. */
  signalTitle: string;
  /** Intervention courte et exécutable (« Revoir le title et la meta description »). */
  actionLabel: string;
  /** Action détaillée issue du signal. */
  recommendedAction: string | null;
  reason: string | null;
  score: number;
  priority: Opportunity["priority"];
  service: string | null;
  city: string | null;
  /** Nombre d'interventions réellement distinctes dans ce groupe. */
  distinctActions: number;
  singleAction: boolean;
  pages: number;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  position: number | null;
  conversions: number | null;
  /** Constats plus larges rattachés (service ou territoire) — informatif. */
  relatedGroups: Opportunity[];
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

export function serviceOf(o: Opportunity): string | null {
  const d = (o.data ?? {}) as Record<string, unknown>;
  return o.target_service_slug ?? str(d.service_slug) ?? str(d.service) ?? null;
}

export function cityOf(o: Opportunity): string | null {
  const d = (o.data ?? {}) as Record<string, unknown>;
  return o.target_city_slug ?? str(d.city_slug) ?? str(d.city) ?? null;
}

/** Deux opportunités ne partagent une action que si le couple service/territoire est identique. */
export function actionKeyOf(o: Opportunity): string {
  const service = serviceOf(o);
  const city = cityOf(o);
  if (o.type === "group_service" && service) return `svc:${service}`;
  if (o.type === "group_territory" && city) return `city:${city}`;
  if (service && city) return `svc:${service}|city:${city}`;
  if (service) return `svc:${service}`;
  if (city) return `city:${city}`;
  return `opp:${o.id}`;
}

export function kindOf(o: Opportunity): ActionKind {
  if (o.type === "group_service") return "service";
  if (o.type === "group_territory") return "groupe";
  if (o.type === "not_indexed_bulk") return "technique";
  if (o.page_id || o.url) return "page";
  if (o.category === "territoire_service" || o.type === "local_potential") return "territoire_service";
  if (o.category === "technique" || o.category === "indexation") return "technique";
  return "groupe";
}

/** Plus la valeur est basse, plus l'action est concrète (donc prioritaire dans son groupe). */
const CONCRETENESS: Record<ActionKind, number> = {
  page: 0,
  territoire_service: 1,
  technique: 2,
  service: 3,
  groupe: 4,
};

/** Slug → libellé lisible (« sainte-foy-sillery-cap-rouge » → « Sainte-Foy-Sillery-Cap-Rouge »). */
export function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length <= 2 && w !== "mg" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("-")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nom lisible de la cible d'un signal de page (sans préfixe d'action ni suffixe de marque). */
export function pageLabel(o: Opportunity): string {
  const raw = o.title ?? "";
  const afterDash = raw.includes("—") ? raw.split("—").slice(1).join("—") : raw;
  const clean = afterDash.split("|")[0].trim();
  if (clean) return clean;
  return o.entity_slug ? humanize(o.entity_slug) : raw.trim();
}

/** Intervention courte et exécutable, déduite du signal réel (jamais inventée). */
export function actionLabelOf(o: Opportunity): string {
  switch (o.type) {
    case "high_impr_low_ctr":
    case "ctr_top10":
      return "Revoir le title et la meta description";
    case "position_gain":
      return "Renforcer le contenu de la page";
    case "converting_page":
      return "Renforcer le CTA et le maillage interne";
    case "not_indexed":
    case "not_indexed_bulk":
      return "Vérifier l'indexation";
    case "low_qa":
      return "Corriger les problèmes techniques détectés";
    case "cannibalization":
      return "Vérifier une possible cannibalisation";
    case "local_potential":
      return "Renforcer le service dans ce territoire";
    case "group_service":
    case "group_territory":
      return "Harmoniser les titles et metas du lot";
    default:
      return "Revoir la page selon le signal détecté";
  }
}

/** Titre d'action VERBE + OBJET + CIBLE — jamais un simple nom de service ou de ville. */
export function actionTitleOf(o: Opportunity, kind: ActionKind, service: string | null, city: string | null): string {
  const svc = service ? humanize(service) : null;
  const ville = city ? humanize(city) : null;

  if (kind === "service" && svc) return `Optimiser les titres et metas des pages ${svc}`;
  if (kind === "groupe" && ville) return `Optimiser les pages du territoire ${ville}`;
  if (kind === "territoire_service" && svc && ville) return `Optimiser les pages ${svc} à ${ville}`;
  if (kind === "technique" && !o.page_id && !o.url) return "Vérifier l'indexation des pages publiées non indexées";

  const cible = pageLabel(o);
  switch (o.type) {
    case "high_impr_low_ctr":
    case "ctr_top10":
      return `Optimiser le title et la meta de la page ${cible}`;
    case "position_gain":
      return `Renforcer le contenu de la page ${cible}`;
    case "converting_page":
      return `Renforcer la page qui convertit ${cible}`;
    case "low_qa":
      return `Corriger la qualité SEO de la page ${cible}`;
    case "not_indexed":
      return `Vérifier l'indexation de la page ${cible}`;
    case "cannibalization":
      return `Vérifier la cannibalisation autour de ${cible}`;
    default:
      return `Optimiser la page ${cible}`;
  }
}

/** Normalise une action pour comparer deux recommandations équivalentes. */
export function normalizeAction(a: string | null | undefined): string {
  return (a ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sumOrNull(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

export function buildActionGroups(opportunities: Opportunity[]): ActionGroup[] {
  const buckets = new Map<string, Opportunity[]>();
  for (const o of opportunities) {
    const key = actionKeyOf(o);
    const list = buckets.get(key);
    if (list) list.push(o);
    else buckets.set(key, [o]);
  }

  const groups: ActionGroup[] = [];
  for (const [key, members] of buckets) {
    const sorted = [...members].sort(
      (a, b) =>
        CONCRETENESS[kindOf(a)] - CONCRETENESS[kindOf(b)] ||
        b.score - a.score ||
        a.id.localeCompare(b.id),
    );
    const primary = sorted[0];

    // Données agrégées : uniquement ce qui est réellement mesuré.
    const dataOf = (o: Opportunity) => (o.data ?? {}) as Record<string, unknown>;
    const impressions = sumOrNull(sorted.map((o) => num(dataOf(o).impressions)));
    const clicks = sumOrNull(sorted.map((o) => num(dataOf(o).clicks)));
    const conversions = sumOrNull(sorted.map((o) => num(dataOf(o).conversions)));

    // Position pondérée par les impressions, seulement si les deux existent.
    let weight = 0;
    let weighted = 0;
    for (const o of sorted) {
      const p = num(dataOf(o).position);
      const i = num(dataOf(o).impressions);
      if (p != null && i != null && i > 0) { weighted += p * i; weight += i; }
    }
    const position = weight > 0 ? weighted / weight : num(dataOf(primary).position);

    const pageKeys = new Set<string>();
    for (const o of sorted) {
      if (o.page_id) pageKeys.add(o.page_id);
      else if (o.url) pageKeys.add(o.url);
      const p = num(dataOf(o).pages);
      if (!o.page_id && !o.url && p != null) for (let i = 0; i < p; i++) pageKeys.add(`${o.id}#${i}`);
    }

    const distinctActions = new Set(
      sorted.map((o) => normalizeAction(o.recommended_action)).filter((a) => a !== ""),
    ).size || 1;

    const kind = kindOf(primary);
    const service = serviceOf(primary);
    const city = cityOf(primary);
    const baseReason = primary.reason ?? primary.rationale ?? null;
    const reason = sorted.length > 1 && baseReason
      ? `${baseReason} ${sorted.length} signaux du même territoire/service ont été regroupés en une seule action.`
      : baseReason;

    groups.push({
      key,
      primary,
      members: sorted,
      kind,
      title: actionTitleOf(primary, kind, service, city),
      signalTitle: primary.title,
      actionLabel: actionLabelOf(primary),
      recommendedAction: primary.recommended_action,
      reason,
      score: Math.max(...sorted.map((o) => o.score)),
      priority: primary.priority,
      service,
      city,
      distinctActions,
      singleAction: distinctActions === 1,
      pages: pageKeys.size,
      impressions,
      clicks,
      ctr: impressions != null && impressions > 0 && clicks != null ? clicks / impressions : null,
      position,
      conversions,
      relatedGroups: sorted.filter((o) => o !== primary && (kindOf(o) === "groupe" || kindOf(o) === "service")),
    });
  }

  // Constats plus larges (service / territoire) rattachés en information.
  const byService = new Map<string, ActionGroup>();
  const byCity = new Map<string, ActionGroup>();
  for (const g of groups) {
    if (g.key.startsWith("svc:") && !g.key.includes("|") && g.service) byService.set(g.service, g);
    if (g.key.startsWith("city:") && g.city) byCity.set(g.city, g);
  }
  for (const g of groups) {
    if (!g.key.includes("|")) continue;
    const svc = g.service ? byService.get(g.service) : undefined;
    const city = g.city ? byCity.get(g.city) : undefined;
    for (const wider of [svc, city]) {
      if (wider && wider !== g) g.relatedGroups = [...g.relatedGroups, wider.primary];
    }
  }

  // Score d'abord ; à score égal, l'action la plus concrète, puis celle liée à
  // une conversion réelle, puis celle rattachée à un territoire/service réel.
  return groups.sort(
    (a, b) =>
      b.score - a.score ||
      CONCRETENESS[a.kind] - CONCRETENESS[b.kind] ||
      (b.conversions ?? 0) - (a.conversions ?? 0) ||
      Number(Boolean(b.city && b.service)) - Number(Boolean(a.city && a.service)) ||
      a.key.localeCompare(b.key),
  );
}

/** Top N des ACTIONS distinctes (jamais plusieurs lignes pour la même intervention). */
export function topActions(opportunities: Opportunity[], n = 10): ActionGroup[] {
  return buildActionGroups(opportunities).slice(0, n);
}
