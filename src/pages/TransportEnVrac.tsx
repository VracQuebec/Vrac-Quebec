// Pilier SEO « Transport en vrac ».
// Aucune capacité, aucun délai et aucun prix ne sont affirmés ici :
// la page décrit le fonctionnement réel de la plateforme et renvoie vers
// les pages existantes (types de camions, villes, demande de transport).
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChevronRight, Home, MapPin, Truck, Calculator, FileText } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { supabase } from "@/integrations/supabase/client";

const SITE = "https://vracquebec.ca";
const URL = `${SITE}/transport-en-vrac`;

type CityLink = { slug: string; title: string };

export default function TransportEnVrac() {
  const [cities, setCities] = useState<CityLink[]>([]);
  const [materials, setMaterials] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    void (async () => {
      const [pages, mats] = await Promise.all([
        supabase
          .from("seo_pages")
          .select("slug,title,city_slug")
          .eq("status", "published")
          .like("slug", "transport-vrac-%")
          .order("slug"),
        supabase.from("seo_materials").select("slug,name").order("name"),
      ]);
      setCities(((pages.data ?? []) as CityLink[]).map((p) => ({ slug: p.slug, title: p.title })));
      setMaterials((mats.data ?? []) as { slug: string; name: string }[]);
    })();
  }, []);

  const title = "Transport en vrac au Québec : comment ça fonctionne | Vrac Québec";
  const description =
    "Transport de matériaux en vrac dans la région de Québec et de Lévis : fonctionnement de la plateforme, types de camions, matériaux et villes couvertes. Faites votre demande.";

  const jsonLdService = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${URL}#service`,
    name: "Transport de matériaux en vrac",
    serviceType: "Transport en vrac",
    url: URL,
    description,
    areaServed: { "@type": "AdministrativeArea", name: "Région de Québec et Chaudière-Appalaches" },
    provider: { "@type": "Organization", name: "Vrac Québec", url: SITE },
  };
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Transport en vrac", item: URL },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={URL} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={URL} />
        <script type="application/ld+json">{JSON.stringify(jsonLdService)}</script>
        <script type="application/ld+json">{JSON.stringify(jsonLdBreadcrumb)}</script>
      </Helmet>
      <TransportBanner />

      <nav aria-label="Fil d'Ariane" className="container mx-auto px-4 sm:px-6 pt-4 flex items-center gap-1 text-xs text-muted-foreground font-body">
        <Link to="/" className="hover:text-foreground flex items-center gap-1"><Home className="w-3 h-3" /> Accueil</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-semibold">Transport en vrac</span>
      </nav>

      <header className="container mx-auto px-4 sm:px-6 pt-6 pb-10">
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">
          Transport en vrac dans la région de Québec
        </h1>
        <p className="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">
          Vrac Québec est une plateforme de mise en relation. Vous décrivez le matériau à déplacer,
          le point de chargement et le point de livraison : les transporteurs partenaires en mesure
          de desservir votre secteur vous répondent avec leur prix et leurs disponibilités.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/demande-transport" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold shadow-lg hover:opacity-90">
            <Truck className="w-4 h-4" /> Demander un transport
          </Link>
          <Link to="/soumission" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border font-display font-bold text-foreground hover:border-primary">
            <FileText className="w-4 h-4" /> Obtenir une soumission
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 pb-16 space-y-12">
        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">Comment se déroule une demande</h2>
          <ol className="space-y-2 font-body text-muted-foreground list-decimal pl-5 max-w-2xl">
            <li>Vous décrivez le matériau, la quantité approximative et les adresses concernées.</li>
            <li>La demande est acheminée aux transporteurs et fournisseurs qui couvrent le secteur.</li>
            <li>Vous recevez leurs réponses : prix, camion proposé et disponibilité confirmés par eux.</li>
            <li>Vous choisissez l'offre qui vous convient. Aucun engagement avant votre accord.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">Types de camions</h2>
          <p className="font-body text-muted-foreground max-w-2xl">
            Le camion utilisé dépend du volume, de l'accès au chantier et du matériau. Les usages et
            contraintes de chaque type sont détaillés sur la page dédiée.
          </p>
          <Link to="/types-de-camions" className="mt-3 inline-flex items-center gap-2 text-primary font-display font-semibold hover:underline">
            Voir les types de camions <ChevronRight className="w-4 h-4" />
          </Link>
        </section>

        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">Matériaux transportés</h2>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {materials.map((m) => (
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

        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-3 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> Villes couvertes
          </h2>
          <p className="font-body text-muted-foreground max-w-2xl mb-3">
            Les secteurs ci-dessous disposent d'une page dédiée au transport en vrac. La couverture
            réelle d'une adresse dépend des transporteurs disponibles au moment de la demande.
          </p>
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {cities.map((c) => (
              <li key={c.slug}>
                <Link to={`/${c.slug}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary font-body text-sm text-foreground">
                  {c.title.split(":")[0].trim()}
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/livraison" className="mt-3 inline-flex items-center gap-2 text-primary font-display font-semibold hover:underline">
            Toutes les zones desservies <ChevronRight className="w-4 h-4" />
          </Link>
        </section>

        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">Outils utiles</h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/calculateur" className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-border font-body text-foreground hover:border-primary">
              <Calculator className="w-4 h-4 text-primary" /> Calculer ma quantité
            </Link>
            <Link to="/depot-materiaux" className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-border font-body text-foreground hover:border-primary">
              <MapPin className="w-4 h-4 text-primary" /> Disposer de matériaux (dompe)
            </Link>
            <Link to="/blog/categorie/transport-en-vrac" className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-border font-body text-foreground hover:border-primary">
              <FileText className="w-4 h-4 text-primary" /> Guides sur le transport
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-display font-bold text-foreground">Prêt à faire transporter vos matériaux ?</h2>
          <p className="mt-2 font-body text-muted-foreground">
            Décrivez votre besoin : les partenaires disponibles dans votre secteur vous répondent.
          </p>
          <Link to="/demande-transport" className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90">
            <Truck className="w-4 h-4" /> Demander un transport
          </Link>
        </section>
      </main>
    </div>
  );
}
