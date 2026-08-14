// Point 34 — parcours « sortir de la terre / des matériaux » (dompe / site receveur).
import { useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { ArrowRight, MapPin, ShieldCheck, Truck } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import ParcoursForm from "@/components/parcours/ParcoursForm";

const STEPS = [
  "Le matériau à sortir (terre, argile, sable, pierre, béton, asphalte…).",
  "La quantité approximative ou le nombre de voyages.",
  "L'adresse du chantier et la date souhaitée.",
  "Vos coordonnées pour vous revenir rapidement.",
];

const DepotMateriaux = () => {
  const formRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Trouver une dompe à Québec — site de dépôt | Vrac Québec</title>
        <meta name="description" content="Sortir de la terre ou des matériaux de chantier ? Vrac Québec trouve une dompe ou un site de dépôt compatible près de votre chantier à Québec et en région." />
        <link rel="canonical" href="https://vracquebec.ca/depot-materiaux" />
        <meta property="og:title" content="Trouver une dompe à Québec — site de dépôt | Vrac Québec" />
        <meta property="og:description" content="Site de dépôt ou site receveur compatible avec votre matériau, votre camion et votre secteur." />
        <meta property="og:url" content="https://vracquebec.ca/depot-materiaux" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: "Recherche de site de dépôt (dompe)",
          serviceType: "Disposition de matériaux d'excavation",
          provider: { "@type": "Organization", name: "Vrac Québec", url: "https://vracquebec.ca" },
          areaServed: { "@type": "City", name: "Québec" },
          url: "https://vracquebec.ca/depot-materiaux",
        })}</script>
      </Helmet>
      <TransportBanner />

      <main className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
            <Truck className="h-3.5 w-3.5" aria-hidden /> Dompe · site de dépôt · site receveur
          </span>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold leading-tight text-foreground">
            Besoin de sortir de la terre ou des matériaux&nbsp;?
          </h1>
          <p className="mt-4 font-body text-base leading-relaxed text-muted-foreground">
            Vrac Québec recherche un site de dépôt (dompe) ou un site receveur compatible avec
            votre matériau, votre camion et votre secteur — le plus près possible de votre chantier.
          </p>
          <button
            type="button"
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-display text-base font-bold uppercase tracking-wide text-primary-foreground shadow-lg"
          >
            Faire ma demande <ArrowRight className="h-5 w-5" />
          </button>
        </header>

        <section ref={formRef} id="demande" className="mt-8 scroll-mt-20">
          <ParcoursForm variant="evacuation" />
        </section>

        <section className="mt-10 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Ce qu'on vous demandera</h2>
          <ul className="mt-4 grid gap-2.5">
            {STEPS.map((s) => (
              <li key={s} className="flex items-start gap-2.5 font-body text-sm text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-4 font-body text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          L'acceptabilité d'un matériau dépend du type de matériau, de sa provenance, de la
          caractérisation lorsqu'elle est requise, des exigences du site receveur et de la
          réglementation applicable.
        </p>
      </main>
    </div>
  );
};

export default DepotMateriaux;
