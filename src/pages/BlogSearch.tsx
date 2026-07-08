import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import SearchBar from "@/components/blog/SearchBar";
import Breadcrumbs from "@/components/blog/Breadcrumbs";
import { searchPosts } from "@/lib/blog/queries";
import { formatDateFr, SITE_URL } from "@/lib/blog/utils";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";

export default function BlogSearch() {
  const [params] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["blog-search", q],
    queryFn: () => searchPosts(q, 40),
    enabled: q.length > 0,
  });

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{q ? `Recherche: ${q}` : "Recherche"} — Blogue Vrac Québec</title>
        <meta name="description" content={`Résultats de recherche pour "${q}" sur le blogue Vrac Québec.`} />
        <link rel="canonical" href={`${SITE_URL}/blog/recherche`} />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <BlogNav />

      <div className="container mx-auto px-4 sm:px-6 pt-6">
        <Breadcrumbs items={[{ label: "Blogue", to: "/blog" }, { label: "Recherche" }]} />
      </div>

      <header className="container mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl md:text-4xl font-display font-extrabold text-foreground">Rechercher</h1>
        <p className="mt-2 text-muted-foreground font-body">
          {q ? `Résultats pour « ${q} »` : "Trouvez guides, articles, calculateurs et réponses."}
        </p>
        <div className="mt-6">
          <SearchBar defaultValue={q} size="lg" />
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 pb-12">
        {q === "" ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground font-body">
            Tapez votre requête ci-dessus pour lancer la recherche.
          </div>
        ) : isLoading ? (
          <div className="text-center text-muted-foreground py-10">Recherche en cours…</div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground font-body">
            Aucun résultat trouvé pour « {q} ». Essayez d'autres mots-clés.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {results.map((r) => (
              <li key={r.id}>
                <Link to={`/blog/${r.slug}`} className="flex gap-4 p-5 hover:bg-muted/50 transition">
                  {r.cover_image_url && (
                    <img
                      src={r.cover_image_url}
                      alt=""
                      loading="lazy"
                      className="w-24 h-24 rounded-lg object-cover flex-shrink-0 hidden sm:block"
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="font-display font-extrabold text-foreground text-lg leading-snug line-clamp-2">
                      {r.title}
                    </h2>
                    {r.excerpt && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{r.excerpt}</p>}
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatDateFr(r.published_at)}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.reading_time_minutes} min</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <BlogFooterCTA />
      </main>
    </div>
  );
}