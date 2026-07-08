import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { BookOpen } from "lucide-react";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import Breadcrumbs from "@/components/blog/Breadcrumbs";
import PostCard from "@/components/blog/PostCard";
import SearchBar from "@/components/blog/SearchBar";
import { fetchCategoryBySlug, fetchPublishedPosts } from "@/lib/blog/queries";
import { SITE_URL } from "@/lib/blog/utils";

export default function BlogGuides() {
  const { data: category } = useQuery({
    queryKey: ["blog-category", "guides"],
    queryFn: () => fetchCategoryBySlug("guides"),
  });
  const { data: posts = [] } = useQuery({
    queryKey: ["blog-guides", category?.id],
    queryFn: () => fetchPublishedPosts({ categoryId: category!.id, limit: 60 }),
    enabled: !!category?.id,
  });
  const url = `${SITE_URL}/blog/guides`;
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Guides pratiques vrac Québec — Remblai, terre, transport</title>
        <meta name="description" content="Tous nos guides pratiques : préparer le terrain, choisir le bon matériau, commander en vrac, réussir un projet de remblai au Québec." />
        <link rel="canonical" href={url} />
      </Helmet>
      <BlogNav />
      <div className="container mx-auto px-4 sm:px-6 pt-6">
        <Breadcrumbs items={[{ label: "Blogue", to: "/blog" }, { label: "Guides pratiques" }]} />
      </div>
      <header className="container mx-auto px-4 sm:px-6 pt-8 pb-6 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs uppercase tracking-widest font-display font-bold mb-4">
          <BookOpen className="w-3.5 h-3.5" /> Guides pratiques
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight">
          Tous nos guides pratiques
        </h1>
        <p className="mt-4 text-muted-foreground font-body">
          Étape par étape : bien préparer votre projet, choisir vos matériaux et commander en vrac au Québec.
        </p>
        <div className="mt-6"><SearchBar size="md" /></div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 pb-12">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground font-body">
            Nos guides arrivent bientôt.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
        )}
        <BlogFooterCTA />
      </main>
    </div>
  );
}