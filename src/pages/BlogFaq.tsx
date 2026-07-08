import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { HelpCircle, ChevronDown } from "lucide-react";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import Breadcrumbs from "@/components/blog/Breadcrumbs";
import SearchBar from "@/components/blog/SearchBar";
import { fetchCategoryBySlug, fetchPublishedPosts } from "@/lib/blog/queries";
import { SITE_URL, sanitizeHtml } from "@/lib/blog/utils";

export default function BlogFaq() {
  const [open, setOpen] = useState<string | null>(null);
  const { data: category } = useQuery({
    queryKey: ["blog-category", "faq"],
    queryFn: () => fetchCategoryBySlug("faq"),
  });
  const { data: posts = [] } = useQuery({
    queryKey: ["blog-faq", category?.id],
    queryFn: () => fetchPublishedPosts({ categoryId: category!.id, limit: 100 }),
    enabled: !!category?.id,
  });

  const url = `${SITE_URL}/blog/faq`;

  const faqLd = posts.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: posts.map((p) => ({
      "@type": "Question",
      name: p.title,
      acceptedAnswer: {
        "@type": "Answer",
        text: p.excerpt || (p.content || "").replace(/<[^>]+>/g, " ").slice(0, 500),
      },
    })),
  } : null;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Questions fréquentes — Vrac Québec</title>
        <meta name="description" content="Toutes les réponses à vos questions sur le remblai, la livraison en vrac, les matériaux et le transport au Québec." />
        <link rel="canonical" href={url} />
        {faqLd && <script type="application/ld+json">{JSON.stringify(faqLd)}</script>}
      </Helmet>
      <BlogNav />
      <div className="container mx-auto px-4 sm:px-6 pt-6">
        <Breadcrumbs items={[{ label: "Blogue", to: "/blog" }, { label: "Questions fréquentes" }]} />
      </div>
      <header className="container mx-auto px-4 sm:px-6 pt-8 pb-6 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs uppercase tracking-widest font-display font-bold mb-4">
          <HelpCircle className="w-3.5 h-3.5" /> FAQ
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight">
          Questions fréquentes
        </h1>
        <p className="mt-4 text-muted-foreground font-body">
          Vos réponses en un coup d'œil sur le remblai, la livraison et le transport en vrac.
        </p>
        <div className="mt-6"><SearchBar size="md" /></div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 pb-12 max-w-3xl">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground font-body">
            Les questions fréquentes seront ajoutées bientôt.
          </div>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => {
              const isOpen = open === p.id;
              return (
                <li key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 hover:bg-muted/40"
                    aria-expanded={isOpen}
                  >
                    <span className="font-display font-extrabold text-foreground">{p.title}</span>
                    <ChevronDown className={`w-5 h-5 shrink-0 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 -mt-1">
                      {p.excerpt && <p className="text-sm text-muted-foreground font-body mb-3">{p.excerpt}</p>}
                      <div
                        className="prose prose-sm max-w-none font-body"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.content || "") }}
                      />
                      <Link to={`/blog/${p.slug}`} className="inline-block mt-3 text-sm text-primary font-display font-bold hover:underline">
                        Lire l'article complet →
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <BlogFooterCTA />
      </main>
    </div>
  );
}