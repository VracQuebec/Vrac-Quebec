// Copilote SEO — logique pure de pertinence et de priorisation.
// Aucun accès réseau ni Deno : ce module est testé directement par Vitest
// (src/test/seo-copilot-scoring.test.ts) et importé par l'edge function.
// Règle absolue : aucune donnée inventée. Une valeur absente reste absente.

export type SignalType =
  | "high_impr_low_ctr"
  | "ctr_top10"
  | "position_gain"
  | "not_indexed"
  | "not_indexed_bulk"
  | "converting_page"
  | "local_potential"
  | "low_qa"
  | "cannibalization"
  | "group_service"
  | "group_territory";

export type SignalCategory =
  | "ctr"
  | "position"
  | "conversion"
  | "indexation"
  | "technique"
  | "cannibalisation"
  | "territoire_service"
  | "groupe";

/** Facteur explicite ayant contribué au score (« Pourquoi cette priorité ? »). */
export type ScoreFactor = { label: string; points: number };

/** Contexte mesuré d'un signal. `null` = donnée absente, jamais remplacée par 0. */
export type SignalContext = {
  type: SignalType;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  position: number | null;
  conversions: number | null;
  qa: number | null;
  indexed: boolean | null;
  noindex?: boolean | null;
  wordCount?: number | null;
  internalLinks?: number | null;
  serviceSlug?: string | null;
  citySlug?: string | null;
  /** Nombre d'URLs publiées ciblant la même intention (risque de cannibalisation). */
  siblingPages?: number | null;
  /** Nombre de pages couvertes par un signal de groupe. */
  groupPages?: number | null;
};

export const CATEGORY_OF: Record<SignalType, SignalCategory> = {
  high_impr_low_ctr: "ctr",
  ctr_top10: "ctr",
  position_gain: "position",
  not_indexed: "indexation",
  not_indexed_bulk: "indexation",
  converting_page: "conversion",
  local_potential: "territoire_service",
  low_qa: "technique",
  cannibalization: "cannibalisation",
  group_service: "groupe",
  group_territory: "groupe",
};

/**
 * Priorité stratégique des services réellement pertinents pour Vrac Québec.
 * `haute` = cœur commercial, `moyenne` = service secondaire, `faible` = éditorial/outil.
 * Un service inconnu n'est jamais supposé opérationnel : il reste « moyenne ».
 */
export const SERVICE_PRIORITY: Record<string, "haute" | "moyenne" | "faible"> = {
  remblai: "haute",
  "recherche-remblai": "haute",
  dompe: "haute",
  "recherche-point-de-depot": "haute",
  "depot-materiaux": "haute",
  "disposition-materiaux": "haute",
  "transport-vrac": "haute",
  livraison: "haute",
  "livraison-pierre": "haute",
  materiaux: "haute",
  excavation: "moyenne",
  nivellement: "moyenne",
  "courtage-materiaux": "moyenne",
  local: "moyenne",
  blog: "faible",
  guide: "faible",
  calculateur: "faible",
};

export function servicePriority(slug: string | null | undefined): "haute" | "moyenne" | "faible" {
  if (!slug) return "moyenne";
  return SERVICE_PRIORITY[slug] ?? "moyenne";
}

/** Seuils minimums de fiabilité, par type de signal. */
const MIN_IMPRESSIONS: Partial<Record<SignalType, number>> = {
  high_impr_low_ctr: 100,
  ctr_top10: 30,
  position_gain: 30,
  local_potential: 50,
  cannibalization: 20,
  group_service: 100,
  group_territory: 100,
};

export type Relevance = { relevant: boolean; rejection?: string; dataQuality: "suffisante" | "partielle" | "insuffisante" };

/**
 * Filtre de pertinence : un SIGNAL détecté ne devient une OPPORTUNITÉ
 * que s'il repose sur assez de données réelles pour justifier une action.
 */
