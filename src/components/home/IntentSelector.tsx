// Point 5 — entrée naturelle par projet plutôt que par matériau.
// Interface uniquement : aucune logique de calcul, le parcours existant reste inchangé.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, HelpCircle } from "lucide-react";

type Intent = { key: string; label: string; suggestion: string; why: string };

const INTENTS: Intent[] = [
  { key: "trou", label: "Remplir un trou", suggestion: "Remblai ou terre de remplissage", why: "Économique et compactable pour combler un volume." },
  { key: "monter", label: "Monter mon terrain", suggestion: "Remblai", why: "Grand volume à coût réduit lorsque des surplus sont disponibles." },
  { key: "entree", label: "Faire une entrée", suggestion: "MG-20 (pierre concassée 0-¾)", why: "Se compacte bien et supporte la circulation." },
  { key: "nivellement", label: "Faire du nivellement", suggestion: "Sable ou terre de remplissage", why: "Facile à étendre et à niveler." },
  { key: "pelouse", label: "Faire une pelouse", suggestion: "Terre végétale tamisée", why: "Terre riche et tamisée pour l'ensemencement ou la tourbe." },
  { key: "drainage", label: "Faire du drainage", suggestion: "Pierre nette ¾", why: "Laisse circuler l'eau sans se colmater." },
  { key: "fondation", label: "Faire une fondation", suggestion: "Pierre concassée 0-¾", why: "Base portante et compactable." },
  { key: "piscine", label: "Installer ou préparer une piscine", suggestion: "Sable à compaction ou poussière de pierre", why: "Surface régulière sous la toile." },
  { key: "autre", label: "Autre", suggestion: "À déterminer avec vous", why: "Décrivez votre projet, on vous guide." },
  { key: "inconnu", label: "Je ne sais pas", suggestion: "On vous aide à choisir", why: "Dites-nous ce que vous voulez faire, on recommande le matériau." },
];

const IntentSelector = () => {
  const [selected, setSelected] = useState<Intent | null>(null);

  return (
    <section aria-labelledby="intent-title" className="mx-auto max-w-3xl">
      <p className="text-center font-display text-xs font-bold uppercase tracking-wider text-primary">
        Parcours « J'ai besoin de matériaux »
      </p>
      <h2 id="intent-title" className="mt-2 text-center font-display text-2xl sm:text-3xl font-extrabold text-foreground">
        Qu'est-ce que vous voulez faire&nbsp;?
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center font-body text-sm sm:text-base text-muted-foreground">
        Dites-nous ce que vous voulez réaliser et nous vous aiderons à trouver le bon matériau.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {INTENTS.map((i) => (
          <button
            key={i.key}
            type="button"
            onClick={() => setSelected(i)}
            aria-pressed={selected?.key === i.key}
            className={`rounded-full border-2 px-4 py-2 font-display text-sm font-semibold transition-colors ${
              selected?.key === i.key
                ? "border-primary bg-primary text-primary-foreground"
                : i.key === "inconnu"
                  ? "border-primary/50 bg-primary/5 text-foreground hover:border-primary"
                  : "border-border bg-background text-foreground hover:border-primary"
            }`}
          >
            {i.key === "inconnu" && <HelpCircle className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />}
            {i.label}
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-5 text-center animate-in fade-in duration-300">
          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-primary">Matériau suggéré</p>
          <p className="mt-1 font-display text-lg font-extrabold text-foreground">{selected.suggestion}</p>
          <p className="mt-1 font-body text-sm text-muted-foreground">{selected.why}</p>
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <Link
              to="/acheter-materiaux"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-display text-sm font-bold text-primary-foreground"
            >
              Obtenir un prix <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#questionnaire"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border-2 border-primary px-5 py-3 font-display text-sm font-bold text-primary hover:bg-primary/10"
            >
              Décrire mon projet
            </a>
          </div>
        </div>
      )}
    </section>
  );
};

export default IntentSelector;
