// ============================================================
// « MON ACTIVITÉ » — compteurs réels du compte connecté.
// Lecture seule, mobile-first, réutilise le style du tableau de bord.
// Un compteur sans source fiable n'est pas affiché ; une erreur n'est
// jamais transformée en 0.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, HardHat, Loader2, MapPin, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadActivitySummary, type ActivityResult } from "@/lib/parcours/activity";

const Counter = ({
  to, icon, value, label,
}: { to: string; icon: React.ReactNode; value: number; label: string }) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/60 hover:shadow-md"
  >
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block font-display text-2xl font-bold leading-none">{value}</span>
      <span className="block truncate font-body text-xs text-muted-foreground">{label}</span>
    </span>
  </Link>
);

export default function ActivitySummary() {
  const [res, setRes] = useState<ActivityResult | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setRes(await loadActivitySummary());
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <section aria-labelledby="mon-activite" className="mb-8">
      <h2 id="mon-activite" className="mb-3 font-display text-lg font-bold sm:text-xl">
        Mon activité
      </h2>

      {loading ? (
        <p className="flex items-center gap-2 font-body text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de votre activité…
        </p>
      ) : res?.state === "ok" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Counter
            to="/entrepreneur/demandes"
            icon={<ClipboardList className="h-5 w-5" />}
            value={res.summary.demandes}
            label={res.summary.demandes > 1 ? "Demandes" : "Demande"}
          />
          <Counter
            to="/entrepreneur/chantiers"
            icon={<HardHat className="h-5 w-5" />}
            value={res.summary.chantiers}
            label={res.summary.chantiers > 1 ? "Chantiers" : "Chantier"}
          />
          <Counter
            to="/entrepreneur/comparateur"
            icon={<MapPin className="h-5 w-5" />}
            value={res.summary.sitesRecommandes}
            label="Sites recommandés"
          />
          {res.summary.transports != null ? (
            <Counter
              to="/entrepreneur/demandes"
              icon={<Truck className="h-5 w-5" />}
              value={res.summary.transports}
              label={res.summary.transports > 1 ? "Transports" : "Transport"}
            />
          ) : null}
        </div>
      ) : res?.state === "unauthorized" ? (
        <p className="font-body text-sm text-muted-foreground">
          Connectez-vous avec votre compte entrepreneur pour voir votre activité.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-body text-sm text-muted-foreground">
            Votre activité n'a pas pu être chargée. Les compteurs ne sont pas affichés afin de ne pas
            présenter de valeur erronée.
          </p>
          <Button variant="outline" className="mt-3 h-10" onClick={() => void reload()}>
            Réessayer
          </Button>
        </div>
      )}
    </section>
  );
}