export function evaluateRelevance(ctx: SignalContext): Relevance {
  const impressions = ctx.impressions ?? 0;
  const conversions = ctx.conversions ?? 0;
  const min = MIN_IMPRESSIONS[ctx.type];

  // Les constats de groupe/indexation regroupée sont toujours informatifs.
  if (ctx.type === "not_indexed_bulk") return { relevant: true, dataQuality: "partielle" };

  if (ctx.type === "not_indexed") {
    if (ctx.noindex) return { relevant: true, dataQuality: "suffisante" };
    if (impressions > 0 || conversions > 0) return { relevant: true, dataQuality: "suffisante" };
    return { relevant: false, rejection: "page non indexée sans impression ni conversion (regroupée)", dataQuality: "insuffisante" };
  }

  if (ctx.type === "converting_page") {
    if (conversions <= 0) return { relevant: false, rejection: "aucune conversion mesurée", dataQuality: "insuffisante" };
    return { relevant: true, dataQuality: ctx.impressions == null ? "partielle" : "suffisante" };
  }

  if (min != null && impressions < min) {
    if (conversions > 0) return { relevant: true, dataQuality: "partielle" };
    return {
      relevant: false,
      rejection: `volume insuffisant (${impressions} impression(s) < ${min} requis)`,
      dataQuality: "insuffisante",
    };
  }

  if (ctx.type === "low_qa" && impressions === 0 && conversions === 0) {
    return { relevant: false, rejection: "QA faible mais aucune visibilité ni conversion mesurée", dataQuality: "insuffisante" };
  }

  if (ctx.position != null && ctx.position > 30 && conversions === 0 && impressions < 200) {
    return { relevant: false, rejection: `position moyenne ${ctx.position.toFixed(1)} au-delà de 30 sans autre signal fort`, dataQuality: "partielle" };
  }

  return { relevant: true, dataQuality: ctx.impressions == null ? "partielle" : "suffisante" };
}

/** CTR normalement observé selon la position (repère interne, jamais présenté comme une donnée Google). */
function expectedCtr(position: number): number {
  if (position <= 1.5) return 0.25;
  if (position <= 3) return 0.12;
  if (position <= 5) return 0.07;
  if (position <= 10) return 0.035;
  if (position <= 20) return 0.012;
  return 0.005;
}

export const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Score de priorité 0-100, décomposé en facteurs explicables.
 * Une règle déclenchée ne donne jamais automatiquement une priorité élevée.
 */
