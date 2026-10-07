import { Link, useParams } from "react-router-dom";
import { CalendarDays, Check, ChevronRight, Circle, ClipboardList, HardHat, MapPin, Package, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { AppCard } from "@/components/entrepreneur-app/ui";
import { EmptyState, ErrorState, LoadingSkeleton, SectionHeader, StatusBadge } from "@/components/entrepreneur-app/AppStates";
import DompesDemandeList from "@/components/entrepreneur/DompesDemandeList";
import LinkedTransportCard from "@/components/parcours/LinkedTransportCard";
import { Button } from "@/components/ui/button";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { buildEntrepreneurRequests, buildRequestTracking } from "@/lib/entrepreneur-app/requests";
import { findChantierForSubmission, findChantierForTransport } from "@/lib/parcours/chantiers";
import SubmissionProvenance from "@/components/entrepreneur-app/SubmissionProvenance";
import { possibleDuplicates } from "@/lib/parcours/sens-besoin";
import AddToCrmButton from "@/components/entcrm/AddToCrmButton";
import TransportLifecyclePanel from "@/components/entrepreneur-app/TransportLifecyclePanel";
import { deriveJourneyStage } from "@/lib/parcours/submission-display";
import { mapLinkedTransport } from "@/lib/parcours/validation";

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
  const { loading, error, submissions, accessRequests, chantiers, trips, tripsAvailable, refresh } = useEntrepreneurData();
  const request = buildEntrepreneurRequests(submissions, accessRequests, chantiers).find((item) => item.id === id || item.sourceId === id);
  const chantier = request?.submission
    ? findChantierForSubmission(chantiers, request.submission.id)
    : request?.transport
      ? findChantierForTransport(chantiers, request.transport)
      : null;
  const linkedTransport = request?.submission
    ? accessRequests.find((item) => String(item.origin_submission_id ?? "") === request.submission?.id)
    : null;
  const linkedTrips = request?.submission ? trips.filter((trip) => trip.submission_id === request.submission?.id && !trip.voided_at) : [];
  const tracking = request ? buildRequestTracking(request, linkedTransport, linkedTrips) : [];
  const journey = request?.submission ? deriveJourneyStage(request.submission, linkedTransport, linkedTrips) : null;

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
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="min-w-0 space-y-7">
              <section className="border-b border-border pb-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><StatusBadge label={request.statusLabel} tone={request.tone} /><span className="font-body text-xs font-semibold tabular-nums text-muted-foreground">Nº {request.reference}</span></div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-body text-xs font-semibold uppercase text-muted-foreground">{request.typeLabel}</p>
                    <h2 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{request.title}</h2>
                    <p className="mt-1 font-body text-sm text-muted-foreground">{request.chantierLabel}</p>
                  </div>
                </div>
                {request.submission && <div className="mt-3"><SubmissionProvenance s={request.submission} duplicates={possibleDuplicates(submissions).get(request.submission.id) ?? []} /></div>}
                <p className="mt-4 font-display text-sm font-semibold text-primary">{journey ? `${journey.label} · ${journey.detail}` : `Prochaine étape · ${request.nextAction}`}</p>
              </section>

              <section>
                <SectionHeader title="Informations" />
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  <DetailLine icon={<ClipboardList className="h-4 w-4" />} label="Type de demande" value={request.natureLabel || "Non précisé"} />
                  <DetailLine icon={<HardHat className="h-4 w-4" />} label="Chantier" value={request.chantierLabel || "À compléter"} />
                  <DetailLine icon={<MapPin className="h-4 w-4" />} label="Adresse / ville" value={request.place || request.city || "À compléter"} />
                  <DetailLine icon={<Package className="h-4 w-4" />} label="Matériau / service" value={request.subjectLabel || "Non précisé"} />
                  <DetailLine icon={<Truck className="h-4 w-4" />} label="Quantité / voyages" value={request.quantity || "À compléter"} />
                  <DetailLine icon={<CalendarDays className="h-4 w-4" />} label="Date" value={request.date ? new Date(request.date).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }) : "À compléter"} />
                </dl>
              </section>

              <section>
                <SectionHeader title="Suivi de la demande" />
                <ol className="space-y-0" aria-label="Progression de la demande">
                  {tracking.map((step, index) => <li key={step.label} className="relative flex min-h-12 gap-3 pb-3 last:pb-0">
                    {index < tracking.length - 1 && <span aria-hidden className={`absolute left-[9px] top-5 h-[calc(100%-0.25rem)] w-px ${step.state === "done" ? "bg-primary" : "bg-border"}`} />}
                    <span className={`relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.state === "done" ? "bg-primary text-primary-foreground" : step.state === "current" ? "border-2 border-primary bg-background text-primary" : "border border-border bg-background text-muted-foreground"}`}>{step.state === "done" ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2 fill-current" />}</span>
                    <div><p className={`font-display text-sm font-semibold ${step.state === "upcoming" ? "text-muted-foreground" : "text-foreground"}`}>{step.label}</p>{step.state === "current" && <p className="mt-0.5 font-body text-xs text-muted-foreground">Étape actuelle</p>}</div>
                  </li>)}
                </ol>
              </section>

              <section>
                <SectionHeader title="Éléments liés" />
                <div className="divide-y divide-border">
                  <div className="flex min-h-12 items-center justify-between gap-3 py-2"><div><p className="font-display text-sm font-semibold">Chantier</p><p className="font-body text-xs text-muted-foreground">{chantier?.label || "Aucun chantier lié"}</p></div>{chantier && <Link to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} aria-label="Voir le chantier" className="flex h-11 w-11 items-center justify-center rounded-md text-primary hover:bg-secondary"><ChevronRight className="h-5 w-5" /></Link>}</div>
                  <div className="py-2"><p className="font-display text-sm font-semibold">Matériau</p><p className="font-body text-xs text-muted-foreground">{request.subjectLabel || "Aucun matériau lié"}</p></div>
                </div>
              </section>

              {request.submission ? (
                <>
                  <section>
                    <SectionHeader title="Dompe" />
                    <DompesDemandeList submissionId={request.submission.id} showEmpty />
                  </section>
                  <LinkedTransportCard submissionId={request.submission.id} existingRequest={linkedTransport ? mapLinkedTransport(linkedTransport) : null} />
                  <section>
                    <SectionHeader title="Voyages et services" />
                    <div className="divide-y divide-border">
                      <div className="py-2"><p className="font-display text-sm font-semibold">Voyage</p><p className="font-body text-xs text-muted-foreground">{linkedTrips.length > 0 ? `${linkedTrips.length} voyage${linkedTrips.length > 1 ? "s" : ""} enregistré${linkedTrips.length > 1 ? "s" : ""}` : tripsAvailable ? "Aucun voyage lié" : "Information de voyage non disponible dans ce suivi."}</p></div>
                      <div className="py-2"><p className="font-display text-sm font-semibold">Service</p><p className="font-body text-xs text-muted-foreground">Aucun service lié.</p></div>
                    </div>
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
              <SectionHeader title="Actions" />
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