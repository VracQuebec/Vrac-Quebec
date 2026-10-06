import { Link } from "react-router-dom";
import { Plus, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { EmptyState, ErrorState, LoadingSkeleton, SectionHeader } from "@/components/entrepreneur-app/AppStates";
import { RequestCard } from "@/components/entrepreneur-app/ui";
import { Button } from "@/components/ui/button";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { buildEntrepreneurRequests } from "@/lib/entrepreneur-app/requests";

export default function EntrepreneurTransports() {
  const { loading, error, submissions, accessRequests, chantiers, refresh } = useEntrepreneurData();
  const transports = buildEntrepreneurRequests(submissions, accessRequests, chantiers).filter((request) => request.kind === "transport");
  const active = transports.filter((request) => request.filter === "active" || request.filter === "pending");
  const closed = transports.filter((request) => request.filter === "done" || request.filter === "cancelled");

  const render = (request: (typeof transports)[number]) => (
    <RequestCard
      key={request.id}
      to={`/entrepreneur/demandes/${request.id}`}
      kind="acces"
      title={request.chantierLabel}
      place={`${request.title}${request.transport?.truck_type ? ` · ${String(request.transport.truck_type)}` : ""}`}
      footer={`${request.quantity || "Voyages à confirmer"}${request.date ? ` · ${new Date(request.date).toLocaleDateString("fr-CA")}` : ""}`}
      nextAction={request.nextAction}
      badge={{ label: request.statusLabel, tone: request.tone }}
    />
  );

  return (
    <EntrepreneurAppShell title="Transports" backTo={null}>
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-body text-xs text-muted-foreground">{active.length} dossier{active.length !== 1 ? "s" : ""} en cours</p>
          </div>
          <Button asChild className="h-11 gap-2 rounded-lg px-3 font-body text-xs font-semibold shadow-none"><Link to="/demande-transport"><Plus className="mr-2 h-4 w-4" />Nouveau transport</Link></Button>
        </div>
        {loading ? <LoadingSkeleton lines={3} compact /> : error ? <ErrorState onRetry={refresh} compact /> : transports.length === 0 ? (
          <EmptyState compact title="Aucun transport" message="" actionLabel="Nouveau transport" actionTo="/demande-transport" />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <section><SectionHeader title="En cours" />{active.length ? <div className="divide-y divide-border/25">{active.map(render)}</div> : <p className="rounded-lg border border-dashed border-border p-5 font-body text-xs text-muted-foreground">Aucun transport actif.</p>}</section>
            <aside><SectionHeader title="Dossiers clos" />{closed.length ? <div className="divide-y divide-border/25">{closed.map(render)}</div> : <div className="py-3 text-center"><Truck className="mx-auto h-5 w-5 text-primary" /><p className="mt-2 font-body text-xs text-muted-foreground">Aucun dossier clos.</p></div>}</aside>
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}