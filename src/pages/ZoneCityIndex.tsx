import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams, Navigate } from "react-router-dom";
import { ChevronRight, Home, MapPin, Truck, Loader2 } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { supabase } from "@/integrations/supabase/client";
import type { SeoCity, SeoMaterial } from "@/lib/seo/manager";

const SITE = "https://vracquebec.ca";

export default function ZoneCityIndex() {
  const { citySlug } = useParams();
  const [city, setCity] = useState<SeoCity | null>(null);
  const [materials, setMaterials] = useState<SeoMaterial[]>([]);
  const [neighbors, setNeighbors] = useState<SeoCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!citySlug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: c } = await supabase
        .from("seo_cities")
        .select("*")
        .eq("slug", citySlug)
        .eq("active", true)
        .maybeSingle();
      if (cancelled) return;
      if (!c) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCity(c as SeoCity);
      const [{ data: m }, { data: nb }] = await Promise.all([
        supabase.from("seo_materials").select("*").eq("active", true).order("sort_order"),
        (c as SeoCity).neighbors?.length
          ? supabase.from("seo_cities").select("*").in("slug", (c as SeoCity).neighbors).eq("active", true)
          : Promise.resolve({ data: [] as SeoCity[] } as { data: SeoCity[] }),
      ]);
      if (cancelled) return;
      setMaterials((m ?? []) as SeoMaterial[]);
      setNeighbors((nb ?? []) as SeoCity[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [citySlug]);

  if (notFound) return <Navigate to="/404" replace />;
  if (loading || !city) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const title = `Livraison de matériaux en vrac à ${city.name} | Vrac Québec`;
  const description = (
    city.intro?.trim()
      ? city.intro.trim()
      : `Terre, sable, gravier et pierre concassée livrés à ${city.name} (${city.region}). Vrac Québec coordonne la livraison et la disposition de matériaux pour vos chantiers.`
  ).slice(0, 158);
  const url = `${SITE}/livraison/${city.slug}`;

  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Zones desservies", item: `${SITE}/livraison` },
      { "@type": "ListItem", position: 3, name: city.name, item: url },
    ],
  };
  const jsonLdService = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Livraison de matériaux en vrac à ${city.name}`,
    serviceType: "Livraison de terre, gravier, pierre concassée et remblai",
    areaServed: { "@type": "City", name: city.name, addressRegion: "QC", addressCountry: "CA" },
    provider: { "@type": "Organization", name: "Vrac Québec", url: SITE, telephone: "+1-581-994-7717" },
    url,
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <script type="application/ld+json">{JSON.stringify(jsonLdBreadcrumb)}</script>
        <script type="application/ld+json">{JSON.stringify(jsonLdService)}</script>
      </Helmet>
      <TransportBanner />
      <nav aria-label="Fil d'Ariane" className="container mx-auto px-4 sm:px-6 pt-4 flex items-center gap-1 text-xs text-muted-foreground font-body">
        <Link to="/" className="hover:text-foreground flex items-center gap-1"><Home className="w-3 h-3" /> Accueil</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/livraison" className="hover:text-foreground">Zones desservies</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-semibold">{city.name}</span>
      </nav>
      <header className="container mx-auto px-4 sm:px-6 pt-6 pb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary text-xs font-display font-semibold px-3 py-1.5 mb-3">
          <MapPin className="w-3.5 h-3.5" /> {city.region}
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground">
          Livraison de vrac à {city.name}
        </h1>
        <p className="mt-3 text-base md:text-lg text-muted-foreground font-body max-w-2xl">
          {city.intro || `Vrac Québec livre à ${city.name} chaque jour ouvrable. Choisissez le matériau qui correspond à votre projet.`}
        </p>
      </header>
      <main className="container mx-auto px-4 sm:px-6 pb-12 space-y-10">
        <section>
          <h2 className="text-xl font-display font-bold text-foreground mb-3 flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" /> Matériaux disponibles à {city.name}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {materials.map((m) => (
              <li key={m.slug}>
                <Link to={`/${m.slug}-${city.slug}`} className="block rounded-xl border border-border bg-card p-4 hover:border-primary transition-colors">
                  <div className="font-display font-bold text-foreground">{m.short_name || m.name} à {city.name}</div>
                  <div className="text-sm text-muted-foreground font-body mt-1">{m.description}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {neighbors.length > 0 && (
          <section>
            <h2 className="text-xl font-display font-bold text-foreground mb-3">Villes voisines desservies</h2>
            <ul className="flex flex-wrap gap-2">
              {neighbors.map((n) => (
                <li key={n.slug}>
                  <Link to={`/livraison/${n.slug}`} className="inline-block rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-primary font-body text-foreground">
                    {n.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="ressources-ville">
          <h2 id="ressources-ville" className="text-xl font-display font-bold text-foreground mb-3">
            Aller plus loin
          </h2>
          <ul className="flex flex-wrap gap-2">
            {[
              { to: "/materiaux", label: "Catalogue de matériaux en vrac" },
              { to: "/soumission", label: `Soumission de livraison à ${city.name}` },
              { to: "/depot-materiaux", label: "Disposer de terre ou de surplus" },
              { to: "/calculateur", label: "Calculer la quantité nécessaire" },
              { to: "/types-de-camions", label: "Camions de transport de matériaux" },
            ].map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="inline-block rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-primary font-body text-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}