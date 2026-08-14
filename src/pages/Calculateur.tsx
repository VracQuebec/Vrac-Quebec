// Point 13/14 — Calculateurs Vrac Québec (quantité + transport).
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Truck } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import MaterialCalculator from "@/components/vrac/MaterialCalculator";

const Calculateur = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Calculateur de matériaux en vrac | Vrac Québec</title>
        <meta name="description" content="Calculez le volume (pi³, m³, verges³), le tonnage approximatif et le nombre de voyages de camion nécessaires pour votre chantier, puis obtenez une estimation." />
        <link rel="canonical" href="https://vracquebec.ca/calculateur" />
        <meta property="og:title" content="Calculateur de matériaux en vrac | Vrac Québec" />
        <meta property="og:description" content="Volume, tonnage et nombre de voyages de camion pour votre projet de terre, sable ou gravier." />
        <meta property="og:url" content="https://vracquebec.ca/calculateur" />
        <meta property="og:type" content="website" />
      </Helmet>
      <TransportBanner />
      <main className="container mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="text-center">
          <h1 className="font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
            Combien de matériau vous faut-il&nbsp;?
          </h1>
          <p className="mt-3 font-body text-base text-muted-foreground">
            Entrez vos dimensions : nous calculons le volume, le tonnage approximatif et le nombre
            de voyages de camion.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <MaterialCalculator />
        </section>

        <Link
          to="/types-de-camions"
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
        >
          <span className="flex items-center gap-3">
            <Truck className="h-5 w-5 text-primary" aria-hidden />
            <span className="font-display text-sm font-bold text-foreground">
              Quel camion peut accéder à mon terrain&nbsp;?
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </main>
    </div>
  );
};

export default Calculateur;