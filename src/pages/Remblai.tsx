// Points 6 & 33 — landing remblai économique (trafic Marketplace, mobile d'abord)
// avec le parcours de demande intégré directement dans la page.
import { useRef } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Coins, MapPin, Recycle, ShieldCheck } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import ParcoursForm from "@/components/parcours/ParcoursForm";

const BENEFITS = [
  { icon: Coins, t: "Économisez", d: "Le matériau provenant de surplus de chantier peut être beaucoup plus économique qu'un matériau neuf." },
  { icon: Recycle, t: "Réutilisez", d: "Un surplus de chantier peut devenir utile sur un autre projet, au lieu d'être transporté loin." },
  { icon: MapPin, t: "Réduisez le transport", d: "Nous cherchons d'abord les solutions les plus locales possible autour de votre terrain." },
];

const Remblai = () => {
  const formRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Remblai à Québec — terre et sable de chantier | Vrac Québec</title>
        <meta name="description" content="Besoin de remblai pour remplir un terrain à Québec et les environs ? Terre, sable et matériaux de surplus de chantier, livraison coordonnée par Vrac Québec." />
        <link rel="canonical" href="https://vracquebec.ca/remblai" />
        <meta property="og:title" content="Remblai à Québec — terre et sable de chantier | Vrac Québec" />
        <meta property="og:description" content="Terre, sable et remblai provenant de surplus de chantier, près de votre terrain dans la région de Québec." />
        <meta property="og:url" content="https://vracquebec.ca/remblai" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: "Remblai et matériaux de remplissage",
          serviceType: "Fourniture de remblai en vrac",
          provider: { "@type": "Organization", name: "Vrac Québec", url: "https://vracquebec.ca" },
          areaServed: { "@type": "City", name: "Québec" },
          url: "https://vracquebec.ca/remblai",
        })}</script>
      </Helmet>
      <TransportBanner />

      <main className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
            <Recycle className="h-3.5 w-3.5" aria-hidden /> Remblai économique
          </span>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold leading-tight text-foreground">
            Besoin de remplir un terrain&nbsp;?
          </h1>
          <p className="mt-4 font-body text-base leading-relaxed text-muted-foreground">
            Des surplus de terre, sable ou remblai provenant de chantiers peuvent être disponibles
            dans votre secteur. Vrac Québec cherche la solution compatible la plus proche.
          </p>
          <button
            type="button"
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-display text-base font-bold uppercase tracking-wide text-primary-foreground shadow-lg"
          >
            Voir les possibilités dans mon secteur <ArrowRight className="h-5 w-5" />
          </button>
          <p className="mt-3 font-body text-xs text-muted-foreground">
            Le matériau dépend des disponibilités du moment. Aucun matériau gratuit n'est garanti.
          </p>
        </header>

        {/* Parcours de demande — accessible très haut dans la page (Marketplace / mobile). */}
        <section ref={formRef} id="demande" className="mt-8 scroll-mt-20">
          <ParcoursForm variant="reception" />
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-border bg-card p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-3 font-display text-base font-extrabold uppercase tracking-wide text-foreground">{t}</h2>
              <p className="mt-1.5 font-body text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>

        <p className="mt-8 flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-4 font-body text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          La disponibilité des surplus varie selon les chantiers en cours et le secteur. Aucun
          matériau gratuit n'est garanti : l'acceptabilité, la quantité et le coût dépendent du
          matériau, de sa provenance et de la distance de transport.
        </p>

        <div className="mt-8 rounded-2xl border-2 border-primary/40 bg-primary/5 p-6 text-center">
          <p className="font-display text-lg font-extrabold text-foreground">
            Vous avez plutôt des matériaux à sortir&nbsp;?
          </p>
          <Link
            to="/depot-materiaux"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary px-5 py-3 font-display text-sm font-bold text-primary hover:bg-primary/10"
          >
            Trouver une solution pour mon matériel <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Remblai;
