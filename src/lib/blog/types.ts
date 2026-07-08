import type { Database } from "@/integrations/supabase/types";

export type BlogCategory = Database["public"]["Tables"]["blog_categories"]["Row"];
export type BlogAuthor = Database["public"]["Tables"]["blog_authors"]["Row"];
export type BlogTag = Database["public"]["Tables"]["blog_tags"]["Row"];
export type BlogPost = Database["public"]["Tables"]["blog_posts"]["Row"];
export type BlogPostInsert = Database["public"]["Tables"]["blog_posts"]["Insert"];
export type BlogPostUpdate = Database["public"]["Tables"]["blog_posts"]["Update"];

export type BlogPostWithRelations = BlogPost & {
  blog_categories: Pick<BlogCategory, "id" | "slug" | "name" | "color"> | null;
  blog_authors: Pick<BlogAuthor, "id" | "slug" | "name" | "avatar_url" | "title"> | null;
};