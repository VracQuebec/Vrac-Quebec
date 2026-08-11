// Point 34 — landing « sortir de la terre / des matériaux ».
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MapPin, ShieldCheck, Truck } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";

const STEPS = [
  "Le matériau à sortir (terre, argile, sable, pierre, béton, asphalte…).",
  "La quantité approximative ou le nombre de voyages.",
  "L'adresse du chantier et la date souhaitée.",
  "Vos coordonnées pour vous revenir rapidement.",
];

const DepotMateriaux = () => {
  useEffect(() => {
    document.title = "Trouver une dompe (site de dépôt) au Québec | Vrac Québec";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "Besoin de vous débarrasser de terre ou de matériaux? Vrac Québec cherche un site de dépôt (dompe) ou un site receveur compatible près de votre chantier."
      );
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TransportBanner />

      <main className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
            <Truck className="h-3.5 w-3.5" aria-hidden /> Dompe · site de dépôt · site receveur
          </span>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold leading-tight text-foreground">
            Besoin de vous débarrasser de terre ou de matériaux&nbsp;?
          </h1>
          <p className="mt-4 font-body text-base leading-relaxed text-muted-foreground">
            Vrac Québec cherche un site de dépôt compatible avec votre matériau, votre camion et
            votre secteur — le plus près possible de votre chantier.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-2.5">
            <Link
              to="/espace-entrepreneur"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-display text-base font-bold uppercase tracking-wide text-primary-foreground shadow-lg"
            >
              Trouver une dompe <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="/#questionnaire"
              className="inline-flex items-center justify-center rounded-xl border-2 border-primary px-6 py-4 font-display text-base font-bold uppercase tracking-wide text-primary hover:bg-primary/10"
            >
              Trouver une solution pour mon matériel
            </a>
          </div>
        </header>

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
