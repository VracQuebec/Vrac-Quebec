// ============================================================
// RATTACHEMENT INVERSE — suivi entrepreneur.
// Depuis une demande existante (submission), affiche la demande de
// transport RÉELLEMENT enregistrée en base (relation
// transport_requests.origin_submission_id). Lecture seule : consulter,
// ouvrir, recharger ne crée jamais de demande.
// Aucune valeur inventée : statut, date et site absents restent « à confirmer ».
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { statusMeta } from "@/lib/access-requests/status";
import {
  loadLinkedTransportRequest,
  type LinkedTransportLookup,
  type RpcClient,
} from "@/lib/parcours/validation";

interface Props {
  submissionId: string | null | undefined;
  /** Injection facilitant les tests ; par défaut le client Supabase. */
  client?: RpcClient;
}

export default function LinkedTransportCard({ submissionId, client }: Props) {
  const navigate = useNavigate();
  const [lookup, setLookup] = useState<LinkedTransportLookup | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!submissionId) {
      setLookup(null);
      return;
    }
    setLoading(true);
    const res = await loadLinkedTransportRequest(submissionId, client);
    setLookup(res);
    setLoading(false);
  }, [submissionId, client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!submissionId) return null;

  const shell = (children: React.ReactNode) => (
    <section className="mt-6 border-t border-border pt-5">
      <p className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
        <Truck className="h-4 w-4 text-primary" aria-hidden /> Demande de transport
      </p>
      {children}
    </section>
  );

  if (loading || !lookup) {
    return shell(
      <p className="mt-2 flex items-center gap-2 font-body text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Vérification en cours…
      </p>,
    );
  }

  if (lookup.state === "unauthorized") {
    return shell(
      <p className="mt-2 font-body text-sm text-muted-foreground">
        Connectez-vous à votre espace entrepreneur pour consulter la demande de transport
        associée à ce projet.
      </p>,
    );
  }

  if (lookup.state === "error") {
    return shell(
      <>
        <p className="mt-2 font-body text-sm font-semibold text-destructive">
          Impossible de vérifier si une demande de transport existe pour le moment.
        </p>
        <Button variant="outline" onClick={() => void reload()}
          className="mt-3 h-11 font-display text-sm font-bold uppercase tracking-wide">
          Réessayer
        </Button>
      </>,
    );
  }

  if (lookup.state === "none") {
    return shell(
      <p className="mt-2 font-body text-sm text-muted-foreground">
        Aucun transport lié.
      </p>,
    );
  }

  const r = lookup.request;
  const meta = r.status ? statusMeta(r.status) : null;

  return shell(
    <>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        Demande associée à votre projet
        {r.requestNumber ? ` · ${r.requestNumber}` : ""}
      </p>
      <dl className="mt-3 grid gap-1.5 font-body text-sm text-foreground sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold">Statut : </dt>
          <dd className="inline">
            {meta ? (
              <span
                className="ml-1 inline-block rounded-full px-2 py-0.5 align-middle font-display text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: meta.color }}
              >
                {meta.label}
              </span>
            ) : (
              "À confirmer"
            )}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">Date : </dt>
          <dd className="inline">
            {r.createdAt ? new Date(r.createdAt).toLocaleDateString("fr-CA") : "À confirmer"}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">Site sélectionné : </dt>
          <dd className="inline">{r.dumpName || "À confirmer"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline font-semibold">Adresse : </dt>
          <dd className="inline">{r.siteAddress || "Communiquée après confirmation"}</dd>
        </div>
      </dl>
      <Button
        onClick={() => navigate(`/demande-transport?submission=${r.submissionId ?? submissionId}`)}
        className="mt-4 min-h-11 w-full font-display text-sm font-semibold sm:w-auto"
      >
        Voir ma demande de transport
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    </>,
  );
}
