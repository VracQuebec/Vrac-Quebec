// Point 2 — séparation claire des clientèles.
import { Link } from "react-router-dom";
import { ArrowRight, Home, Truck, MapPin, HardHat } from "lucide-react";

const UNIVERSES = [
  {
    icon: Home,
    tag: "Particulier",
    title: "J'ai besoin de matériaux",
    items: ["Terre", "Sable", "Pierre", "Gravier", "Remblai", "Enrochement", "Nivellement", "Entrées", "Terrains"],
    cta: "Trouver mes matériaux",
    to: "/acheter-materiaux",
  },
  {
    icon: Truck,
    tag: "Matériaux à sortir",
    title: "J'ai des matériaux à sortir",
    items: ["Terre", "Argile", "Sable", "Pierre", "Béton", "Asphalte", "Autres matériaux"],
    cta: "Trouver une solution",
    to: "/depot-materiaux",
  },
  {
    icon: MapPin,
    tag: "Entrepreneur",
    title: "Je cherche une dompe",
    items: ["Sites de dépôt compatibles", "Distance et temps de trajet", "Camion compatible"],
    cta: "Chercher une dompe",
    to: "/espace-entrepreneur",
  },
  {
    icon: HardHat,
    tag: "Professionnel",
    title: "Je suis un professionnel",
    subtitle: "Entrepreneur • Transporteur • Partenaire",
    items: ["Espace professionnel", "Réseau Vrac Québec", "Coordination du transport"],
    cta: "Accéder à l'espace pro",
    to: "/login",
  },
];

const ClienteleUniverses = () => (
  <section aria-labelledby="clienteles-title" className="mt-16">
    <h2 id="clienteles-title" className="text-center font-display text-2xl sm:text-3xl font-extrabold text-foreground">
      Vous êtes ici pour quoi&nbsp;?
    </h2>
    <p className="mt-2 text-center font-body text-sm text-muted-foreground">
      Chaque besoin a son parcours — choisissez le vôtre.
    </p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {UNIVERSES.map(({ icon: Icon, tag, title, items, cta, to, ...rest }) => (
        <Link
          key={title}
          to={to}
          className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-lg"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="mt-4 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tag}</span>
          <h3 className="mt-1 font-display text-lg font-bold leading-snug text-foreground">{title}</h3>
          {"subtitle" in rest && rest.subtitle ? (
            <p className="mt-1 font-body text-xs text-muted-foreground">{rest.subtitle}</p>
          ) : null}
          <ul className="mt-3 flex flex-1 flex-wrap gap-1.5">
            {items.map((it) => (
              <li key={it} className="rounded-full bg-muted px-2.5 py-1 font-body text-[11px] text-muted-foreground">
                {it}
              </li>
            ))}
          </ul>
          <span className="mt-5 inline-flex items-center gap-1.5 font-display text-sm font-bold text-primary group-hover:gap-2.5 transition-all">
            {cta} <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      ))}
    </div>
  </section>
);

export default ClienteleUniverses;
