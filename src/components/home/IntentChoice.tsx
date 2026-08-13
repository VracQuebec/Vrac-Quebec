// Point d'entrée unique de la homepage — 4 intentions, mêmes routes que les parcours existants.
import { Link } from "react-router-dom";
import { ArrowRight, Mountain, Truck, MapPin, HardHat } from "lucide-react";

const INTENTS = [
  {
    to: "/acheter-materiaux",
    icon: Mountain,
    title: "J'ai besoin de matériaux",
    text: "Trouvez le bon matériau selon votre projet.",
    primary: true,
  },
  {
    to: "/depot-materiaux",
    icon: Truck,
    title: "J'ai des matériaux à sortir",
    text: "Trouvez un site de dépôt compatible.",
  },
  {
    to: "/espace-entrepreneur",
    icon: MapPin,
    title: "Je cherche une dompe",
    text: "Trouvez une solution proche de votre chantier.",
  },
  {
    to: "/soumission",
    icon: HardHat,
    title: "J'ai besoin de transport",
    text: "Trouvez une solution de transport adaptée.",
  },
] as const;

const IntentChoice = () => (
  <section id="choix" aria-labelledby="choix-title" className="scroll-mt-24">
    <h2
      id="choix-title"
      className="text-center font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground"
    >
      Qu'est-ce que vous cherchez aujourd'hui&nbsp;?
    </h2>
    <p className="mx-auto mt-3 max-w-xl text-center font-body text-sm sm:text-base text-muted-foreground">
      Choisissez votre besoin — Vrac Québec vous guide ensuite.
    </p>

    <div className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-2">
      {INTENTS.map(({ to, icon: Icon, title, text, ...rest }) => {
        const isPrimary = "primary" in rest && rest.primary;
        return (
          <Link
            key={to}
            to={to}
            className={`group flex items-center gap-4 rounded-2xl p-5 sm:p-6 transition-all hover:-translate-y-0.5 ${
              isPrimary
                ? "bg-primary text-primary-foreground shadow-lg"
                : "border border-border bg-card hover:border-primary hover:shadow-md"
            }`}
          >
            <span
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                isPrimary ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-base sm:text-lg font-bold leading-snug">{title}</span>
              <span
                className={`mt-1 block font-body text-sm leading-snug ${
                  isPrimary ? "text-primary-foreground/85" : "text-muted-foreground"
                }`}
              >
                {text}
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        );
      })}
    </div>
  </section>
);

export default IntentChoice;
