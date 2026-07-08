import { useEffect } from "react";
import { useParams, Navigate, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Clock, Eye, Calendar } from "lucide-react";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import Breadcrumbs from "@/components/blog/Breadcrumbs";
import ShareButtons from "@/components/blog/ShareButtons";
import PostCard from "@/components/blog/PostCard";
import TableOfContents from "@/components/blog/TableOfContents";
import { fetchPostBySlug, fetchRelatedPosts } from "@/lib/blog/queries";
import { formatDateFr, sanitizeHtml, SITE_URL, absoluteUrl, processContentWithToc } from "@/lib/blog/utils";
import { PackagePlus, Truck, Send } from "lucide-react";

export default function BlogPost() {
  const { slug = "" } = useParams();
  const location = useLocation();

  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: () => fetchPostBySlug(slug),
  });

  const { data: related = [] } = useQuery({
    queryKey: ["blog-related", post?.id],
    queryFn: () => fetchRelatedPosts(post!, 3),
    enabled: !!post,
  });

  // Redirect legacy slug to canonical slug
  useEffect(() => {
    if (post && post.slug !== slug) {
      // handled by Navigate below
    }
  }, [post, slug]);

  if (!isLoading && !post) return <Navigate to="/blog" replace />;
  if (post && post.slug !== slug) return <Navigate to={`/blog/${post.slug}`} replace />;

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <BlogNav />
        <div className="container mx-auto px-6 py-24 text-center text-muted-foreground">Chargement…</div>
      </div>
    );
  }

  const cat = post.blog_categories;
  const author = post.blog_authors;
  const url = `${SITE_URL}/blog/${post.slug}`;
  const title = post.meta_title || `${post.title} — Vrac Québec`;
  const description = post.meta_description || post.excerpt || "";
  const ogImage = post.og_image_url || post.cover_image_url || undefined;
  const canonical = post.canonical_url || url;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description,
    image: ogImage ? [ogImage] : undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: author ? { "@type": "Person", name: author.name } : { "@type": "Organization", name: "Vrac Québec" },
    publisher: {
      "@type": "Organization",
      name: "Vrac Québec",
      url: SITE_URL,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: cat?.name,
  };

  const cleanContent = sanitizeHtml(post.content || "");
  const { html: contentWithIds, toc } = processContentWithToc(cleanContent);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        {post.noindex && <meta name="robots" content="noindex,follow" />}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        {ogImage && <meta property="og:image" content={absoluteUrl(ogImage)} />}
        {post.published_at && <meta property="article:published_time" content={post.published_at} />}
        {post.updated_at && <meta property="article:modified_time" content={post.updated_at} />}
        {cat && <meta property="article:section" content={cat.name} />}
        <script type="application/ld+json">{JSON.stringify(articleLd)}</script>
      </Helmet>
      <BlogNav />

      <div className="container mx-auto px-4 sm:px-6 pt-6">
        <Breadcrumbs
          items={[
            { label: "Blogue", to: "/blog" },
            ...(cat ? [{ label: cat.name, to: `/blog/categorie/${cat.slug}` }] : []),
            { label: post.title },
          ]}
        />
      </div>

      <article className="container mx-auto px-4 sm:px-6 py-8 max-w-3xl">
        {cat && (
          <Link
            to={`/blog/categorie/${cat.slug}`}
            className="inline-block px-3 py-1 rounded-full text-white text-xs uppercase font-display font-bold tracking-widest mb-4"
            style={{ backgroundColor: cat.color || "#7ED321" }}
          >
            {cat.name}
          </Link>
        )}
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-[1.1]">
          {post.title}
        </h1>
        {post.excerpt && (
          <p className="mt-4 text-lg text-muted-foreground font-body leading-relaxed">{post.excerpt}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground font-body border-y border-border py-4">
          {author && (
            <div className="flex items-center gap-2">
              {author.avatar_url ? (
                <img src={author.avatar_url} alt={author.name} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                  {author.name.charAt(0)}
                </div>
              )}
              <div>
                <div className="font-semibold text-foreground">{author.name}</div>
                {author.title && <div className="text-[11px]">{author.title}</div>}
              </div>
            </div>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> {formatDateFr(post.published_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> {post.reading_time_minutes} min de lecture
          </span>
          {post.view_count > 0 && (
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> {post.view_count} vues
            </span>
          )}
        </div>

        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt={post.cover_image_alt || post.title}
            width={1200}
            height={675}
            className="mt-6 w-full rounded-2xl object-cover aspect-[16/9]"
            fetchPriority="high"
          />
        )}

        <TableOfContents items={toc} />

        <div
          className="prose prose-lg max-w-none mt-8 font-body prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl"
          dangerouslySetInnerHTML={{ __html: contentWithIds }}
        />

        <div className="mt-10 pt-6 border-t border-border">
          <ShareButtons url={url} title={post.title} />
        </div>

        {/* Automatic end-of-article CTAs */}
        <div className="mt-10 rounded-2xl bg-primary/10 border border-primary/30 p-6">
          <h3 className="text-xl font-display font-extrabold text-foreground text-center">
            Un projet en tête?
          </h3>
          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            <Link to="/#questionnaire" className="flex flex-col items-center text-center gap-2 px-4 py-4 rounded-xl bg-primary text-primary-foreground font-display font-bold shadow hover:opacity-90 transition">
              <PackagePlus className="w-5 h-5" />
              <span className="text-sm">Faire une demande de remblai</span>
            </Link>
            <Link to="/#questionnaire" className="flex flex-col items-center text-center gap-2 px-4 py-4 rounded-xl border-2 border-primary text-primary font-display font-bold hover:bg-primary/10 transition">
              <Truck className="w-5 h-5" />
              <span className="text-sm">Déposer des matériaux</span>
            </Link>
            <Link to="/#questionnaire" className="flex flex-col items-center text-center gap-2 px-4 py-4 rounded-xl border-2 border-border text-foreground font-display font-bold hover:bg-muted transition">
              <Send className="w-5 h-5" />
              <span className="text-sm">Demander une soumission de transport</span>
            </Link>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <section className="container mx-auto px-4 sm:px-6 py-10">
          <h2 className="text-2xl font-display font-extrabold text-foreground mb-6">Articles similaires</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      <div className="container mx-auto px-4 sm:px-6">
        <BlogFooterCTA />
      </div>
    </div>
  );
}