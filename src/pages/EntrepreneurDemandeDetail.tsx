import { Link, useParams } from "react-router-dom";
import { CalendarDays, ClipboardList, MapPin, Package, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { AppCard } from "@/components/entrepreneur-app/ui";
import { EmptyState, ErrorState, LoadingSkeleton, SectionHeader, StatusBadge } from "@/components/entrepreneur-app/AppStates";
import DompesDemandeList from "@/components/entrepreneur/DompesDemandeList";
import LinkedTransportCard from "@/components/parcours/LinkedTransportCard";
import { Button } from "@/components/ui/button";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { buildEntrepreneurRequests } from "@/lib/entrepreneur-app/requests";
import { findChantierForSubmission } from "@/lib/parcours/chantiers";
import SubmissionProvenance from "@/components/entrepreneur-app/SubmissionProvenance";
import { possibleDuplicates } from "@/lib/parcours/sens-besoin";
import AddToCrmButton from "@/components/entcrm/AddToCrmButton";
import ServiceOffers from "@/components/ops/ServiceOffers";
import TransportLifecyclePanel from "@/components/entrepreneur-app/TransportLifecyclePanel";

const DetailLine = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex gap-3 border-b border-border py-3 last:border-0">
    <span className="mt-0.5 text-primary">{icon}</span>
    <div className="min-w-0">
      <dt className="font-display text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-body text-sm text-foreground">{value}</dd>
    </div>
  </div>
);

export default function EntrepreneurDemandeDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { loading, error, submissions, accessRequests, chantiers, refresh } = useEntrepreneurData();
  const request = buildEntrepreneurRequests(submissions, accessRequests, chantiers).find((item) => item.id === id || item.sourceId === id);
  const chantier = request?.submission ? findChantierForSubmission(chantiers, request.submission.id) : null;

  return (
    <EntrepreneurAppShell
      title={request ? `Dossier ${request.kind === "transport" ? "transport" : "demande"}` : "Dossier de demande"}
      subtitle={request ? `Réf. ${request.sourceId.slice(0, 8).toUpperCase()}` : undefined}
      backTo="/entrepreneur/demandes"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
        {loading ? <LoadingSkeleton lines={3} /> : error ? <ErrorState onRetry={refresh} /> : !request ? (
          <EmptyState title="Dossier introuvable" message="Cette demande ne fait pas partie de votre compte." actionLabel="Voir mes demandes" actionTo="/entrepreneur/demandes" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="min-w-0 space-y-6">
              <AppCard accent={request.filter === "pending" ? "amber" : "primary"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-body text-xs text-muted-foreground">{request.natureLabel}</p>
                    <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">{request.title}</h2>
                    <p className="mt-1 font-body text-sm text-muted-foreground">{request.place}</p>
                  </div>
                  <StatusBadge label={request.statusLabel} tone={request.tone} />
                </div>
                {request.submission && <div className="mt-3"><SubmissionProvenance s={request.submission} duplicates={possibleDuplicates(submissions).get(request.submission.id) ?? []} /></div>}
                <p className="mt-4 border-t border-border pt-3 font-display text-sm font-semibold text-primary">{request.nextAction}</p>
              </AppCard>

              {chantier && <Link to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} className="inline-flex items-center gap-1 font-display text-sm font-semibold text-primary">Ouvrir le dossier du lieu <MapPin className="h-4 w-4" /></Link>}

              {request.submission ? (
                <>
                  <section>
                    <SectionHeader title="Dompes demandées" />
                    <AppCard><DompesDemandeList submissionId={request.submission.id} /></AppCard>
                  </section>
                  <LinkedTransportCard submissionId={request.submission.id} />
                  <section>
                    <SectionHeader title="Voyages et services" />
                    <AppCard>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <Button asChild size="sm"><Link to={`/compteur/${request.submission.id}`}>Compter les voyages reçus</Link></Button>
                        <Button asChild size="sm" variant="outline"><Link to={`/compteur/${request.submission.id}?cote=livre`}>Compter les voyages livrés</Link></Button>
                        <Button asChild size="sm" variant="outline"><Link to="/chauffeur/mission">Mission chauffeur</Link></Button>
                      </div>
                      <ServiceOffers submissionId={request.submission.id} />
                    </AppCard>
                  </section>
                </>
              ) : (
                <>
                {request.transport?.id ? <TransportLifecyclePanel id={String(request.transport.id)} onChanged={refresh} /> : null}
                <section>
                  <SectionHeader title="Transport associé" />
                  <AppCard>
                    <p className="font-body text-sm text-muted-foreground">Ce dossier présente uniquement les renseignements de transport réellement enregistrés.</p>
                    {request.transport?.request_number ? <p className="mt-3 font-display text-sm font-bold">Nº {String(request.transport.request_number)}</p> : null}
                  </AppCard>
                </section>
                </>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <SectionHeader title="Résumé du dossier" />
              <AppCard>
                <dl>
                  <DetailLine icon={<ClipboardList className="h-4 w-4" />} label="Type" value={request.natureLabel} />
                  <DetailLine icon={<Package className="h-4 w-4" />} label="Besoin" value={request.title} />
                  <DetailLine icon={<MapPin className="h-4 w-4" />} label="Chantier" value={request.place} />
                  <DetailLine icon={<Truck className="h-4 w-4" />} label="Quantité / voyages" value={request.quantity || "À confirmer"} />
                  <DetailLine icon={<CalendarDays className="h-4 w-4" />} label="Créée le" value={request.date ? new Date(request.date).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }) : "À confirmer"} />
                </dl>
              </AppCard>
              {(request.kind === "transport" || request.dumpSearch) && (
                <Button asChild className="h-12 w-full font-display font-bold">
                  <Link to={request.kind === "transport" ? "/acces-dompe" : "/entrepreneur/carte"}>
                    {request.kind === "transport" ? "Nouvelle demande d'accès à une dompe" : "Trouver une dompe"}
                  </Link>
                </Button>
              )}
              {(request.submission?.id || request.transport?.id) && (
                <AddToCrmButton sourceType={request.submission ? "submission" : "transport_request"} sourceId={String(request.submission?.id ?? request.transport?.id)} />
              )}
            </aside>
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}