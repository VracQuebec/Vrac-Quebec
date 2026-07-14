import { Helmet } from "react-helmet-async";
import { Link, useParams, Navigate } from "react-router-dom";
import { ChevronRight, Home, MapPin, Truck } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { useSeoData } from "@/hooks/useSeoData";

const SITE = "https://vracquebec.ca";

export default function LocalCityIndex() {
  const { citySlug } = useParams();
  const { cityMap, materials, ready } = useSeoData();
  const city = citySlug ? cityMap[citySlug] : undefined;
  if (!city) {
    if (!ready) return <div className="min-h-screen" />; // wait for data
    return <Navigate to="/404" replace />;
  }

  const title = `Livraison de vrac à ${city.name} — Terre, sable, gravier, remblai | Vrac Québec`;
  const description = `Vrac Québec livre terre, sable, gravier, pierre concassée et remblai directement à ${city.name}. Soumission gratuite, camions adaptés, livraison rapide.`.slice(0, 158);
  const url = `${SITE}/livraison/${city.slug}`;

  const neighbors = city.neighbors.map((s) => cityMap[s]).filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
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
                  <div className="font-display font-bold text-foreground">{m.shortName} à {city.name}</div>
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
      </main>
    </div>
  );
}