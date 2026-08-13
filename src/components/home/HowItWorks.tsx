// Explication du fonctionnement — réassurance uniquement, aucun menu.
const STEPS = [
  { n: "1", t: "Vous indiquez votre besoin", d: "Matériau, quantité, chantier — en quelques clics." },
  { n: "2", t: "Vrac Québec cherche les solutions compatibles", d: "Sites de dépôt, fournisseurs et transporteurs du réseau." },
  { n: "3", t: "Une solution à proximité est identifiée", d: "La plus proche et la plus compatible de votre chantier." },
  { n: "4", t: "Le transport peut être coordonné", d: "Lorsque c'est pertinent, Vrac Québec coordonne le transport." },
];

const HowItWorks = () => (
  <section aria-labelledby="fonctionnement-title">
    <h2
      id="fonctionnement-title"
      className="text-center font-display text-2xl sm:text-3xl font-extrabold text-foreground"
    >
      Comment fonctionne Vrac Québec&nbsp;?
    </h2>

    <ol className="mx-auto mt-10 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s) => (
        <li key={s.n}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-sm font-extrabold text-primary-foreground">
            {s.n}
          </span>
          <h3 className="mt-4 font-display text-base font-bold leading-snug text-foreground">{s.t}</h3>
          <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{s.d}</p>
        </li>
      ))}
    </ol>
  </section>
);

export default HowItWorks;
