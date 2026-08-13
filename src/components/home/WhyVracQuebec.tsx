// Réassurance — bénéfices courts, sans nouveau parcours de navigation.
import { Check } from "lucide-react";

const BENEFITS = [
  "Plusieurs sources comparées",
  "Des solutions près de votre chantier",
  "Des matériaux compatibles",
  "Moins de transport inutile",
  "Des solutions locales",
];

const WhyVracQuebec = () => (
  <section aria-labelledby="pourquoi-title" className="mx-auto max-w-3xl text-center">
    <h2 id="pourquoi-title" className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
      Pourquoi passer par Vrac Québec&nbsp;?
    </h2>
    <p className="mx-auto mt-3 max-w-xl font-body text-sm sm:text-base text-muted-foreground">
      Une seule demande, plusieurs sites et fournisseurs comparés pour votre chantier.
    </p>
    <ul className="mt-7 flex flex-wrap justify-center gap-2.5">
      {BENEFITS.map((b) => (
        <li
          key={b}
          className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 font-body text-sm text-foreground"
        >
          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {b}
        </li>
      ))}
    </ul>
  </section>
);

export default WhyVracQuebec;
