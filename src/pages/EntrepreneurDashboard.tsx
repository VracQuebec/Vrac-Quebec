import { Link } from "react-router-dom";
import { ArrowRight, Bell, CheckCircle2, ClipboardList, Map as MapIcon, Plus, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import ObligationsCard from "@/components/obligations/ObligationsCard";
import InstallAppCard from "@/components/entrepreneur-app/InstallAppCard";
import { EmptyState, ErrorState, LoadingSkeleton, SectionHeader, StatusBadge } from "@/components/entrepreneur-app/AppStates";
import { AppCard, QuickActions } from "@/components/entrepreneur-app/ui";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { useEntrepreneurProfile } from "@/hooks/useEntrepreneurProfile";
import { useEntrepreneurNotifications } from "@/hooks/useEntrepreneurNotifications";
import { buildEntrepreneurRequests } from "@/lib/entrepreneur-app/requests";
import { summarizeChantier } from "@/lib/parcours/chantiers";

const relativeDate = (value: string | null) => {
  if (!value) return "À confirmer";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "Aujourd’hui";
  if (days === 1) return "Hier";
  return new Date(value).toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
};

export default function EntrepreneurDashboard() {
  const { profile } = useEntrepreneurProfile();
  const { loading, error, submissions, accessRequests, chantiers, refresh } = useEntrepreneurData();
  const { items: notifications, unread } = useEntrepreneurNotifications(true);
  const requests = buildEntrepreneurRequests(submissions, accessRequests, chantiers);
  const company = profile?.company || profile?.contact_name || profile?.name || "votre entreprise";
  const activeChantiers = chantiers.filter((chantier) => summarizeChantier(chantier).active).slice(0, 4);
  const attention = requests.filter((request) => request.filter === "pending" && request.submission?.selectedSiteId).slice(0, 3);

  return (
    <EntrepreneurAppShell title="Accueil" subtitle={company} backTo={null}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
        <section className="mb-5 border-b border-border pb-5">
          <p className="font-body text-sm text-muted-foreground">Vos chantiers, au même endroit</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h2 className="max-w-2xl font-display text-2xl font-bold sm:text-3xl">Bonjour, {company}</h2>
          </div>
        </section>

        <QuickActions actions={[
          { label: "Nouvelle demande", icon: Plus, to: "/demande-transport", primary: true },
          { label: "Trouver une dompe", icon: MapIcon, to: "/entrepreneur/carte" },
          { label: "Demander du transport", icon: Truck, to: "/demande-transport" },
          { label: "Voir mes demandes", icon: ClipboardList, to: "/entrepreneur/demandes" },
        ]} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <section>
              <SectionHeader title="Mes chantiers" action={chantiers.length > 0 ? <Link to="/entrepreneur/chantiers" className="inline-flex items-center gap-1 font-display text-sm font-semibold text-primary">Tous les chantiers <ArrowRight className="h-4 w-4" /></Link> : undefined} />
              {loading ? <LoadingSkeleton lines={3} /> : error ? <ErrorState onRetry={refresh} /> : chantiers.length === 0 ? <EmptyState title="Aucun chantier" message="Votre premier chantier apparaîtra ici dès votre demande." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(activeChantiers.length > 0 ? activeChantiers : chantiers.slice(0, 4)).map((chantier) => {
                    const summary = summarizeChantier(chantier);
                    return <AppCard key={chantier.key} to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-body text-[10px] font-semibold uppercase text-muted-foreground">Chantier</p><p className="truncate font-display text-base font-bold">{chantier.label}</p></div><StatusBadge label={summary.statusLabel} tone={summary.tone} /></div><p className="mt-2 truncate font-body text-sm">{summary.material || "Matériau à confirmer"} · {summary.quantity || "Quantité à confirmer"}</p><div className="mt-3 flex items-center justify-between border-t border-border pt-3 font-body text-xs text-muted-foreground"><span>{chantier.submissions.length} demande{chantier.submissions.length > 1 ? "s" : ""}</span><span>Activité : {relativeDate(summary.lastActivity)}</span></div></AppCard>;
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section>
              <SectionHeader title="À traiter" action={unread > 0 ? <Link to="/entrepreneur/notifications" aria-label="Voir les notifications"><Bell className="h-5 w-5 text-primary" /></Link> : undefined} />
              {attention.length === 0 && unread === 0 ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /><p className="mt-2 font-display text-sm font-bold">Tout est à jour</p><p className="mt-1 font-body text-xs text-muted-foreground">Aucune action requise pour le moment.</p></div> : (
                <div className="space-y-2">{attention.map((request) => <AppCard key={request.id} to={`/entrepreneur/demandes/${request.id}`} accent="amber"><p className="font-body text-[10px] font-semibold uppercase text-muted-foreground">{request.chantierLabel}</p><p className="font-display text-sm font-bold">{request.title}</p><p className="mt-1 font-body text-xs text-muted-foreground">{request.nextAction}</p></AppCard>)}{notifications.filter((item) => !item.read_at).slice(0, Math.max(0, 3 - attention.length)).map((item) => <AppCard key={item.id} to="/entrepreneur/notifications" accent="primary"><p className="font-display text-sm font-bold">{item.title}</p>{item.body ? <p className="mt-1 line-clamp-2 font-body text-xs text-muted-foreground">{item.body}</p> : null}</AppCard>)}</div>
              )}
            </section>
            <ObligationsCard />
            <InstallAppCard />
          </aside>
        </div>
      </div>
    </EntrepreneurAppShell>
  );
}