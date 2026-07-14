import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { MapPin, ChevronRight, Home } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { useSeoData } from "@/hooks/useSeoData";
import { useMemo } from "react";

const SITE = "https://vracquebec.ca";

export default function LocalIndex() {
  const { cities } = useSeoData();
  const byRegion = useMemo(() => {
    const acc: Record<string, typeof cities> = {};
    for (const c of cities) (acc[c.region || "Autres"] ||= []).push(c);
    return acc;
  }, [cities]);
  const title = "Zones desservies — Livraison de vrac à Québec, Lévis et environs | Vrac Québec";
  const description =
    "Vrac Québec livre terre, sable, gravier, pierre concassée et remblai à Québec, Lévis, Beauport, Charlesbourg, Sainte-Foy et 30+ villes environnantes. Trouvez votre municipalité.";
  const url = `${SITE}/livraison`;

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
        <span className="text-foreground font-semibold">Zones desservies</span>
      </nav>
      <header className="container mx-auto px-4 sm:px-6 pt-6 pb-8">
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground">
          Livraison de vrac — Québec, Lévis et environs
        </h1>
        <p className="mt-3 text-base md:text-lg text-muted-foreground font-body max-w-2xl">
          Terre, sable, gravier, pierre concassée, remblai : Vrac Québec dessert plus de 30 municipalités dans la région de Québec et de Lévis. Sélectionnez votre ville pour découvrir les matériaux disponibles.
        </p>
      </header>
      <main className="container mx-auto px-4 sm:px-6 pb-12 space-y-8">
        {Object.entries(byRegion).map(([region, cs]) => (
          <section key={region}>
            <h2 className="text-xl font-display font-bold text-foreground mb-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> {region}
            </h2>
            <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {cs.map((c) => (
                <li key={c.slug}>
                  <Link to={`/livraison/${c.slug}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary font-body text-foreground">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}