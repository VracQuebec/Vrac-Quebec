// Point d'entrée unique de la homepage — 4 intentions.
// Les parcours « matériaux » et « matériaux à sortir » s'ouvrent en place;
// les deux autres mènent aux parcours déjà existants (routes inchangées).
import { Link } from "react-router-dom";
import { ArrowRight, Mountain, Truck, MapPin, HardHat, Calculator } from "lucide-react";

export type IntentKey = "materiaux" | "vrac" | "sortir" | "dompe" | "transport";

const INTENTS = [
  {
    key: "materiaux" as const,
    to: "/remblai",
    icon: Mountain,
    title: "J'ai besoin de matériel de remblais",
    text: "Faire une demande de remblais pour mon chantier",
  },
  {
    key: "vrac" as const,
    to: "/acheter-materiaux",
    icon: Calculator,
    title: "J'ai besoin de matériaux en vrac",
    text: "Calculer ma quantité, obtenir ma soumission et confirmer ma demande",
  },
  {
    key: "sortir" as const,
    to: null,
    icon: Truck,
    title: "J'ai des matériaux à sortir",
    text: "Trouver un site de dépôt compatible",
  },
  {
    key: "dompe" as const,
    to: "/espace-entrepreneur",
    icon: MapPin,
    title: "Je cherche une dompe",
    text: "Trouver une solution près de mon chantier",
  },
  {
    key: "transport" as const,
    to: "/soumission",
    icon: HardHat,
    title: "J'ai besoin de transport",
    text: "Trouver une solution de transport",
  },
];

type Props = {
  selected?: IntentKey | null;
  onSelect?: (key: IntentKey) => void;
};

const IntentChoice = ({ selected = null, onSelect }: Props) => (
  <section id="choix" aria-labelledby="choix-title" className="scroll-mt-24">
    <h2
      id="choix-title"
      className="text-center font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground"
    >
      Que cherchez-vous aujourd'hui&nbsp;?
    </h2>
    <p className="mx-auto mt-3 max-w-xl text-center font-body text-sm sm:text-base text-muted-foreground">
      Choisissez votre besoin et nous vous guiderons vers la bonne solution.
    </p>

    <div className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-2">
      {INTENTS.map(({ key, to, icon: Icon, title, text }) => {
        const isActive = selected === key;
        const cls = `group flex w-full items-center gap-4 rounded-2xl p-5 sm:p-6 text-left transition-all hover:-translate-y-0.5 ${
          isActive
            ? "bg-primary text-primary-foreground shadow-lg"
            : "border border-border bg-card hover:border-primary hover:shadow-md"
        }`;
        const inner = (
          <>
            <span
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                isActive ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-base sm:text-lg font-bold leading-snug">{title}</span>
              <span
                className={`mt-1 block font-body text-sm leading-snug ${
                  isActive ? "text-primary-foreground/85" : "text-muted-foreground"
                }`}
              >
                {text}
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
          </>
        );

        return to ? (
          <Link key={key} to={to} className={cls}>
            {inner}
          </Link>
        ) : (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect?.(key)}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </div>
  </section>
);

export default IntentChoice;
