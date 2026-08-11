// Points 4, 21, 22, 45 — fonctionnement, positionnement et économie circulaire.
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Network, Recycle, Truck } from "lucide-react";

const STEPS = [
  { n: "1", t: "Vous indiquez votre besoin", d: "Matériau, quantité, chantier — en quelques clics." },
  { n: "2", t: "Vrac Québec cherche les solutions compatibles", d: "Sites, fournisseurs et transporteurs du réseau." },
  { n: "3", t: "Une solution à proximité est identifiée", d: "La plus proche et la plus compatible de votre chantier." },
  { n: "4", t: "Le transport peut être coordonné", d: "Lorsque c'est pertinent, le transport est assuré ou coordonné par Transport JSC." },
];

const HowItWorks = () => (
  <section aria-labelledby="fonctionnement-title" className="mt-16">
    <h2 id="fonctionnement-title" className="text-center font-display text-2xl sm:text-3xl font-extrabold text-foreground">
      Comment fonctionne Vrac Québec&nbsp;?
    </h2>

    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s) => (
        <div key={s.n} className="rounded-2xl border border-border bg-card p-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary font-display text-sm font-extrabold text-primary-foreground">
            {s.n}
          </span>
          <h3 className="mt-3 font-display text-base font-bold leading-snug text-foreground">{s.t}</h3>
          <p className="mt-1.5 font-body text-sm text-muted-foreground">{s.d}</p>
        </div>
      ))}
    </div>

    {/* Positionnement de marque */}
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Network className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="mt-3 font-display text-lg font-bold text-foreground">Vrac Québec</h3>
        <p className="mt-1.5 font-body text-sm text-muted-foreground">
          La plateforme et le réseau : recherche, mise en relation et optimisation entre les
          chantiers, les sites et les fournisseurs.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/10 text-foreground">
          <Truck className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="mt-3 font-display text-lg font-bold text-foreground">Transport JSC</h3>
        <p className="mt-1.5 font-body text-sm text-muted-foreground">
          La logistique : entreprise de transport pouvant assurer ou coordonner les voyages
          lorsque c'est pertinent.
        </p>
      </div>
    </div>

    {/* Économie circulaire */}
    <div className="mt-6 rounded-2xl border-2 border-primary/40 bg-primary/5 p-6 sm:p-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
          <Recycle className="h-3.5 w-3.5" aria-hidden /> Économie circulaire
        </span>
        <h3 className="mt-3 font-display text-xl sm:text-2xl font-extrabold text-foreground">
          Un surplus devient une ressource
        </h3>
      </div>

      <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-2">
        <div className="w-full rounded-xl border border-border bg-card p-4 text-center">
          <p className="font-display text-sm font-bold text-foreground">Chantier A</p>
          <p className="font-body text-xs text-muted-foreground">Surplus de matériaux</p>
        </div>
        <ArrowDown className="h-5 w-5 text-primary" aria-hidden />
        <div className="w-full rounded-xl bg-primary p-4 text-center font-display text-sm font-extrabold uppercase tracking-wide text-primary-foreground">
          Vrac Québec
        </div>
        <ArrowDown className="h-5 w-5 text-primary" aria-hidden />
        <div className="w-full rounded-xl border border-border bg-card p-4 text-center">
          <p className="font-display text-sm font-bold text-foreground">Terrain B</p>
          <p className="font-body text-xs text-muted-foreground">Besoin de matériaux</p>
        </div>
      </div>

      <ul className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
        {["Moins de transport", "Meilleure utilisation des matériaux", "Possibilité de réduire les coûts de transport et de disposition", "Solutions locales"].map((b) => (
          <li key={b} className="rounded-xl border border-border bg-card px-3 py-2 font-body text-sm text-foreground">
            {b}
          </li>
        ))}
      </ul>
    </div>

    {/* Pourquoi Vrac Québec — cartes courtes */}
    <div className="mt-6">
      <h3 className="font-display text-xl font-extrabold text-foreground">Pourquoi Vrac Québec&nbsp;?</h3>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Plutôt qu'une seule carrière", "Plusieurs sources comparées, pas une seule."],
          ["Pour du remblai", "Des surplus de chantiers près de chez vous."],
          ["Pour sortir de la terre", "Un site receveur compatible, au plus près."],
          ["Pour trouver une dompe", "Distance et temps de trajet affichés."],
        ].map(([q, a]) => (
          <div key={q} className="rounded-2xl border border-border bg-card p-4">
            <dt className="font-display text-sm font-bold text-foreground">{q}</dt>
            <dd className="mt-1 font-body text-sm text-muted-foreground">{a}</dd>
          </div>
        ))}
      </dl>
      <Link to="/remblai" className="mt-5 inline-flex items-center gap-2 font-display text-sm font-bold text-primary hover:gap-3 transition-all">
        Voir les possibilités de remblai dans mon secteur <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  </section>
);

export default HowItWorks;