export function scoreSignal(ctx: SignalContext): { score: number; factors: ScoreFactor[] } {
  const factors: ScoreFactor[] = [];
  const push = (label: string, points: number) => { if (points !== 0) factors.push({ label, points }); };

  push("Signal détecté", 15);

  // --- Volume de recherche réel ---
  const impressions = ctx.impressions;
  if (impressions == null) push("Impressions inconnues", -5);
  else if (impressions >= 500) push(`${impressions} impressions (volume très élevé)`, 25);
  else if (impressions >= 200) push(`${impressions} impressions (volume élevé)`, 20);
  else if (impressions >= 50) push(`${impressions} impressions`, 12);
  else if (impressions >= 10) push(`${impressions} impressions (volume modeste)`, 5);
  else push(`${impressions} impression(s) — volume très faible`, -10);

  // --- Position : potentiel de gain immédiat ---
  const pos = ctx.position;
  if (pos != null && pos > 0) {
    if (pos <= 3) push(`Position ${pos.toFixed(1)} (déjà au sommet)`, 5);
    else if (pos <= 10) push(`Position ${pos.toFixed(1)} — potentiel CTR immédiat`, 20);
    else if (pos <= 20) push(`Position ${pos.toFixed(1)} — première page atteignable`, 15);
    else if (pos <= 30) push(`Position ${pos.toFixed(1)} — potentiel secondaire`, 8);
    else push(`Position ${pos.toFixed(1)} — très loin dans les résultats`, -5);
  }

  // --- Écart de CTR par rapport à la position ---
  if (ctx.ctr != null && pos != null && (impressions ?? 0) >= 30) {
    const gap = expectedCtr(pos) - ctx.ctr;
    if (gap > 0) push(`CTR ${(ctx.ctr * 100).toFixed(2)} % sous le niveau attendu pour cette position`, Math.min(20, Math.round(gap * 200)));
  }

  // --- Conversions : signal commercial le plus fort ---
  const conversions = ctx.conversions ?? 0;
  if (conversions > 0) push(`${conversions} conversion(s) déjà générée(s) sur 30 j`, Math.min(25, 10 + conversions * 5));
  else if ((impressions ?? 0) >= 200) push("Visibilité réelle sans aucune conversion détectée", 5);

  // --- Indexation ---
  if (ctx.noindex) push("Balise noindex active sur une page publiée", 15);
  else if (ctx.indexed === false && (impressions ?? 0) > 0) push("Non indexée alors qu'elle reçoit des impressions", 10);
  else if (ctx.indexed === false && conversions === 0 && (impressions ?? 0) === 0) push("Non indexée et sans visibilité mesurée", -5);

  // --- Qualité de la page ---
  if (ctx.qa != null) {
    if (ctx.qa < 70) push(`Qualité QA ${ctx.qa}/100`, 10);
    else if (ctx.qa < 85) push(`Qualité QA ${ctx.qa}/100 perfectible`, 4);
  }
  if (ctx.wordCount != null && ctx.wordCount < 400) push(`Contenu court (${ctx.wordCount} mots)`, 5);
  if (ctx.internalLinks != null && ctx.internalLinks < 3) push(`Maillage interne faible (${ctx.internalLinks} lien(s))`, 5);

  // --- Pertinence commerciale du service ---
  const sp = servicePriority(ctx.serviceSlug);
  if (sp === "haute") push("Service stratégique pour Vrac Québec", 10);
  else if (sp === "faible") push("Service éditorial ou secondaire", -5);

  // --- Risque de cannibalisation ---
  if ((ctx.siblingPages ?? 0) >= 2) push(`${ctx.siblingPages} pages ciblent la même intention`, 8);

  // --- Portée d'un constat de groupe ---
  if ((ctx.groupPages ?? 0) >= 5) push(`${ctx.groupPages} pages concernées`, 8);

  const score = clampScore(factors.reduce((sum, f) => sum + f.points, 0));
  return { score, factors };
}

export function priorityOf(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** Impact attendu, sans jamais promettre de chiffre ni de gain de position. */
export function expectedImpact(type: SignalType): string {
  switch (type) {
    case "high_impr_low_ctr":
    case "ctr_top10":
      return "Gain potentiel de clics sur une visibilité déjà acquise, sans nouveau contenu à produire.";
    case "position_gain":
      return "Progression possible vers la première page si le contenu répond mieux à l'intention. Aucun gain de position garanti.";
    case "not_indexed":
    case "not_indexed_bulk":
      return "Prise en compte possible de la page par Google. Le délai d'indexation dépend de Google.";
    case "converting_page":
      return "Renforcement d'une page qui génère déjà des demandes réelles : impact commercial direct.";
    case "local_potential":
      return "Meilleure couverture d'un couple territoire/service qui reçoit déjà des recherches.";
    case "low_qa":
      return "Page plus solide techniquement sur une URL qui reçoit déjà du trafic.";
    case "cannibalization":
      return "Clarification de l'intention entre plusieurs URLs. À vérifier avant toute fusion.";
    case "group_service":
    case "group_territory":
      return "Vue d'ensemble permettant de prioriser un lot de pages plutôt qu'une page isolée.";
  }
}

/** Top N trié par score, puis effort croissant. */
export function topOpportunities<T extends { score: number; effort_score?: number }>(list: T[], n = 10): T[] {
  return [...list]
    .sort((a, b) => b.score - a.score || (a.effort_score ?? 50) - (b.effort_score ?? 50))
    .slice(0, n);
}
