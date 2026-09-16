import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { MapPin, ChevronRight, Home, Loader2 } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { supabase } from "@/integrations/supabase/client";
import type { SeoCity } from "@/lib/seo/manager";

const SITE = "https://vracquebec.ca";

export default function ZonesIndex() {
  const [cities, setCities] = useState<SeoCity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("seo_cities")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      setCities((data ?? []) as SeoCity[]);
      setLoading(false);
    })();
  }, []);

  const byRegion = useMemo(() => {
    const acc: Record<string, SeoCity[]> = {};
    for (const c of cities) (acc[c.region || "Autres"] ||= []).push(c);
    return acc;
  }, [cities]);

  const title = "Livraison de matériaux en vrac — Québec, Lévis et environs | Vrac Québec";
  const description =
    "Faire livrer terre, sable, gravier, pierre concassée ou remblai dans la région de Québec et de Lévis : fonctionnement, matériaux, villes desservies et demande gratuite.";
  const url = `${SITE}/livraison`;
  const jsonLdService = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${url}#service`,
    name: "Livraison de matériaux en vrac",
    serviceType: "Livraison de matériaux en vrac",
    url,
    description,
    areaServed: { "@type": "AdministrativeArea", name: "Région de Québec et Chaudière-Appalaches" },
    provider: { "@type": "Organization", name: "Vrac Québec", url: SITE },
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
        <script type="application/ld+json">{JSON.stringify(jsonLdService)}</script>
      </Helmet>
      <TransportBanner />
      <nav aria-label="Fil d'Ariane" className="container mx-auto px-4 sm:px-6 pt-4 flex items-center gap-1 text-xs text-muted-foreground font-body">
        <Link to="/" className="hover:text-foreground flex items-center gap-1"><Home className="w-3 h-3" /> Accueil</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-semibold">Zones desservies</span>
      </nav>
      <header className="container mx-auto px-4 sm:px-6 pt-6 pb-8">
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground">
          Livraison de matériaux en vrac — Québec, Lévis et environs
        </h1>
        <p className="mt-3 text-base md:text-lg text-muted-foreground font-body max-w-2xl">
          Terre, sable, gravier, pierre concassée, remblai : décrivez votre besoin et les
          fournisseurs et transporteurs disponibles dans votre secteur vous transmettent leur prix.
          Vrac Québec est une plateforme de mise en relation, sans engagement de votre part.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/soumission" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold shadow-lg hover:opacity-90">
            <FileText className="w-4 h-4" /> Obtenir une soumission
          </Link>
          <Link to="/calculateur" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border font-display font-bold text-foreground hover:border-primary">
            <Calculator className="w-4 h-4" /> Calculer ma quantité
          </Link>
        </div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 pb-12 space-y-8">
        <section>
          <h2 className="text-xl font-display font-bold text-foreground mb-3">Matériaux livrés</h2>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {MATERIAL_LINKS.map((m) => (
              <li key={m.slug}>
                <Link to={`/materiaux/${m.slug}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary font-body text-foreground">
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/materiaux" className="mt-3 inline-flex items-center gap-2 text-primary font-display font-semibold hover:underline">
            Tous les matériaux <ChevronRight className="w-4 h-4" />
          </Link>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Link to="/transport-en-vrac" className="rounded-xl border border-border bg-card p-4 hover:border-primary">
            <p className="font-display font-bold text-foreground">Transport en vrac</p>
            <p className="font-body text-sm text-muted-foreground mt-1">Faire déplacer des matériaux entre deux points.</p>
          </Link>
          <Link to="/depot-materiaux" className="rounded-xl border border-border bg-card p-4 hover:border-primary">
            <p className="font-display font-bold text-foreground">Disposer de matériaux</p>
            <p className="font-body text-sm text-muted-foreground mt-1">Trouver un point de dépôt ou une dompe.</p>
          </Link>
          <Link to="/blog/guides" className="rounded-xl border border-border bg-card p-4 hover:border-primary">
            <p className="font-display font-bold text-foreground">Guides pratiques</p>
            <p className="font-body text-sm text-muted-foreground mt-1">Choisir le bon matériau et la bonne quantité.</p>
          </Link>
        </section>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
        ) : (
          Object.entries(byRegion).map(([region, cs]) => (
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
          ))
        )}
      </main>
    </div>
  );
}