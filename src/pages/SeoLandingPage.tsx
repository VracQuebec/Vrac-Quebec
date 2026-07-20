import { useEffect, useMemo, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronRight, Home, MapPin, Truck, Loader2, MapPinned } from "lucide-react";
import Questionnaire from "@/components/Questionnaire";
import TransportBanner from "@/components/TransportBanner";
import { supabase } from "@/integrations/supabase/client";
import { useSeoData } from "@/hooks/useSeoData";
import LocalLanding from "./LocalLanding";
import InternalLinksBlock, { type InternalLink } from "@/components/seo/InternalLinksBlock";

const SITE = "https://vracquebec.ca";

type SeoPage = {
  id: string;
  slug: string;
  city_slug: string;
  material_slug: string | null;
  service_slug: string | null;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  h1: string | null;
  intro: string | null;
  content_html: string;
  faq: Array<{ question: string; answer: string }>;
  cover_image_url: string | null;
  cover_image_alt?: string | null;
  internal_links?: InternalLink[];
  status: string;
};

export default function SeoLandingPage() {
  const { localSlug } = useParams();
  const slug = (localSlug || "").toLowerCase();
  const [page, setPage] = useState<SeoPage | null>(null);
  const [dumpCount, setDumpCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { cityMap, materialMap, resolveLocalSlug, ready } = useSeoData();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("seo_pages")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (cancelled) return;
      const p = (data ?? null) as unknown as SeoPage | null;
      setPage(p);
      if (p?.city_slug) {
        const { data: cnt } = await supabase.rpc("count_active_dumps_by_city", { _city_slug: p.city_slug });
        if (!cancelled) setDumpCount(typeof cnt === "number" ? cnt : 0);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Fallback to the legacy material-city template while the DB page loads or is missing.
  const legacyMatch = useMemo(() => resolveLocalSlug(slug), [slug, resolveLocalSlug]);

  if (loading || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!page) {
    if (legacyMatch) return <LocalLanding />;
    return <Navigate to="/404" replace />;
  }

  const city = cityMap[page.city_slug];
  const material = page.material_slug ? materialMap[page.material_slug] : null;
  const url = `${SITE}/${page.slug}`;
  const title = page.meta_title || page.title;
  const description = page.meta_description || page.intro?.slice(0, 158) || "";
  const h1 = page.h1 || page.title;

  const jsonLdLocalBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#business`,
    name: `Vrac Québec — ${page.title}`,
    url,
    telephone: "+1-581-994-7717",
    priceRange: "$$",
    areaServed: city ? { "@type": "City", name: city.name } : undefined,
    address: city ? { "@type": "PostalAddress", addressLocality: city.name, addressRegion: "QC", addressCountry: "CA" } : undefined,
    geo: city ? { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng } : undefined,
    description,
  };
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Zones desservies", item: `${SITE}/livraison` },
      ...(city ? [{ "@type": "ListItem", position: 3, name: city.name, item: `${SITE}/livraison/${city.slug}` }] : []),
      { "@type": "ListItem", position: city ? 4 : 3, name: page.title, item: url },
    ],
  };
  const jsonLdFaq = page.faq?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : null;

  const neighborCities = city?.neighbors.map((s) => cityMap[s]).filter(Boolean) ?? [];
  const internalLinks: InternalLink[] = Array.isArray(page.internal_links) ? page.internal_links : [];

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={url} />
        {page.cover_image_url && <meta property="og:image" content={page.cover_image_url} />}
        {page.cover_image_url && page.cover_image_alt && (
          <meta property="og:image:alt" content={page.cover_image_alt} />
        )}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {page.cover_image_url && <meta name="twitter:image" content={page.cover_image_url} />}
        <script type="application/ld+json">{JSON.stringify(jsonLdLocalBusiness)}</script>
        <script type="application/ld+json">{JSON.stringify(jsonLdBreadcrumb)}</script>
        {jsonLdFaq && <script type="application/ld+json">{JSON.stringify(jsonLdFaq)}</script>}
      </Helmet>

      <TransportBanner />

      <nav aria-label="Fil d'Ariane" className="container mx-auto px-4 sm:px-6 pt-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground font-body">
        <Link to="/" className="hover:text-foreground flex items-center gap-1"><Home className="w-3 h-3" /> Accueil</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/livraison" className="hover:text-foreground">Zones desservies</Link>
        {city && (<>
          <ChevronRight className="w-3 h-3" />
          <Link to={`/livraison/${city.slug}`} className="hover:text-foreground">{city.name}</Link>
        </>)}
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-semibold truncate">{page.title}</span>
      </nav>

      <header className="container mx-auto px-4 sm:px-6 pt-6 pb-8">
        {city && (
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary text-xs font-display font-semibold px-3 py-1.5 mb-4">
            <MapPin className="w-3.5 h-3.5" /> {city.name} · {city.region}
          </div>
        )}
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">
          {h1}
        </h1>
        {page.intro && (
          <p className="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">{page.intro}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#soumission" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold shadow-lg hover:opacity-90 transition-opacity">
            <Truck className="w-4 h-4" /> Obtenir une soumission gratuite
          </a>
        </div>
      </header>

      <article className="container mx-auto px-4 sm:px-6 pb-10 prose prose-neutral dark:prose-invert max-w-3xl">
        <div dangerouslySetInnerHTML={{ __html: page.content_html }} />
      </article>

      {city && dumpCount !== null && dumpCount > 0 && (
        <section className="container mx-auto px-4 sm:px-6 pb-8">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex items-start gap-4">
            <div className="shrink-0 rounded-lg bg-primary/15 p-2">
              <MapPinned className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-display font-bold text-foreground text-lg">
                {dumpCount} {dumpCount > 1 ? "points de dépôt actifs" : "point de dépôt actif"} à {city.name}
              </p>
              <p className="text-sm text-muted-foreground font-body mt-1">
                Vrac Québec connecte les clients aux dompes disponibles dans le secteur — soumettez votre demande pour être mis en relation.
              </p>
            </div>
          </div>
        </section>
      )}

      <section id="soumission" className="bg-muted/30 py-10 border-y border-border">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              Faire une demande{city ? ` à ${city.name}` : ""}
            </h2>
            <p className="text-muted-foreground font-body mt-1">
              Formulaire rapide — moins d'une minute pour recevoir une soumission.
            </p>
          </div>
          <Questionnaire />
        </div>
      </section>

      {page.faq?.length > 0 && (
        <section className="container mx-auto px-4 sm:px-6 py-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">Questions fréquentes</h2>
          <div className="space-y-3">
            {page.faq.map((f) => (
              <details key={f.question} className="rounded-lg border border-border bg-card p-4">
                <summary className="font-display font-semibold text-foreground cursor-pointer">{f.question}</summary>
                <p className="text-muted-foreground font-body mt-2">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <InternalLinksBlock links={internalLinks} />

      {(neighborCities.length > 0 || material) && (
        <section className="container mx-auto px-4 sm:px-6 pb-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          {material && city && (
            <div>
              <h2 className="text-xl font-display font-bold text-foreground mb-3">
                {material.shortName} dans les villes voisines
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {neighborCities.map((n) => (
                  <li key={n.slug}>
                    <Link to={`/${material.slug}-${n.slug}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary font-body text-foreground">
                      {material.shortName} à {n.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {city && (
            <div>
              <h2 className="text-xl font-display font-bold text-foreground mb-3">Autres pages à {city.name}</h2>
              <Link to={`/livraison/${city.slug}`} className="text-primary hover:underline font-body">
                Voir toutes les livraisons à {city.name} →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}