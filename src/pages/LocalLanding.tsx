import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronRight, Home, MapPin, Truck, PhoneCall, CheckCircle2 } from "lucide-react";
import Questionnaire from "@/components/Questionnaire";
import TransportBanner from "@/components/TransportBanner";
import { useSeoData } from "@/hooks/useSeoData";

const SITE = "https://vracquebec.ca";

export default function LocalLanding() {
  const { localSlug } = useParams();
  const { resolveLocalSlug, materials, cityMap, ready } = useSeoData();
  const match = resolveLocalSlug(localSlug || "");
  if (!match) {
    if (!ready) return <div className="min-h-screen" />;
    return <Navigate to="/404" replace />;
  }
  const { material, city } = match;

  const url = `${SITE}/${material.slug}-${city.slug}`;
  const title = `${material.name} à ${city.name} — Livraison en vrac | Vrac Québec`;
  const description =
    `${material.name} livré à ${city.name} : ${material.pricingHint}. Soumission gratuite, camions adaptés, livraison rapide dans la région de Québec et Lévis.`
      .slice(0, 158);
  const h1 = `${material.name} livré à ${city.name}`;

  const faqs = buildFaq(material.name, city.name, material.pricingHint, material.deliveryUnit);

  const otherMaterials = materials.filter((m) => m.slug !== material.slug).slice(0, 8);
  const neighborCities = city.neighbors
    .map((s) => cityMap[s])
    .filter(Boolean);

  const jsonLdLocalBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#business`,
    name: `Vrac Québec — ${material.name} à ${city.name}`,
    url,
    telephone: "+1-581-994-7717",
    priceRange: "$$",
    areaServed: { "@type": "City", name: city.name },
    address: { "@type": "PostalAddress", addressLocality: city.name, addressRegion: "QC", addressCountry: "CA" },
    geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng },
    description,
  };
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Zones desservies", item: `${SITE}/livraison` },
      { "@type": "ListItem", position: 3, name: city.name, item: `${SITE}/livraison/${city.slug}` },
      { "@type": "ListItem", position: 4, name: material.name, item: url },
    ],
  };
  const jsonLdFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
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

      {/* Breadcrumb */}
      <nav aria-label="Fil d'Ariane" className="container mx-auto px-4 sm:px-6 pt-4 flex items-center gap-1 text-xs text-muted-foreground font-body">
        <Link to="/" className="hover:text-foreground flex items-center gap-1"><Home className="w-3 h-3" /> Accueil</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/livraison" className="hover:text-foreground">Zones desservies</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/livraison/${city.slug}`} className="hover:text-foreground">{city.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-semibold">{material.name}</span>
      </nav>

      {/* Hero */}
      <header className="container mx-auto px-4 sm:px-6 pt-6 pb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary text-xs font-display font-semibold px-3 py-1.5 mb-4">
          <MapPin className="w-3.5 h-3.5" /> {city.name} · {city.region}
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight max-w-3xl">
          {h1}
        </h1>
        <p className="mt-4 text-base md:text-lg text-muted-foreground font-body max-w-2xl">
          {material.description} À {city.name}, Vrac Québec assure la livraison rapide directement sur votre chantier ou votre résidence — {material.pricingHint}.
          {city.intro ? ` ${city.intro}` : ""}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#soumission" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold shadow-lg hover:opacity-90 transition-opacity">
            <Truck className="w-4 h-4" /> Obtenir une soumission gratuite
          </a>
          <a href="tel:+15819947717" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border-2 border-foreground text-foreground font-display font-bold hover:bg-foreground hover:text-background transition-colors">
            <PhoneCall className="w-4 h-4" /> 581-994-7717
          </a>
        </div>
      </header>

      {/* Why Vrac Québec */}
      <section className="container mx-auto px-4 sm:px-6 pb-10">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">
          Pourquoi choisir Vrac Québec à {city.name}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { t: "Livraison locale rapide", d: `Nos camions couvrent ${city.name} et les municipalités voisines chaque jour ouvrable.` },
            { t: "Camions adaptés", d: `Du 6 roues au 12 roues, on choisit le bon camion selon l'accès à votre terrain à ${city.name}.` },
            { t: "Prix transparent", d: `${material.pricingHint} — soumission ferme sans surprise, matériel pesé à la source.` },
          ].map((b) => (
            <div key={b.t} className="rounded-xl border-l-4 border-primary bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display font-bold text-foreground">{b.t}</h3>
                  <p className="text-sm text-muted-foreground font-body mt-1">{b.d}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="container mx-auto px-4 sm:px-6 pb-10">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">
          Utilisations courantes du {material.shortName.toLowerCase()} à {city.name}
        </h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {material.useCases.map((u) => (
            <li key={u} className="flex items-start gap-3 rounded-lg bg-card border border-border p-4">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground font-body">{u}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Pricing hint */}
      <section className="container mx-auto px-4 sm:px-6 pb-10">
        <div className="rounded-2xl bg-foreground text-background p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">
            Prix indicatif — {material.name} à {city.name}
          </h2>
          <p className="font-body text-background/85">
            {material.pricingHint}. Le prix final dépend de la quantité, de l'accès au terrain et de la distance de livraison à partir de {city.name}. Demandez votre soumission gratuite ci-dessous — réponse en quelques heures.
          </p>
        </div>
      </section>

      {/* Form anchor */}
      <section id="soumission" className="bg-muted/30 py-10 border-y border-border">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              Demander {material.name.toLowerCase()} à {city.name}
            </h2>
            <p className="text-muted-foreground font-body mt-1">
              Formulaire rapide — moins d'une minute pour recevoir une soumission.
            </p>
          </div>
          <Questionnaire />
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-4 sm:px-6 py-10">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">
          Questions fréquentes — {material.name} à {city.name}
        </h2>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-lg border border-border bg-card p-4">
              <summary className="font-display font-semibold text-foreground cursor-pointer">{f.q}</summary>
              <p className="text-muted-foreground font-body mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Internal linking */}
      <section className="container mx-auto px-4 sm:px-6 pb-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground mb-3">
            Autres matériaux à {city.name}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {otherMaterials.map((m) => (
              <li key={m.slug}>
                <Link to={`/${m.slug}-${city.slug}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary font-body text-foreground">
                  {m.shortName} à {city.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground font-body">
        <Link to={`/livraison/${city.slug}`} className="hover:text-foreground">← Retour à toutes les livraisons à {city.name}</Link>
        <span className="mx-2">·</span>
        <Link to="/livraison" className="hover:text-foreground">Toutes les zones desservies</Link>
      </footer>
    </div>
  );
}

function buildFaq(material: string, city: string, price: string, unit: string) {
  return [
    {
      q: `Quel est le prix du ${material.toLowerCase()} livré à ${city} ?`,
      a: `Le prix commence ${price}. Le montant final varie selon la quantité, la distance depuis nos sites et l'accès au terrain à ${city}. Demandez une soumission gratuite pour obtenir un prix ferme.`,
    },
    {
      q: `Livrez-vous du ${material.toLowerCase()} directement à ${city} ?`,
      a: `Oui, Vrac Québec livre du ${material.toLowerCase()} partout à ${city} et dans les municipalités voisines, avec des camions 6, 10 ou 12 roues selon l'accès.`,
    },
    {
      q: `Quelle quantité minimum de ${material.toLowerCase()} puis-je commander ?`,
      a: `La quantité minimum correspond généralement à un voyage de camion (environ 10 ${unit}s). Pour des besoins plus petits, on peut combiner avec un autre matériau.`,
    },
    {
      q: `En combien de temps le ${material.toLowerCase()} peut-il être livré à ${city} ?`,
      a: `Selon les disponibilités, une livraison à ${city} peut souvent être planifiée en 24 à 72 heures. Pour un chantier urgent, précisez-le dans le formulaire.`,
    },
  ];
}