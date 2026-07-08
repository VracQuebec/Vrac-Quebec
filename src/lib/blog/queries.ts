import { supabase } from "@/integrations/supabase/client";
import type { BlogCategory, BlogPost, BlogPostWithRelations } from "./types";

const POST_SELECT = `
  id, slug, title, excerpt, content, cover_image_url, cover_image_alt, gallery,
  category_id, author_id, status, published_at, scheduled_at,
  meta_title, meta_description, canonical_url, og_image_url,
  reading_time_minutes, view_count, is_featured, is_popular, noindex,
  previous_slugs, created_at, updated_at,
  blog_categories:category_id ( id, slug, name, color ),
  blog_authors:author_id ( id, slug, name, avatar_url, title )
` as const;

export async function fetchCategories(): Promise<BlogCategory[]> {
  const { data, error } = await supabase
    .from("blog_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCategoryBySlug(slug: string): Promise<BlogCategory | null> {
  const { data, error } = await supabase
    .from("blog_categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

type ListOpts = { limit?: number; featured?: boolean; popular?: boolean; categoryId?: string; offset?: number };

export async function fetchPublishedPosts(opts: ListOpts = {}): Promise<BlogPostWithRelations[]> {
  const { limit = 12, featured, popular, categoryId, offset = 0 } = opts;
  let q = supabase
    .from("blog_posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order(popular ? "view_count" : "published_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (featured) q = q.eq("is_featured", true);
  if (categoryId) q = q.eq("category_id", categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as BlogPostWithRelations[];
}

export async function fetchPostBySlug(slug: string): Promise<BlogPostWithRelations | null> {
  // Try direct slug first
  const { data, error } = await supabase
    .from("blog_posts")
    .select(POST_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (data) return data as unknown as BlogPostWithRelations;

  // Fallback: previous slugs
  const { data: legacy, error: err2 } = await supabase
    .from("blog_posts")
    .select(POST_SELECT)
    .contains("previous_slugs", [slug])
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  if (err2) throw err2;
  return legacy as unknown as BlogPostWithRelations | null;
}

export async function fetchRelatedPosts(post: BlogPost, limit = 3): Promise<BlogPostWithRelations[]> {
  // Manual overrides first
  const { data: manual } = await supabase
    .from("blog_post_related")
    .select("related_post_id, sort_order")
    .eq("post_id", post.id)
    .order("sort_order");
  const manualIds = (manual ?? []).map((r) => r.related_post_id);

  if (manualIds.length >= limit) {
    const { data } = await supabase
      .from("blog_posts")
      .select(POST_SELECT)
      .in("id", manualIds.slice(0, limit))
      .eq("status", "published");
    return (data ?? []) as unknown as BlogPostWithRelations[];
  }

  // Auto: same category, exclude self + manual
  const excludeIds = [post.id, ...manualIds];
  let q = supabase
    .from("blog_posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .not("id", "in", `(${excludeIds.join(",")})`)
    .order("published_at", { ascending: false })
    .limit(limit - manualIds.length);
  if (post.category_id) q = q.eq("category_id", post.category_id);
  const { data: auto } = await q;

  const manualPosts = manualIds.length
    ? ((await supabase.from("blog_posts").select(POST_SELECT).in("id", manualIds).eq("status", "published")).data ?? [])
    : [];
  return [...manualPosts, ...(auto ?? [])] as unknown as BlogPostWithRelations[];
}

export async function searchPosts(query: string, limit = 20) {
  const { data, error } = await supabase.rpc("blog_search", { _query: query, _limit: limit });
  if (error) throw error;
  return data ?? [];
}

export async function countPublishedPosts(categoryId?: string): Promise<number> {
  let q = supabase
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .lte("published_at", new Date().toISOString());
  if (categoryId) q = q.eq("category_id", categoryId);
  const { count } = await q;
  return count ?? 0;
}