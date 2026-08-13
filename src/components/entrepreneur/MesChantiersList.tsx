// ============================================================
// « MES CHANTIERS » — vue calculée, lecture seule.
// Regroupe les demandes existantes de l'entrepreneur connecté
// (RPC `get_my_submissions`). Aucune table « chantiers », aucune
// écriture, aucune donnée inventée. Le détail d'un chantier réutilise
// la carte de « Mes demandes » (donc LinkedTransportCard).
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, HardHat, Layers, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmissionCard } from "@/components/entrepreneur/MesDemandesList";
import { loadMyChantiers, type Chantier, type ChantiersResult } from "@/lib/parcours/chantiers";

const fr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-CA") : "À confirmer");

const ChantierCard = ({ c, onOpen }: { c: Chantier; onOpen: () => void }) => (
  <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <p className="flex items-center gap-2 font-display text-base font-bold">
      <HardHat className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
      Chantier — {c.city || (c.address ? c.address : "adresse à confirmer")}
    </p>
    {c.address ? (
      <p className="mt-1 flex items-start gap-1.5 font-body text-xs text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span>{c.address}</span>
      </p>
    ) : null}
    <p className="mt-3 font-body text-sm text-foreground">
      {c.submissions.length} demande{c.submissions.length > 1 ? "s" : ""}
    </p>
    {c.materials.length > 0 ? (
      <p className="mt-1 flex items-start gap-1.5 font-body text-xs text-muted-foreground">
        <Layers className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span>{c.materials.join(" • ")}</span>
      </p>
    ) : null}
    <p className="mt-1 flex items-start gap-1.5 font-body text-xs text-muted-foreground">
      <CalendarDays className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span>Dernière activité : {fr(c.lastActivity)}</span>
    </p>
    <Button
      onClick={onOpen}
      className="mt-4 h-12 w-full font-display text-sm font-bold uppercase tracking-wide sm:w-auto"
    >
      Voir le chantier <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
    </Button>
  </article>
);

export default function MesChantiersList() {
  const [res, setRes] = useState<ChantiersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setRes(await loadMyChantiers());
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading || !res) {
    return (
      <p className="flex items-center gap-2 py-6 font-body text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de vos chantiers…
      </p>
    );
  }

  if (res.state === "unauthorized") {
    return (
      <p className="rounded-xl border border-border bg-card p-5 font-body text-sm text-muted-foreground">
        Votre compte n'a pas accès à cette liste. Connectez-vous avec votre compte entrepreneur.
      </p>
    );
  }

  if (res.state === "error") {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="font-body text-sm font-semibold text-destructive">
          Impossible d'afficher vos chantiers pour le moment.
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

  if (res.chantiers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center font-body text-sm text-muted-foreground">
        Aucun chantier n'est encore associé à vos demandes.
      </p>
    );
  }

  const open = res.chantiers.find((c) => c.key === openKey) ?? null;

  if (open) {
    return (
      <div>
        <Button
          variant="outline"
          onClick={() => setOpenKey(null)}
          className="h-11 font-display text-sm font-bold uppercase tracking-wide"
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Tous mes chantiers
        </Button>
        <h3 className="mt-4 font-display text-lg font-bold">
          Chantier — {open.city || open.address || "adresse à confirmer"}
        </h3>
        <p className="font-body text-xs text-muted-foreground">
          {open.submissions.length} demande{open.submissions.length > 1 ? "s" : ""} associée
          {open.submissions.length > 1 ? "s" : ""}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {open.submissions.map((s) => (
            <SubmissionCard key={s.id} s={s} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {res.chantiers.map((c) => (
        <ChantierCard key={c.key} c={c} onOpen={() => setOpenKey(c.key)} />
      ))}
    </div>
  );
}