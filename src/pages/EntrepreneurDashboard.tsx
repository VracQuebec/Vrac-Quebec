import { Link } from "react-router-dom";
import { ArrowRight, Bell, CheckCircle2, ClipboardList, Map as MapIcon, Plus, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import InstallAppCard from "@/components/entrepreneur-app/InstallAppCard";
import { EmptyState, ErrorState, LoadingSkeleton, SectionHeader, StatusBadge } from "@/components/entrepreneur-app/AppStates";
import { AppCard, QuickActions } from "@/components/entrepreneur-app/ui";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { useEntrepreneurProfile } from "@/hooks/useEntrepreneurProfile";
import { useEntrepreneurNotifications } from "@/hooks/useEntrepreneurNotifications";
import { buildEntrepreneurRequests } from "@/lib/entrepreneur-app/requests";

export default function EntrepreneurDashboard() {
  const { profile } = useEntrepreneurProfile();
  const { loading, error, submissions, accessRequests, refresh } = useEntrepreneurData();
  const { items: notifications, unread } = useEntrepreneurNotifications(true);
  const requests = buildEntrepreneurRequests(submissions, accessRequests);
  const company = profile?.company || profile?.contact_name || profile?.name || "votre entreprise";
  const counts = {
    active: requests.filter((request) => request.filter === "active").length,
    pending: requests.filter((request) => request.filter === "pending").length,
    done: requests.filter((request) => request.filter === "done").length,
  };
  const attention = requests.filter((request) => request.filter === "pending").slice(0, 3);

  return (
    <EntrepreneurAppShell title="Accueil" subtitle={company} backTo={null}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
        <section className="mb-7 border-b border-border pb-6">
          <p className="font-body text-sm text-muted-foreground">Centre d’opérations</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <h2 className="max-w-2xl font-display text-2xl font-bold sm:text-3xl">Bonjour, {company}</h2>
            <Link to="/entrepreneur/demandes" className="inline-flex items-center gap-1 font-display text-sm font-semibold text-primary">Tous les dossiers <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>

        <QuickActions actions={[
          { label: "Nouvelle demande", icon: Plus, to: "/demande-transport", primary: true },
          { label: "Trouver une dompe", icon: MapIcon, to: "/entrepreneur/carte" },
          { label: "Demander du transport", icon: Truck, to: "/demande-transport" },
          { label: "Voir mes demandes", icon: ClipboardList, to: "/entrepreneur/demandes" },
        ]} />

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-7">
            <section>
              <SectionHeader title="Vue d’ensemble" />
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: "En cours", value: counts.active, filter: "active", tone: "text-primary" },
                  { label: "En attente", value: counts.pending, filter: "pending", tone: "text-amber-600 dark:text-amber-400" },
                  { label: "Terminées", value: counts.done, filter: "done", tone: "text-emerald-600 dark:text-emerald-400" },
                ].map((item) => <Link key={item.label} to={`/entrepreneur/demandes?filtre=${item.filter}`} className="rounded-md border border-border bg-card p-4 sm:p-5"><p className={`font-display text-2xl font-bold sm:text-3xl ${item.tone}`}>{item.value}</p><p className="mt-1 font-body text-xs text-muted-foreground sm:text-sm">{item.label}</p></Link>)}
              </div>
            </section>

            <section>
              <SectionHeader title="Demandes récentes" action={requests.length > 0 ? <Link to="/entrepreneur/demandes" className="font-display text-sm font-semibold text-primary">Tout voir</Link> : undefined} />
              {loading ? <LoadingSkeleton lines={3} /> : error ? <ErrorState onRetry={refresh} /> : requests.length === 0 ? <EmptyState title="Aucun dossier" message="Votre première demande apparaîtra ici avec tout son suivi." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {requests.slice(0, 4).map((request) => <AppCard key={request.id} to={`/entrepreneur/demandes/${request.id}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-display text-sm font-bold">{request.title}</p><p className="mt-1 truncate font-body text-xs text-muted-foreground">{request.place}</p></div><StatusBadge label={request.statusLabel} tone={request.tone} /></div><p className="mt-3 border-t border-border pt-3 font-body text-xs text-muted-foreground">{request.quantity || "Quantité à confirmer"}{request.date ? ` · ${new Date(request.date).toLocaleDateString("fr-CA")}` : ""}</p></AppCard>)}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section>
              <SectionHeader title="À traiter" action={unread > 0 ? <Link to="/entrepreneur/notifications" aria-label="Voir les notifications"><Bell className="h-5 w-5 text-primary" /></Link> : undefined} />
              {attention.length === 0 && unread === 0 ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /><p className="mt-2 font-display text-sm font-bold">Tout est à jour</p><p className="mt-1 font-body text-xs text-muted-foreground">Aucune action n’est requise pour le moment.</p></div> : (
                <div className="space-y-2">{attention.map((request) => <AppCard key={request.id} to={`/entrepreneur/demandes/${request.id}`} accent="amber"><p className="font-display text-sm font-bold">{request.title}</p><p className="mt-1 font-body text-xs text-muted-foreground">{request.nextAction}</p></AppCard>)}{notifications.filter((item) => !item.read_at).slice(0, Math.max(0, 3 - attention.length)).map((item) => <AppCard key={item.id} to="/entrepreneur/notifications" accent="primary"><p className="font-display text-sm font-bold">{item.title}</p>{item.body ? <p className="mt-1 line-clamp-2 font-body text-xs text-muted-foreground">{item.body}</p> : null}</AppCard>)}</div>
              )}
            </section>
            <InstallAppCard />
          </aside>
        </div>
      </div>
    </EntrepreneurAppShell>
  );
}