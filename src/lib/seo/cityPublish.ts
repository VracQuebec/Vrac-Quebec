// Publication contrôlée des brouillons d'une ville : chaque brouillon passe publishGate (promesses,
// noindex, texte technique, cohérence, liens, slug) PUIS le contrôle serveur seo_page_publish.
// Le statut est relu après chaque publication : une page n'est déclarée publiée que si la base le confirme.
import { supabase } from "@/integrations/supabase/client";
import { publishGate, qualityGate, type DraftForGate } from "./catalogStatus";

export type PublishOutcome = {
  published: string[];
  blocked: Array<{ slug: string; reasons: string[] }>;
  failed: Array<{ slug: string; error: string }>;
};

type Deps = {
  listDrafts: (citySlug: string) => Promise<Array<DraftForGate & { id: string; updated_at?: string; material_slug?: string | null; service_slug?: string | null }>>;
  slugCopies: (slugs: string[]) => Promise<Map<string, number>>;
  publish: (id: string, expectedUpdatedAt: string | undefined, removeNoindex: boolean) => Promise<{ ok: boolean; issues?: string[] }>;
  readStatus: (id: string) => Promise<string | null>;
};

export async function publishCityDrafts(citySlug: string, cityName: string, deps: Deps = defaultDeps, opts: { removeGenerationNoindex?: boolean; onlySlugs?: string[]; isAvailable?: (d: { material_slug?: string | null; service_slug?: string | null }) => boolean } = {}): Promise<PublishOutcome> {
  const removeNoindex = opts.removeGenerationNoindex === true;
  // Retrait du noindex seulement pour une liste explicite de pages confirmées une à une.
  if (removeNoindex && !opts.onlySlugs?.length) throw new Error("Liste explicite de pages requise pour retirer le noindex.");
  // Retrait du noindex = rendre indexable : la disponibilité doit être confirmée, revérifiée ici.
  if (removeNoindex && !opts.isAvailable) throw new Error("Contrôle de disponibilité requis pour publier.");
  const out: PublishOutcome = { published: [], blocked: [], failed: [] };
  const all = await deps.listDrafts(citySlug);
  const drafts = opts.onlySlugs ? all.filter((d) => opts.onlySlugs!.includes(d.slug)) : all;
  const copies = await deps.slugCopies(drafts.map((d) => d.slug));
  for (const d of drafts) {
    const reasons = publishGate(d, { cityName, slugCopies: copies.get(d.slug) ?? 1, removeGenerationNoindex: removeNoindex });
    if (opts.isAvailable && !opts.isAvailable(d as never)) reasons.push("Disponibilité non confirmée — décision requise avant publication.");
    reasons.push(...qualityGate(d));
    if (reasons.length) { out.blocked.push({ slug: d.slug, reasons }); continue; }
    try {
      const r = await deps.publish(d.id, d.updated_at, removeNoindex && !!d.noindex && !d.noindex_volontaire);
      if (!r.ok) { out.blocked.push({ slug: d.slug, reasons: r.issues?.length ? r.issues : ["Refus du contrôle serveur."] }); continue; }
      const st = await deps.readStatus(d.id);
      if (st === "published") out.published.push(d.slug);
      else out.failed.push({ slug: d.slug, error: "Publication non confirmée par la base — page laissée en brouillon." });
    } catch (e) {
      out.failed.push({ slug: d.slug, error: e instanceof Error ? e.message : "Erreur inconnue" });
    }
  }
  return out;
}

export function publishOutcomeMessage(o: PublishOutcome): string {
  const parts = [`${o.published.length} publiée(s)`, `${o.blocked.length} bloquée(s)`, `${o.failed.length} échec(s)`];
  const first = o.blocked[0] ? ` — ex. ${o.blocked[0].slug} : ${o.blocked[0].reasons[0]}` : "";
  return parts.join(", ") + "." + first;
}

