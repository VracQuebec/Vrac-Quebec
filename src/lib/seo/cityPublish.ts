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
  listDrafts: (citySlug: string) => Promise<Array<DraftForGate & { id: string }>>;
  slugCopies: (slugs: string[]) => Promise<Map<string, number>>;
  publish: (id: string) => Promise<{ ok: boolean; issues?: string[] }>;
  readStatus: (id: string) => Promise<string | null>;
};

export async function publishCityDrafts(citySlug: string, cityName: string, deps: Deps = defaultDeps): Promise<PublishOutcome> {
  const out: PublishOutcome = { published: [], blocked: [], failed: [] };
  const drafts = await deps.listDrafts(citySlug);
  const copies = await deps.slugCopies(drafts.map((d) => d.slug));
  for (const d of drafts) {
    const reasons = publishGate(d, { cityName, slugCopies: copies.get(d.slug) ?? 1 });
    if (reasons.length) { out.blocked.push({ slug: d.slug, reasons }); continue; }
    try {
      const r = await deps.publish(d.id);
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
      .select("id, slug, status, noindex, meta_title, meta_description, h1, title, content_html, word_count, internal_link_count")
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
  publish: async (id) => {
    const { data, error } = await supabase.rpc("seo_page_publish" as never, { _page_id: id } as never);
    if (error) throw new Error(error.message);
    return data as unknown as { ok: boolean; issues?: string[] };
  },
  readStatus: async (id) => {
    const { data } = await supabase.from("seo_pages").select("status").eq("id", id).maybeSingle();
    return (data as { status?: string } | null)?.status ?? null;
  },
};
