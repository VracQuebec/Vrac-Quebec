// ============================================================
// « SITES RECOMMANDÉS » — affichage lecture seule, mobile-first.
// N'affiche que des sites réellement rattachés à une demande de
// l'entrepreneur connecté. Aucune distance, disponibilité ou
// compatibilité n'est inventée : une donnée absente n'est pas affichée.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, HardHat, Loader2, MapPin, Package, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadRecommendedSites, type RecommendedSite, type RecommendedSitesResult } from "@/lib/parcours/sites-recommandes";

const AVAIL_DOT: Record<string, string> = {
  available: "🟢",
  approval: "🟠",
  limited: "🟠",
  unavailable: "🔴",
  unknown: "",
};

const Line = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <p className="flex items-start gap-1.5 font-body text-xs text-muted-foreground">
    <span className="mt-0.5 flex-shrink-0 text-primary">{icon}</span>
    <span>
      <span className="font-semibold text-foreground">{label} : </span>
      {value}
    </span>
  </p>
);

const SiteCard = ({ s }: { s: RecommendedSite }) => (
  <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <p className="font-display text-[10px] font-bold uppercase tracking-wide text-primary">
      {s.reason === "validated_site" ? "Site validé pour votre demande" : "Site sélectionné pour votre demande"}
    </p>
    <h3 className="mt-1 font-display text-base font-bold">
      {s.label || s.address || "Site — nom à confirmer"}
    </h3>

    <div className="mt-3 space-y-1.5">
      {s.chantier ? (
        <Line icon={<HardHat className="h-3.5 w-3.5" />} label="Chantier" value={s.chantier} />
      ) : null}
      {s.material ? (
        <Line icon={<Package className="h-3.5 w-3.5" />} label="Matériau" value={s.material} />
      ) : null}
      {s.address ? (
        <Line icon={<MapPin className="h-3.5 w-3.5" />} label="Adresse" value={s.address} />
      ) : null}
      {s.distanceKm != null ? (
        <Line
          icon={<Route className="h-3.5 w-3.5" />}
          label="Distance"
          value={`${s.distanceKm.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} km`}
        />
      ) : null}
      {s.durationMinutes != null ? (
        <Line icon={<Clock className="h-3.5 w-3.5" />} label="Durée" value={`${s.durationMinutes} min`} />
      ) : null}
      <Line
        icon={<span aria-hidden>{AVAIL_DOT[s.availability.level] || "•"}</span>}
        label="Disponibilité"
        value={s.availability.level === "unknown" ? "Disponibilité à confirmer" : s.availability.label}
      />
    </div>

    <Button asChild className="mt-4 h-12 w-full font-display text-sm font-bold uppercase tracking-wide sm:w-auto">
      <Link to={`/entrepreneur/demandes#demande-${s.submissionId}`}>
        Voir le site <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </Link>
    </Button>
  </article>
);

export default function SitesRecommandesList() {
  const [res, setRes] = useState<RecommendedSitesResult | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setRes(await loadRecommendedSites());
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading || !res) {
    return (
      <p className="flex items-center gap-2 py-6 font-body text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des sites…
      </p>
    );
  }

  if (res.state === "unauthorized") {
    return (
      <p className="rounded-xl border border-border bg-card p-5 font-body text-sm text-muted-foreground">
        Connectez-vous avec votre compte entrepreneur pour voir vos sites.
      </p>
    );
  }

  if (res.state === "error") {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="font-body text-sm font-semibold text-destructive">
          Impossible d'afficher vos sites pour le moment.
        </p>
        <Button
          variant="outline"
          onClick={() => void reload()}
          className="mt-3 h-11 font-display text-sm font-bold uppercase tracking-wide"
        >
          Réessayer
        </Button>
      </div>
    );
  }

  if (res.sites.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center font-body text-sm text-muted-foreground">
        Aucun site recommandé pour le moment. Lorsque vous aurez une demande active avec les
        informations nécessaires, les sites pertinents pourront apparaître ici.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {res.sites.map((s) => (
        <SiteCard key={`${s.submissionId}:${s.siteId}`} s={s} />
      ))}
    </div>
  );
}
