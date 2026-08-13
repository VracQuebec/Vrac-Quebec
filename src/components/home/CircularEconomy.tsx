// Mission / économie circulaire — ton éditorial, aucun parcours de navigation.
import { ArrowDown, Recycle } from "lucide-react";

const BENEFITS = [
  "Moins de transport",
  "Meilleure utilisation des matériaux",
  "Possibilité de réduire les coûts de transport et de disposition",
  "Solutions locales",
];

const CircularEconomy = () => (
  <section aria-labelledby="circulaire-title" className="rounded-3xl bg-primary/5 px-5 py-10 sm:px-10 sm:py-12">
    <div className="text-center">
      <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
        <Recycle className="h-3.5 w-3.5" aria-hidden /> Économie circulaire
      </span>
      <h2 id="circulaire-title" className="mt-4 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
        Un surplus devient une ressource
      </h2>
      <p className="mx-auto mt-3 max-w-xl font-body text-sm sm:text-base text-muted-foreground">
        Ce qui sort d'un chantier peut servir à un autre terrain, tout près.
      </p>
    </div>

    <div className="mx-auto mt-8 flex max-w-sm flex-col items-center gap-2">
      <div className="w-full rounded-2xl bg-card p-4 text-center shadow-sm">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">Chantier A</p>
        <p className="font-body text-xs text-muted-foreground">Surplus de matériaux</p>
      </div>
      <ArrowDown className="h-5 w-5 text-primary" aria-hidden />
      <div className="w-full rounded-2xl bg-primary p-4 text-center font-display text-sm font-extrabold uppercase tracking-wide text-primary-foreground">
        Vrac Québec
      </div>
      <ArrowDown className="h-5 w-5 text-primary" aria-hidden />
      <div className="w-full rounded-2xl bg-card p-4 text-center shadow-sm">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">Terrain B</p>
        <p className="font-body text-xs text-muted-foreground">Besoin de matériaux</p>
      </div>
    </div>

    <ul className="mx-auto mt-8 grid max-w-2xl gap-x-6 gap-y-2 sm:grid-cols-2">
      {BENEFITS.map((b) => (
        <li key={b} className="font-body text-sm text-foreground before:mr-2 before:text-primary before:content-['✓']">
          {b}
        </li>
      ))}
    </ul>
  </section>
);

export default CircularEconomy;
