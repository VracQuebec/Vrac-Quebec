import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/entrepreneur-app/AppStates";
import { AppTabs, RequestCard } from "@/components/entrepreneur-app/ui";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { buildEntrepreneurRequests, requestMatchesFilter, type RequestFilter } from "@/lib/entrepreneur-app/requests";

const FILTERS: { key: RequestFilter; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "active", label: "En cours" },
  { key: "pending", label: "En attente" },
  { key: "done", label: "Terminées" },
  { key: "cancelled", label: "Annulées" },
];

export default function EntrepreneurDemandes() {
  const { loading, error, submissions, accessRequests, chantiers, refresh } = useEntrepreneurData();
  const [params, setParams] = useSearchParams();
  const initial = params.get("filtre") as RequestFilter | null;
  const [filter, setFilter] = useState<RequestFilter>(FILTERS.some((item) => item.key === initial) ? initial ?? "all" : "all");
  const [query, setQuery] = useState("");
  const requests = useMemo(() => buildEntrepreneurRequests(submissions, accessRequests, chantiers), [submissions, accessRequests, chantiers]);
  const visible = requests.filter((request) => {
    if (!requestMatchesFilter(request, filter)) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${request.title} ${request.chantierLabel} ${request.place} ${request.sourceId}`.toLowerCase().includes(needle);
  });

  const chooseFilter = (next: RequestFilter) => {
    setFilter(next);
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("filtre"); else copy.set("filtre", next);
    setParams(copy, { replace: true });
  };

  return (
    <EntrepreneurAppShell title="Mes demandes" subtitle={`${requests.length} dossier${requests.length !== 1 ? "s" : ""}`} backTo={null} showFab>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un dossier" aria-label="Chercher un dossier" className="h-12 w-full rounded-md border border-border bg-card pl-10 pr-3 font-body text-sm outline-none focus:border-primary" />
            </div>
            <div className="lg:hidden">
              <AppTabs tabs={FILTERS.map((item) => ({ id: item.key, label: item.label, count: requests.filter((request) => requestMatchesFilter(request, item.key)).length }))} value={filter} onChange={(id) => chooseFilter(id as RequestFilter)} />
            </div>
            <nav className="hidden overflow-hidden rounded-md border border-border bg-card lg:block" aria-label="Filtrer les demandes">
              {FILTERS.map((item) => {
                const count = requests.filter((request) => requestMatchesFilter(request, item.key)).length;
                return <button key={item.key} type="button" onClick={() => chooseFilter(item.key)} className={`flex min-h-12 w-full items-center justify-between border-b border-border px-4 text-left font-display text-sm font-semibold last:border-0 ${filter === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><span>{item.label}</span><span>{count}</span></button>;
              })}
            </nav>
            <a href="/entrepreneur/chantiers" className="hidden font-display text-sm font-semibold text-primary lg:inline-flex">Voir les regroupements par chantier</a>
          </aside>

          <section className="min-w-0">
            {loading ? <LoadingSkeleton lines={4} /> : error ? <ErrorState onRetry={refresh} /> : visible.length === 0 ? (
              <EmptyState title={requests.length === 0 ? "Aucune demande pour l'instant" : "Aucun dossier dans ce filtre"} message={requests.length === 0 ? "Créez votre première demande : son dossier apparaîtra ici." : "Essayez un autre filtre ou une autre recherche."} actionLabel={requests.length === 0 ? "Nouvelle demande" : undefined} actionTo={requests.length === 0 ? "/demande-transport" : undefined} />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {visible.map((request) => (
                  <RequestCard key={request.id} to={`/entrepreneur/demandes/${request.id}`} kind={request.kind === "transport" ? "acces" : "materiau"} title={`Chantier — ${request.chantierLabel}`} place={`${request.kind === "transport" ? "Transport" : "Demande de matériau"} · ${request.title}`} footer={`${request.quantity || "Quantité à confirmer"}${request.date ? ` · ${new Date(request.date).toLocaleDateString("fr-CA")}` : ""}`} nextAction="Voir le dossier" badge={{ label: request.statusLabel, tone: request.tone }} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </EntrepreneurAppShell>
  );
}