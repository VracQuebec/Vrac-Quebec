// ============================================================
// « CARTE DU RÉSEAU » — V1 (vue réseau structurée, mobile-first).
// Représentation lisible : Chantier → Demandes → Site → Transport.
// Aucune fausse carte géographique : la position n'est indiquée que
// lorsqu'elle est réellement enregistrée. Aucun « plus proche »,
// « meilleur » ou « à X km » sans source déjà existante.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, HardHat, Loader2, MapPin, Network, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadReseau, type ReseauChantierNode, type ReseauResult } from "@/lib/parcours/reseau";

const ChantierCard = ({ node }: { node: ReseauChantierNode }) => (
  <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-display text-base font-bold sm:text-lg">
          <HardHat className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
          <span className="truncate">{node.label}</span>
        </h3>
        <p className="mt-0.5 truncate font-body text-xs text-muted-foreground">
          {node.address ?? node.city ?? "Adresse à confirmer"}
        </p>
      </div>
      <Link
        to={node.href}
        className="inline-flex items-center gap-1 font-body text-xs font-semibold text-primary hover:underline"
      >
        Voir le chantier <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </header>

    <ul className="mt-3 space-y-2">
      {node.demandes.map((d) => (
        <li key={d.submissionId} className="rounded-xl border border-border/70 bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to={d.href}
              className="font-display text-sm font-bold text-foreground hover:text-primary"
            >
              {d.label}
            </Link>
            <span className="font-body text-[11px] text-muted-foreground">
              {d.material ?? "Matériau à confirmer"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 font-body text-[11px]">
            {d.site ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                <MapPin className="h-3 w-3" aria-hidden />
                Site : {d.site.label ?? "site sélectionné"}
              </span>
            ) : (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                Aucun site sélectionné
              </span>
            )}
            {d.transportKnown ? (
              d.hasTransport ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
                  <Truck className="h-3 w-3" aria-hidden /> Transport lié
                </span>
              ) : (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                  Aucun transport lié
                </span>
              )
            ) : (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                Transport : information indisponible
              </span>
            )}
            <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              {d.location ? "Position enregistrée" : "Position non enregistrée"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  </article>
);

export default function ReseauNetwork() {
  const [res, setRes] = useState<ReseauResult | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setRes(await loadReseau());
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <section aria-labelledby="carte-reseau" className="mb-8">
      <h2 id="carte-reseau" className="mb-1 flex items-center gap-2 font-display text-xl font-bold sm:text-2xl">
        <Network className="h-5 w-5 text-primary" aria-hidden /> Carte du réseau
      </h2>
      <p className="mb-4 font-body text-sm text-muted-foreground">
        Vos chantiers, vos demandes et les sites réellement associés.
      </p>

      {loading ? (
        <p className="flex items-center gap-2 font-body text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de votre réseau…
        </p>
      ) : res?.state === "ok" ? (
        res.reseau.chantiers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-5">
            <p className="font-body text-sm text-muted-foreground">
              Votre réseau est vide : aucune demande enregistrée pour le moment.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {res.reseau.chantiers.map((c) => <ChantierCard key={c.key} node={c} />)}
          </div>
        )
      ) : res?.state === "unauthorized" ? (
        <p className="font-body text-sm text-muted-foreground">
          Connectez-vous avec votre compte entrepreneur pour voir votre réseau.
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-body text-sm text-muted-foreground">
            Votre réseau n'a pas pu être chargé. Aucune donnée approximative n'est affichée.
          </p>
          <Button variant="outline" className="mt-3 h-10" onClick={() => void reload()}>
            Réessayer
          </Button>
        </div>
      )}
    </section>
  );
}
