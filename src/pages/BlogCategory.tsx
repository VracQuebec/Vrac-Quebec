import { displayBrandColor } from "@/lib/brand-color";
import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import Breadcrumbs from "@/components/blog/Breadcrumbs";
import CategoryPills from "@/components/blog/CategoryPills";
import PostCard from "@/components/blog/PostCard";
import SearchBar from "@/components/blog/SearchBar";
import { fetchCategories, fetchCategoryBySlug, fetchPublishedPosts } from "@/lib/blog/queries";
import { SITE_URL } from "@/lib/blog/utils";

export default function BlogCategory() {
  const { slug = "" } = useParams();

  const { data: categories = [] } = useQuery({ queryKey: ["blog-categories"], queryFn: fetchCategories });
  const { data: category, isLoading } = useQuery({
    queryKey: ["blog-category", slug],
    queryFn: () => fetchCategoryBySlug(slug),
  });
  const { data: posts = [] } = useQuery({
    queryKey: ["blog-category-posts", category?.id],
    queryFn: () => fetchPublishedPosts({ categoryId: category!.id, limit: 24 }),
    enabled: !!category?.id,
  });

  if (!isLoading && !category) return <Navigate to="/blog" replace />;

  const url = `${SITE_URL}/blog/categorie/${slug}`;
  const title = category ? `${category.name} — Vrac Québec` : "Catégorie";
  const description = category?.meta_description || category?.description || "Articles Vrac Québec";

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
      </Helmet>
      <BlogNav />

      <div className="container mx-auto px-4 sm:px-6 pt-6">
        <Breadcrumbs items={[{ label: "Blogue", to: "/blog" }, { label: category?.name || "" }]} />
      </div>

      <header className="container mx-auto px-4 sm:px-6 pt-8 pb-6">
        <div
          className="inline-block px-3 py-1 rounded-full text-white text-xs uppercase font-display font-bold tracking-widest mb-4"
          style={{ backgroundColor: displayBrandColor(category?.color) }}
        >
          Catégorie
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight">
          {category?.name}
        </h1>
        {category?.description && (
          <p className="mt-3 text-muted-foreground font-body max-w-2xl">{category.description}</p>
        )}
        <div className="mt-6">
          <SearchBar size="md" />
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 pb-12 space-y-10">
        <CategoryPills categories={categories} activeSlug={slug} />

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground font-body">
            Aucun article dans cette catégorie pour l'instant.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}

        <BlogFooterCTA />
      </main>
    </div>
  );
}