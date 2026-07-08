import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Calculator, BookOpen, HelpCircle, Sparkles, Flame, Clock as ClockIcon, Star } from "lucide-react";
import blogHero from "@/assets/blog-hero.jpg";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import PostCard from "@/components/blog/PostCard";
import CategoryPills from "@/components/blog/CategoryPills";
import SearchBar from "@/components/blog/SearchBar";
import { fetchCategories, fetchPublishedPosts } from "@/lib/blog/queries";
import { SITE_URL } from "@/lib/blog/utils";

export default function Blog() {
  const { data: categories = [] } = useQuery({ queryKey: ["blog-categories"], queryFn: fetchCategories });
  const { data: featured = [] } = useQuery({
    queryKey: ["blog-featured"],
    queryFn: () => fetchPublishedPosts({ featured: true, limit: 3 }),
  });
  const { data: popular = [] } = useQuery({
    queryKey: ["blog-popular"],
    queryFn: () => fetchPublishedPosts({ popular: true, limit: 4 }),
  });
  const { data: recent = [] } = useQuery({
    queryKey: ["blog-recent"],
    queryFn: () => fetchPublishedPosts({ limit: 9 }),
  });
  const { data: recommended = [] } = useQuery({
    queryKey: ["blog-recommended"],
    queryFn: () => fetchPublishedPosts({ featured: true, limit: 6 }),
  });

  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Centre de connaissances Vrac Québec",
    url: `${SITE_URL}/blog`,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/blog/recherche?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Centre de connaissances Vrac Québec — Guides, remblai, transport en vrac</title>
        <meta
          name="description"
          content="Guides, articles et calculateurs sur le remblai, la terre, le sable, le gravier, la pierre et le transport en vrac au Québec. Centre de connaissances Vrac Québec."
        />
        <link rel="canonical" href={`${SITE_URL}/blog`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Centre de connaissances Vrac Québec" />
        <meta property="og:description" content="La plus grande bibliothèque francophone sur le vrac, le remblai et le transport de matériaux au Québec." />
        <meta property="og:url" content={`${SITE_URL}/blog`} />
        <script type="application/ld+json">{JSON.stringify(websiteLd)}</script>
      </Helmet>

      <BlogNav />

      {/* HERO */}
      <header
        className="relative overflow-hidden bg-foreground text-background"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(17,17,17,0.55) 0%, rgba(17,17,17,0.85) 100%), url(${blogHero})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs uppercase tracking-widest font-display font-bold mb-6">
            <Sparkles className="w-3.5 h-3.5" /> Centre de connaissances
          </div>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-extrabold leading-[1.05] drop-shadow-lg">
            Tout sur le <span className="text-primary">vrac au Québec</span>
          </h1>
          <p className="mt-5 text-background/80 font-body text-base md:text-lg max-w-2xl">
            Guides, calculateurs, conseils d'experts et réponses aux questions fréquentes sur le remblai, la terre, le sable, le gravier, la pierre et le transport en vrac.
          </p>
          <div className="mt-8">
            <SearchBar size="lg" />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/#questionnaire"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-display font-bold text-sm shadow-lg hover:opacity-90 transition"
            >
              Faire une demande de remblai
            </Link>
            <Link
              to="/#questionnaire"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border-2 border-primary text-primary font-display font-bold text-sm hover:bg-primary/10 transition"
            >
              Déposer des matériaux
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-10 md:py-14 space-y-14">
        {/* Categories */}
        <section>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-xl md:text-2xl font-display font-extrabold text-foreground">Explorer par catégorie</h2>
          </div>
          <CategoryPills categories={categories} />
        </section>

        {/* Featured */}
        {featured.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-display font-extrabold text-foreground">Articles vedettes</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featured.map((p, i) => (
                <PostCard key={p.id} post={p} variant={i === 0 ? "featured" : "default"} />
              ))}
            </div>
          </section>
        )}

        {/* Popular */}
        {popular.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Flame className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-display font-extrabold text-foreground">Les plus populaires</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {popular.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </section>
        )}

        {/* Recent */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <ClockIcon className="w-5 h-5 text-primary" />
            <h2 className="text-xl md:text-2xl font-display font-extrabold text-foreground">Articles récents</h2>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground font-body">
              Aucun article publié pour l'instant. Revenez bientôt — la bibliothèque se remplit rapidement !
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {recent.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          )}
        </section>

        {/* Section entries: Calculators / Guides / FAQ shortcuts */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ShortcutCard
            to="/blog/outils"
            icon={<Calculator className="w-5 h-5" />}
            title="Outils gratuits"
            desc="Calculateurs : tonnage, verges cubes, volume, voyages de camion, coût de transport."
            color="#8B5CF6"
          />
          <ShortcutCard
            to="/blog/guides"
            icon={<BookOpen className="w-5 h-5" />}
            title="Guides pratiques"
            desc="Étape par étape : préparer votre terrain, choisir le bon matériau, commander en vrac."
            color="#10B981"
          />
          <ShortcutCard
            to="/blog/faq"
            icon={<HelpCircle className="w-5 h-5" />}
            title="Questions fréquentes"
            desc="Toutes vos réponses sur le remblai, la livraison et le transport en vrac au Québec."
            color="#EC4899"
          />
        </section>

        {/* Recommandés */}
        {recommended.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Star className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-display font-extrabold text-foreground">Articles recommandés</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommended.map((p) => <PostCard key={p.id} post={p} />)}
            </div>
          </section>
        )}

        <BlogFooterCTA />
      </main>

      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6 text-center text-xs text-muted-foreground font-body">
          © 2026 VracQuébec. Tous droits réservés.
          {" · "}
          <Link to="/" className="hover:text-foreground">Accueil</Link>
          {" · "}
          <Link to="/blog" className="hover:text-foreground">Blogue</Link>
        </div>
      </footer>
    </div>
  );
}

function ShortcutCard({
  to, icon, title, desc, color,
}: { to: string; icon: React.ReactNode; title: string; desc: string; color: string }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-card p-6 hover:shadow-lg transition"
    >
      <div
        className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-white mb-4"
        style={{ backgroundColor: color }}
      >
        {icon}
      </div>
      <h3 className="text-lg font-display font-extrabold text-foreground group-hover:text-primary transition">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground font-body">{desc}</p>
    </Link>
  );
}
