import { useEffect, useMemo, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronRight, Home, MapPin, Truck, Loader2, MapPinned, CheckCircle2, Phone, MessageCircle } from "lucide-react";
import Questionnaire from "@/components/Questionnaire";
import TransportBanner from "@/components/TransportBanner";
import { supabase } from "@/integrations/supabase/client";
import InternalLinksBlock, { type InternalLink } from "@/components/seo/InternalLinksBlock";
import { logSeoEvent, logSeoViewOnce } from "@/lib/seo/tracking";
import {
  matchMaterialCitySlug,
  RESERVED_TOP_LEVEL_SLUGS,
  type SeoCity,
  type SeoMaterial,
} from "@/lib/seo/manager";

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
  const [cities, setCities] = useState<SeoCity[]>([]);
  const [materials, setMaterials] = useState<SeoMaterial[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<Array<{ slug: string; title: string; excerpt: string | null; cover_image_url: string | null }>>([]);

  const cityMap = useMemo(
    () => Object.fromEntries(cities.map((c) => [c.slug, c])) as Record<string, SeoCity>,
    [cities],
  );
  const materialMap = useMemo(
    () => Object.fromEntries(materials.map((m) => [m.slug, m])) as Record<string, SeoMaterial>,
    [materials],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (RESERVED_TOP_LEVEL_SLUGS.has(slug)) {
        setLoading(false);
        return;
      }
      const [pageRes, citiesRes, materialsRes] = await Promise.all([
        supabase.from("seo_pages").select("*").eq("slug", slug).eq("status", "published").maybeSingle(),
        supabase.from("seo_cities").select("*").eq("active", true).order("sort_order"),
        supabase.from("seo_materials").select("*").eq("active", true).order("sort_order"),
      ]);
      if (cancelled) return;
      const p = (pageRes.data ?? null) as unknown as SeoPage | null;
      setPage(p);
      setCities((citiesRes.data ?? []) as SeoCity[]);
      setMaterials((materialsRes.data ?? []) as SeoMaterial[]);
      const citySlugForCount = p?.city_slug;
      if (citySlugForCount) {
        const { data: cnt } = await supabase.rpc("count_active_dumps_by_city", { _city_slug: citySlugForCount });
        if (!cancelled) setDumpCount(typeof cnt === "number" ? cnt : 0);
      }
      // Load related blog posts (posts tagged with this city/material/service in SEO Manager)
      if (p) {
        const filters: string[] = [];
        if (p.city_slug) filters.push(`related_city_slugs.cs.{${p.city_slug}}`);
        if (p.material_slug) filters.push(`related_material_slugs.cs.{${p.material_slug}}`);
        if (p.service_slug) filters.push(`related_service_slugs.cs.{${p.service_slug}}`);
        if (filters.length) {
          const { data: postsData } = await supabase
            .from("blog_posts")
            .select("slug, title, excerpt, cover_image_url")
            .eq("status", "published")
            .or(filters.join(","))
            .limit(3);
          if (!cancelled) setRelatedPosts((postsData ?? []) as typeof relatedPosts);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (page?.slug) logSeoViewOnce(page.slug);
  }, [page?.slug]);

  // If no seo_pages row exists, try matching {material-slug}-{city-slug} against DB.
  const legacyMatch = useMemo(
    () => matchMaterialCitySlug(slug, materials, cityMap),
    [slug, materials, cityMap],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!page) {
    if (legacyMatch) {
      const m = materialMap[legacyMatch.materialSlug];
      const c = cityMap[legacyMatch.citySlug];
      if (m && c) return <MaterialCityFallback material={m} city={c} cities={cities} materials={materials} />;
    }
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
    geo: city && city.latitude != null && city.longitude != null ? { "@type": "GeoCoordinates", latitude: city.latitude, longitude: city.longitude } : undefined,
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
          <a
            href="tel:+15819947717"
            onClick={() => logSeoEvent(page.slug, "phone_click")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-card text-foreground font-display font-bold hover:border-primary transition-colors"
          >
            <Phone className="w-4 h-4" /> 581-994-7717
          </a>
          <a
            href="https://wa.me/15819947717"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logSeoEvent(page.slug, "whatsapp_click")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-card text-foreground font-display font-bold hover:border-primary transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
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
          <Questionnaire sourcePageSlug={page.slug} />
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

      {relatedPosts.length > 0 && (
        <section className="container mx-auto px-4 sm:px-6 pb-10 border-t border-border pt-8">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-4">Guides & conseils</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {relatedPosts.map((p) => (
              <Link key={p.slug} to={`/blog/${p.slug}`} className="block rounded-xl border border-border bg-card overflow-hidden hover:border-primary transition-colors">
                {p.cover_image_url && (
                  <img src={p.cover_image_url} alt="" loading="lazy" className="w-full aspect-video object-cover" />
                )}
                <div className="p-4">
                  <h3 className="font-display font-bold text-foreground line-clamp-2">{p.title}</h3>
                  {p.excerpt && <p className="text-sm text-muted-foreground font-body mt-2 line-clamp-2">{p.excerpt}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(neighborCities.length > 0 || material) && (
        <section className="container mx-auto px-4 sm:px-6 pb-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          {material && city && (
            <div>
              <h2 className="text-xl font-display font-bold text-foreground mb-3">
                {material.short_name || material.name} dans les villes voisines
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {neighborCities.map((n) => (
                  <li key={n.slug}>
                    <Link to={`/${material.slug}-${n.slug}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary font-body text-foreground">
                      {material.short_name || material.name} à {n.name}
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

/* ============================================================
 * Fallback: no seo_pages row yet, render a DB-driven landing
 * for a valid {material-slug}-{city-slug} combination.
 * ============================================================ */
function MaterialCityFallback({
  material,
  city,
  cities,
  materials,
}: {
  material: SeoMaterial;
  city: SeoCity;
  cities: SeoCity[];
  materials: SeoMaterial[];
}) {
  const url = `${SITE}/${material.slug}-${city.slug}`;
  const title = `${material.name} à ${city.name} — Livraison en vrac | Vrac Québec`;
  const description = `${material.name} livré à ${city.name} : soumission gratuite auprès des fournisseurs et entrepreneurs partenaires de Vrac Québec. Camions adaptés, réponse rapide.`.slice(0, 158);
  const h1 = `${material.name} livré à ${city.name}`;
  const unit = material.delivery_unit || "tonne";
  const cityMap = Object.fromEntries(cities.map((c) => [c.slug, c])) as Record<string, SeoCity>;
  const neighborCities = (city.neighbors || []).map((s) => cityMap[s]).filter(Boolean);
  const otherMaterials = materials.filter((m) => m.slug !== material.slug).slice(0, 8);
  const faqs = [
    { q: `Comment obtenir un prix pour du ${material.name.toLowerCase()} à ${city.name} ?`,
      a: `Vrac Québec est une plateforme de mise en relation : remplissez le formulaire ci-dessus et des fournisseurs ou entrepreneurs locaux de la région de ${city.name} vous transmettront leur prix directement selon la quantité, l'accès au terrain et la distance.` },
    { q: `Livrez-vous du ${material.name.toLowerCase()} directement à ${city.name} ?`,
      a: `Oui, Vrac Québec livre du ${material.name.toLowerCase()} partout à ${city.name} et dans les municipalités voisines, avec des camions 6, 10 ou 12 roues selon l'accès.` },
    { q: `Quelle quantité minimum de ${material.name.toLowerCase()} puis-je commander ?`,
      a: `La quantité minimum correspond généralement à un voyage de camion (environ 10 ${unit}s). Pour des besoins plus petits, on peut combiner avec un autre matériau.` },
    { q: `En combien de temps le ${material.name.toLowerCase()} peut-il être livré à ${city.name} ?`,
      a: `Selon les disponibilités, une livraison à ${city.name} peut souvent être planifiée en 24 à 72 heures. Pour un chantier urgent, précisez-le dans le formulaire.` },
  ];
  const jsonLdLocalBusiness = {
    "@context": "https://schema.org", "@type": "LocalBusiness", "@id": `${url}#business`,
    name: `Vrac Québec — ${material.name} à ${city.name}`, url, telephone: "+1-581-994-7717", priceRange: "$$",
    areaServed: { "@type": "City", name: city.name },
    address: { "@type": "PostalAddress", addressLocality: city.name, addressRegion: "QC", addressCountry: "CA" },
    geo: city.latitude != null && city.longitude != null ? { "@type": "GeoCoordinates", latitude: city.latitude, longitude: city.longitude } : undefined,
    description,
  };
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Zones desservies", item: `${SITE}/livraison` },
      { "@type": "ListItem", position: 3, name: city.name, item: `${SITE}/livraison/${city.slug}` },
      { "@type": "ListItem", position: 4, name: material.name, item: url },
    ],
  };
  const jsonLdFaq = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

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
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <script type="application/ld+json">{JSON.stringify(jsonLdLocalBusiness)}</script>
        <script type="application/ld+json">{JSON.stringify(jsonLdBreadcrumb)}</script>
        <script type="application/ld+json">{JSON.stringify(jsonLdFaq)}</script>
      </Helmet>
      <TransportBanner />
      <nav aria-label="Fil d'Ariane" className="container mx-auto px-4 sm:px-6 pt-4 flex items-center gap-1 text-xs text-muted-foreground font-body">
        <Link to="/" className="hover:text-foreground flex items-center gap-1"><Home className="w-3 h-3" /> Accueil</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/livraison" className="hover:text-foreground">Zones desservies</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/livraison/${city.slug}`} className="hover:text-foreground">{city.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-semibold">{material.name}</span>
      </nav>
      <header className="container mx-auto px-4 sm:px-6 pt-6 pb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary text-xs font-display font-semibold px-3 py-1.5 mb-4">
          <MapPin className="w-3.5 h-3.5" /> {city.name} · {city.region}
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">{h1}</h1>
        <p className="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">
          {material.description} À {city.name}, Vrac Québec vous met en relation avec des fournisseurs et entrepreneurs locaux pour livrer directement sur votre chantier ou votre résidence.
          {city.intro ? ` ${city.intro}` : ""}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#soumission" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold shadow-lg hover:opacity-90 transition-opacity">
            <Truck className="w-4 h-4" /> Obtenir une soumission gratuite
          </a>
        </div>
      </header>
      {material.use_cases?.length > 0 && (
        <section className="container mx-auto px-4 sm:px-6 pb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">
            Utilisations courantes du {(material.short_name || material.name).toLowerCase()} à {city.name}
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {material.use_cases.map((u) => (
              <li key={u} className="flex items-start gap-3 rounded-lg bg-card border border-border p-4">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-foreground font-body">{u}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section id="soumission" className="bg-muted/30 py-10 border-y border-border">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">Demander {material.name.toLowerCase()} à {city.name}</h2>
            <p className="text-muted-foreground font-body mt-1">Formulaire rapide — moins d'une minute pour recevoir une soumission.</p>
          </div>
          <Questionnaire />
        </div>
      </section>
      <section className="container mx-auto px-4 sm:px-6 py-10">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">Questions fréquentes — {material.name} à {city.name}</h2>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-lg border border-border bg-card p-4">
              <summary className="font-display font-semibold text-foreground cursor-pointer">{f.q}</summary>
              <p className="text-muted-foreground font-body mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="container mx-auto px-4 sm:px-6 pb-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground mb-3">Autres matériaux à {city.name}</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {otherMaterials.map((m) => (
              <li key={m.slug}>
                <Link to={`/${m.slug}-${city.slug}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary font-body text-foreground">
                  {m.short_name || m.name} à {city.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {neighborCities.length > 0 && (
          <div>
            <h2 className="text-xl font-display font-bold text-foreground mb-3">
              {material.short_name || material.name} dans les villes voisines
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {neighborCities.map((n) => (
                <li key={n.slug}>
                  <Link to={`/${material.slug}-${n.slug}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary font-body text-foreground">
                    {material.short_name || material.name} à {n.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}