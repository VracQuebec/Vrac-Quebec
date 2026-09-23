import { Link } from "react-router-dom";
import { Plus, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { EmptyState, ErrorState, LoadingSkeleton, SectionHeader } from "@/components/entrepreneur-app/AppStates";
import { RequestCard } from "@/components/entrepreneur-app/ui";
import { Button } from "@/components/ui/button";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { buildEntrepreneurRequests } from "@/lib/entrepreneur-app/requests";

export default function EntrepreneurTransports() {
  const { loading, error, submissions, accessRequests, refresh } = useEntrepreneurData();
  const transports = buildEntrepreneurRequests(submissions, accessRequests).filter((request) => request.kind === "transport");
  const active = transports.filter((request) => request.filter === "active" || request.filter === "pending");
  const closed = transports.filter((request) => request.filter === "done" || request.filter === "cancelled");

  const render = (request: (typeof transports)[number]) => (
    <RequestCard
      key={request.id}
      to={`/entrepreneur/demandes/${request.id}`}
      kind="acces"
      title={request.title}
      place={request.place}
      footer={`${request.quantity || "Voyages à confirmer"}${request.date ? ` · ${new Date(request.date).toLocaleDateString("fr-CA")}` : ""}`}
      nextAction={request.nextAction}
      badge={{ label: request.statusLabel, tone: request.tone }}
    />
  );

  return (
    <EntrepreneurAppShell title="Transports" subtitle="Planification et suivi" backTo={null}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-body text-sm text-muted-foreground">{active.length} dossier{active.length !== 1 ? "s" : ""} en cours</p>
          </div>
          <Button asChild className="h-11 font-display font-bold"><Link to="/demande-transport"><Plus className="mr-2 h-4 w-4" />Demander un transport</Link></Button>
        </div>
        {loading ? <LoadingSkeleton lines={3} /> : error ? <ErrorState onRetry={refresh} /> : transports.length === 0 ? (
          <EmptyState title="Aucun transport" message="Vos demandes de transport apparaîtront ici dès leur enregistrement." actionLabel="Demander un transport" actionTo="/demande-transport" />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <section><SectionHeader title="En cours" />{active.length ? <div className="grid gap-3 xl:grid-cols-2">{active.map(render)}</div> : <p className="rounded-lg border border-dashed border-border p-5 font-body text-sm text-muted-foreground">Aucun transport actif.</p>}</section>
            <aside><SectionHeader title="Dossiers clos" />{closed.length ? <div className="space-y-3">{closed.map(render)}</div> : <div className="rounded-lg border border-border bg-card p-5 text-center"><Truck className="mx-auto h-5 w-5 text-primary" /><p className="mt-2 font-body text-sm text-muted-foreground">Aucun dossier clos.</p></div>}</aside>
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}