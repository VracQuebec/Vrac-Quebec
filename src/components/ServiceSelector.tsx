// Première question du parcours « Obtenir mon prix ».
// Interface uniquement : aucune logique métier, aucun calcul.
import { ArrowRight, Sprout, Mountain, Truck } from "lucide-react";

export type ServiceKey = "remblai_disposition" | "materiel_remplissage" | "vrac_achat";

const SERVICES: {
  key: ServiceKey;
  emoji: string;
  icon: typeof Truck;
  title: string;
  description: string;
  cta: string;
}[] = [
  {
    key: "remblai_disposition",
    emoji: "🚛",
    icon: Truck,
    title: "J'ai du remblai à faire disposer",
    description:
      "Vous êtes entrepreneur ou particulier et vous recherchez un site de dépôt pour votre terre, roc ou remblai.",
    cta: "Trouver un site de dépôt",
  },
  {
    key: "materiel_remplissage",
    emoji: "🌱",
    icon: Sprout,
    title: "Je recherche du matériel de remplissage",
    description:
      "Vous recherchez du matériel de remplissage économique provenant de nos entrepreneurs partenaires.",
    cta: "Trouver du matériel de remplissage",
  },
  {
    key: "vrac_achat",
    emoji: "🪨",
    icon: Mountain,
    title: "Je souhaite acheter du matériel en vrac",
    description: "Obtenez instantanément le prix livré de nos matériaux.",
    cta: "Obtenir une soumission instantanée",
  },
];

const ServiceSelector = ({ onSelect }: { onSelect: (service: ServiceKey) => void }) => (
  <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
    <div className="text-center">
      <h2 className="text-2xl md:text-3xl font-display font-extrabold text-foreground">
        Que souhaitez-vous faire aujourd'hui&nbsp;?
      </h2>
      <p className="mt-2 text-muted-foreground font-body text-sm md:text-base">
        Choisissez votre service — on s'occupe du reste.
      </p>
    </div>

    <div className="mt-8 grid gap-4 md:grid-cols-3">
      {SERVICES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onSelect(s.key)}
          className="group flex h-full flex-col rounded-2xl border-2 border-border bg-card p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <s.icon className="h-5 w-5" aria-hidden />
          </span>
          <h3 className="mt-4 font-display text-lg font-bold leading-snug text-foreground">
            <span aria-hidden className="mr-1.5">{s.emoji}</span>{s.title}
          </h3>
          <p className="mt-2 flex-1 font-body text-sm leading-relaxed text-muted-foreground">
            {s.description}
          </p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-display text-sm font-semibold text-primary-foreground transition-transform group-hover:gap-3">
            {s.cta} <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      ))}
    </div>
  </div>
);

export default ServiceSelector;