const defaultDeps: Deps = {
  listDrafts: async (citySlug) => {
    const { data, error } = await supabase.from("seo_pages")
      .select("id, slug, material_slug, service_slug, status, noindex, noindex_volontaire, updated_at, meta_title, meta_description, h1, title, content_html, word_count, internal_link_count")
      .eq("city_slug", citySlug).neq("status", "published");
    if (error) throw new Error(error.message);
    return withQuality((data ?? []) as Array<{ id: string }>) as never;
  },
  slugCopies: async (slugs) => {
    const m = new Map<string, number>();
    if (!slugs.length) return m;
    const { data, error } = await supabase.from("seo_pages").select("slug").in("slug", slugs);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ slug: string }>) m.set(r.slug, (m.get(r.slug) ?? 0) + 1);
    return m;
  },
  publish: async (id, expected, removeNoindex) => {
    // Publication validée côté serveur : refus si le brouillon a changé depuis la lecture;
    // noindex retiré seulement si demandé explicitement et jamais s'il est volontaire.
    const { data, error } = await supabase.rpc("seo_page_publish_validated" as never, { _page_id: id, _expected_updated_at: expected ?? null, _remove_noindex: removeNoindex } as never);
    if (error) throw new Error(error.message);
    return data as unknown as { ok: boolean; issues?: string[] };
  },
  readStatus: async (id) => {
    const { data } = await supabase.from("seo_pages").select("status").eq("id", id).maybeSingle();
    return (data as { status?: string } | null)?.status ?? null;
  },
};

// ── Pré-contrôle AVANT le clic : mêmes règles que publishCityDrafts (publishGate), sans écriture ──
export type PublishPrecheck = { eligible: string[]; blocked: Array<{ slug: string; reasons: string[] }> };

export function publishPrecheck(
  drafts: Array<DraftForGate & { material_slug?: string | null; service_slug?: string | null }>, cityName: string, copies: Map<string, number>,
  availability: (d: { material_slug?: string | null; service_slug?: string | null }) => "confirmee" | "exclue" | "inconnue" = () => "confirmee",
): PublishPrecheck {
  const out: PublishPrecheck = { eligible: [], blocked: [] };
  for (const d of drafts) {
    // Noindex de génération retirable seulement à la confirmation explicite; noindex volontaire toujours bloquant.
    const reasons = publishGate(d, { cityName, slugCopies: copies.get(d.slug) ?? 1, removeGenerationNoindex: true });
    const av = availability(d);
    if (av !== "confirmee") reasons.push(av === "exclue" ? "Combinaison exclue pour cette ville." : "Disponibilité inconnue — décision requise avant publication.");
    reasons.push(...qualityGate(d));
    if (reasons.length) out.blocked.push({ slug: d.slug, reasons }); else out.eligible.push(d.slug);
  }
  return out;
}

export function precheckReason(p: PublishPrecheck | undefined): string | null {
  if (!p) return "Contrôle de qualité des brouillons en cours…";
  if (p.eligible.length > 0) return null;
  if (p.blocked.length === 0) return "Aucun brouillon dans cette ville.";
  return `${p.blocked.length} brouillon(s), aucun admissible — ex. ${p.blocked[0].slug} : ${p.blocked[0].reasons[0]}`;
}

/** Lecture unique de tous les brouillons (toutes villes) pour le pré-contrôle. */
export async function loadAllDraftsForPrecheck(): Promise<{ drafts: Array<DraftForGate & { city_slug: string }>; copies: Map<string, number> }> {
  const { data, error } = await supabase.from("seo_pages")
    .select("id, slug, city_slug, material_slug, service_slug, status, noindex, noindex_volontaire, updated_at, meta_title, meta_description, h1, title, content_html, word_count, internal_link_count")
    .neq("status", "published").limit(1000);
  if (error) throw new Error(error.message);
  const drafts = (await withQuality((data ?? []) as Array<{ id: string }>)) as never as Array<DraftForGate & { city_slug: string }>;
  const copies = new Map<string, number>();
  const slugs = drafts.map((d) => d.slug);
  if (slugs.length) {
    const { data: all } = await supabase.from("seo_pages").select("slug").in("slug", slugs);
    for (const r of (all ?? []) as Array<{ slug: string }>) copies.set(r.slug, (copies.get(r.slug) ?? 0) + 1);
  }
  return { drafts, copies };
}

/** Joint la dernière note de qualité et sa fraîcheur (lecture serveur, aucune écriture). */
export async function withQuality<T extends { id: string }>(rows: T[]): Promise<Array<T & { qa_score: number | null; qa_fresh: boolean; qa_blockers: string[] | null }>> {
  const m = new Map<string, { score: number | null; fresh: boolean | null; blockers: string[] | null }>();
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map((r) => r.id);
    const { data, error } = await supabase.rpc("seo_page_quality_state" as never, { _page_ids: ids } as never);
    if (error) throw new Error(error.message);
    for (const q of (data ?? []) as Array<{ page_id: string; score: number | null; fresh: boolean | null; blockers: string[] | null }>) m.set(q.page_id, q);
  }
  return rows.map((r) => { const q = m.get(r.id); return { ...r, qa_score: q?.score ?? null, qa_fresh: q?.fresh === true, qa_blockers: q?.blockers ?? null }; });
}
