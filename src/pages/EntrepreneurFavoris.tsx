import EntrepreneurShell from "@/components/EntrepreneurShell";
import { Link } from "react-router-dom";
import { Star, Sparkles } from "lucide-react";

const EntrepreneurFavoris = () => (
  <EntrepreneurShell title="Mes favoris" description="Retrouvez vos dompes favorites en un clic.">
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <Star className="w-10 h-10 text-primary mx-auto mb-3" />
      <p className="font-display font-bold text-lg mb-1">Bientôt disponible</p>
      <p className="text-sm text-muted-foreground font-body mb-4 max-w-md mx-auto">
        Vous pourrez bientôt marquer vos dompes préférées pour y accéder rapidement. En attendant, lancez l'assistant pour trouver la meilleure dompe pour votre chantier.
      </p>
      <Link
        to="/demande-transport"
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-display font-bold px-5 py-3 rounded-xl hover:opacity-90"
      >
        <Sparkles className="w-4 h-4" /> Lancer l'assistant intelligent
      </Link>
    </div>
  </EntrepreneurShell>
);

export default EntrepreneurFavoris;