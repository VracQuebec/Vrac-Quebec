// Point 3 & 19 — mise en valeur de l'outil de recherche de dompes.
// L'exemple est explicitement identifié comme illustration : aucune disponibilité réelle n'est simulée.
import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, MapPin, Truck, Sparkles } from "lucide-react";

const CRITERIA = [
  "Accepte le matériau",
  "Compatible avec le camion",
  "Distance du chantier",
  "Temps de trajet",
  "Disponibilité du site",
  "Coordination du transport possible",
];

const DompeShowcase = () => (
  <section aria-labelledby="dompes-title" className="mt-16 rounded-2xl border-2 border-primary/40 bg-card p-6 sm:p-8">
    <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Recherche de dompes
        </span>
        <h2 id="dompes-title" className="mt-4 font-display text-2xl sm:text-3xl font-extrabold leading-tight text-foreground">
          Trouvez la meilleure dompe <span className="text-primary">en moins de 60 secondes</span>
        </h2>
        <p className="mt-3 font-body text-sm sm:text-base leading-relaxed text-muted-foreground">
          Site de dépôt / site receveur de matériaux. Une dompe à quelques minutes de moins peut
          changer la rentabilité d'une journée de camionnage.
        </p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {CRITERIA.map((c) => (
            <li key={c} className="flex items-start gap-2 font-body text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
        <Link
          to="/espace-entrepreneur"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-display text-base font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
        >
          Chercher une dompe <ArrowRight className="h-5 w-5" />
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-background p-5">
        <p className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Exemple d'utilisation (illustration)
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: MapPin, k: "Chantier", v: "Sainte-Foy" },
            { icon: Sparkles, k: "Matériau", v: "Terre" },
            { icon: Truck, k: "Camion", v: "12 roues" },
          ].map(({ icon: Icon, k, v }) => (
            <div key={k} className="rounded-xl border border-border bg-card p-3">
              <Icon className="mx-auto h-4 w-4 text-primary" aria-hidden />
              <dt className="mt-1.5 font-display text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="font-display text-sm font-bold text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-xl bg-primary/10 p-4">
          <p className="font-display text-sm font-bold text-foreground">3 sites compatibles</p>
          <p className="mt-1 font-body text-xs text-muted-foreground">Site recommandé</p>
          <div className="mt-2 flex items-center gap-4 font-display text-lg font-extrabold text-primary">
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden /> 14 min</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden /> 9,8 km</span>
          </div>
        </div>
        <p className="mt-3 font-body text-[11px] leading-relaxed text-muted-foreground">
          Exemple seulement. Les sites, distances et disponibilités réels sont calculés à partir de
          votre chantier dans l'espace entrepreneur.
        </p>
      </div>
    </div>
  </section>
);

export default DompeShowcase;
