// Compteurs du Centre de pilotage SEO — LECTURE SEULE.
// Ce module ne fait AUCUNE écriture : il classe des lignes de pages déjà chargées.
// Règle : une page n'est en ERREUR que si un défaut réel est constaté aujourd'hui.
// Tout le reste (âge, maillage 2-4 liens, score perfectible) est une OPTIMISATION
// POTENTIELLE et ne doit jamais être présenté comme une erreur.

import { duplicateTitles, runQaControl, type QaControlPage } from "@/lib/seo/qaControl";

export type CounterPage = QaControlPage & {
  id?: string;
  status: string;
  noindex?: boolean | null;
  google_index_status?: string | null;
  last_generated_at?: string | null;
  proc_status?: string | null;
  proc_error?: string | null;
};

export const COUNTER_RULES = {
  /** Sous ce nombre de liens internes, c'est une erreur réelle. */
  linksErrorMin: 2,
  /** Objectif de maillage (optimisation, jamais une erreur). */
  linksTarget: 5,
  /** Âge à partir duquel un rafraîchissement est suggéré (optimisation). */
  staleDays: 60,
  /** Score QA en dessous duquel une amélioration facultative est suggérée. */
  qaImproveBelow: 80,
} as const;

/** Statuts Search Console confirmant une non-indexation (jamais « inconnu »). */
export const CONFIRMED_NOT_INDEXED = [
  "not_indexed",
  "crawled_not_indexed",
  "discovered_not_indexed",
  "excluded",
  "blocked",
];

export type CounterItem = {
  slug: string;
  url: string;
  city_slug: string;
  topic: string;
  /** Ce que l'action toucherait réellement. */
  target: string;
  detail: string;
};

export type StrategicCounters = {
  /** Pages publiées analysées (100 % de la base, jamais un échantillon). */
  analyzed: number;
  pagesTotal: number;
  published: number;
  errors: {
    seo: CounterItem[];
    technical: CounterItem[];
    links: CounterItem[];
    indexation: CounterItem[];
    total: number;
  };
  optimizations: {
    stale: CounterItem[];
    links: CounterItem[];
    /** Déficit total de liens pour atteindre l'objectif de 5. */
    linksDeficit: number;
    content: CounterItem[];
    qa: CounterItem[];
    total: number;
  };
  /** Articles réellement en brouillon / planifiés — jamais une formule. */
  blogToPublish: number;
  qaAverage: number | null;
};

function topicOf(p: CounterPage): string {
  return p.material_slug ?? p.service_slug ?? "hub";
}

function base(p: CounterPage, target: string, detail: string): CounterItem {
  return { slug: p.slug, url: `/${p.slug}`, city_slug: p.city_slug, topic: topicOf(p), target, detail };
}

function linkCount(p: CounterPage): number {
  const inline = p.internal_link_count ?? 0;
  const related = Array.isArray(p.internal_links) ? p.internal_links.length : 0;
  return inline + related;
}

