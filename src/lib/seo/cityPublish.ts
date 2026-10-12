// Publication contrôlée des brouillons d'une ville : chaque brouillon passe publishGate (promesses,
// noindex, texte technique, cohérence, liens, slug) PUIS le contrôle serveur seo_page_publish.
// Le statut est relu après chaque publication : une page n'est déclarée publiée que si la base le confirme.
import { supabase } from "@/integrations/supabase/client";
import { publishGate, type DraftForGate } from "./catalogStatus";

export type PublishOutcome = {
  published: string[];
  blocked: Array<{ slug: string; reasons: string[] }>;
  failed: Array<{ slug: string; error: string }>;
};

type Deps = {
  listDrafts: (citySlug: string) => Promise<Array<DraftForGate & { id: string; updated_at?: string }>>;
  slugCopies: (slugs: string[]) => Promise<Map<string, number>>;
  publish: (id: string, expectedUpdatedAt: string | undefined, removeNoindex: boolean) => Promise<{ ok: boolean; issues?: string[] }>;
  readStatus: (id: string) => Promise<string | null>;
};

export async function publishCityDrafts(citySlug: string, cityName: string, deps: Deps = defaultDeps, opts: { removeGenerationNoindex?: boolean } = {}): Promise<PublishOutcome> {
  const removeNoindex = opts.removeGenerationNoindex === true;
  const out: PublishOutcome = { published: [], blocked: [], failed: [] };
  const drafts = await deps.listDrafts(citySlug);
  const copies = await deps.slugCopies(drafts.map((d) => d.slug));
  for (const d of drafts) {
    const reasons = publishGate(d, { cityName, slugCopies: copies.get(d.slug) ?? 1, removeGenerationNoindex: removeNoindex });
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
      .select("id, slug, status, noindex, noindex_volontaire, updated_at, meta_title, meta_description, h1, title, content_html, word_count, internal_link_count")
      .eq("city_slug", citySlug).neq("status", "published");
    if (error) throw new Error(error.message);
    return (data ?? []) as never;
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

export function publishPrecheck(drafts: DraftForGate[], cityName: string, copies: Map<string, number>): PublishPrecheck {
  const out: PublishPrecheck = { eligible: [], blocked: [] };
  for (const d of drafts) {
    const reasons = publishGate(d, { cityName, slugCopies: copies.get(d.slug) ?? 1, removeGenerationNoindex: false });
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
    .select("id, slug, city_slug, status, noindex, noindex_volontaire, updated_at, meta_title, meta_description, h1, title, content_html, word_count, internal_link_count")
    .neq("status", "published").limit(1000);
  if (error) throw new Error(error.message);
  const drafts = (data ?? []) as never as Array<DraftForGate & { city_slug: string }>;
  const copies = new Map<string, number>();
  const slugs = drafts.map((d) => d.slug);
  if (slugs.length) {
    const { data: all } = await supabase.from("seo_pages").select("slug").in("slug", slugs);
    for (const r of (all ?? []) as Array<{ slug: string }>) copies.set(r.slug, (copies.get(r.slug) ?? 0) + 1);
  }
  return { drafts, copies };
}