export function computeStrategicCounters(
  pages: CounterPage[],
  opts: { now?: Date; blogToPublish?: number } = {},
): StrategicCounters {
  const now = opts.now ?? new Date();
  const staleCutoff = now.getTime() - COUNTER_RULES.staleDays * 86400 * 1000;
  const published = pages.filter((p) => p.status === "published");
  const dupes = duplicateTitles(published);

  const errors = { seo: [] as CounterItem[], technical: [] as CounterItem[], links: [] as CounterItem[], indexation: [] as CounterItem[] };
  const optimizations = { stale: [] as CounterItem[], links: [] as CounterItem[], content: [] as CounterItem[], qa: [] as CounterItem[] };
  let linksDeficit = 0;
  const scores: number[] = [];

  for (const p of published) {
    // Score QA recalculé sur l'état ACTUEL de la page (l'ancien score enregistré est ignoré).
    const qa = runQaControl(p, { duplicateTitle: dupes.has((p.meta_title ?? "").trim()) });
    scores.push(qa.score);

    if (qa.verdict === "blocked") {
      errors.seo.push(base(p, "Contenu / titre / meta", qa.issues.filter((i) => i.severity === "blocker").map((i) => i.label).join(", ")));
    }

    if (p.proc_status === "error" || (p.proc_error ?? "") !== "") {
      errors.technical.push(base(p, "Donnée technique uniquement", p.proc_error ?? "Traitement en erreur"));
    } else if (p.noindex === true) {
      errors.technical.push(base(p, "Donnée technique uniquement", "Page publiée mais marquée « ne pas indexer »"));
    }

    if (CONFIRMED_NOT_INDEXED.includes(p.google_index_status ?? "")) {
      errors.indexation.push(base(p, "Donnée technique uniquement", `Search Console : ${p.google_index_status}`));
    }

    const links = linkCount(p);
    if (links < COUNTER_RULES.linksErrorMin) {
      errors.links.push(base(p, "Liens internes", `${links} lien(s) — minimum ${COUNTER_RULES.linksErrorMin}`));
    } else if (links < COUNTER_RULES.linksTarget) {
      linksDeficit += COUNTER_RULES.linksTarget - links;
      optimizations.links.push(base(p, "Liens internes", `${links} lien(s) — objectif ${COUNTER_RULES.linksTarget}`));
    }

    const gen = p.last_generated_at ? new Date(p.last_generated_at).getTime() : null;
    if (gen !== null && gen < staleCutoff) {
      const days = Math.floor((now.getTime() - gen) / 86400000);
      optimizations.stale.push(base(p, "Contenu, titre et meta (régénération)", `Dernière génération il y a ${days} jours`));
    }

    if (qa.verdict === "fix") {
      optimizations.content.push(base(p, "Contenu ou meta (facultatif)", qa.issues.filter((i) => i.severity === "fix").map((i) => i.label).join(", ")));
    }
    if (qa.score < COUNTER_RULES.qaImproveBelow) {
      optimizations.qa.push(base(p, "Score QA (facultatif)", `Score actuel ${qa.score}/100`));
    }
  }

  return {
    analyzed: published.length,
    pagesTotal: pages.length,
    published: published.length,
    errors: {
      ...errors,
      total: errors.seo.length + errors.technical.length + errors.links.length + errors.indexation.length,
    },
    optimizations: {
      ...optimizations,
      linksDeficit,
      total: optimizations.stale.length + optimizations.links.length + optimizations.content.length + optimizations.qa.length,
    },
    blogToPublish: opts.blogToPublish ?? 0,
    qaAverage: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  };
}

/** Aperçu obligatoire avant toute action massive : rien n'est lancé sans cette liste. */
export type OptimizationPreview = {
  pages: number;
  urls: string[];
  kinds: Array<{ kind: string; pages: number; target: string }>;
};

export function buildOptimizationPreview(c: StrategicCounters, maxUrls = 50): OptimizationPreview {
  const groups: Array<{ kind: string; items: CounterItem[]; target: string }> = [
    { kind: "Rafraîchissement du contenu (plus de 60 jours)", items: c.optimizations.stale, target: "Contenu, titre, meta description, H1" },
    { kind: "Ajout de liens internes (2-4 → 5)", items: c.optimizations.links, target: "Liens internes dans le contenu" },
    { kind: "Amélioration facultative du contenu", items: c.optimizations.content, target: "Contenu ou meta" },
    { kind: "Amélioration facultative du score QA", items: c.optimizations.qa, target: "Contenu, meta, liens" },
  ];
  const urls = new Set<string>();
  for (const g of groups) for (const i of g.items) urls.add(i.url);
  return {
    pages: urls.size,
    urls: [...urls].slice(0, maxUrls),
    kinds: groups.filter((g) => g.items.length > 0).map((g) => ({ kind: g.kind, pages: g.items.length, target: g.target })),
  };
}
