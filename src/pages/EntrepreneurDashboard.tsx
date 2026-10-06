import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Layers, Map as MapIcon, Plus, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { Button } from "@/components/ui/button";

import { EmptyState, ErrorState, LoadingSkeleton, SectionHeader, StatusBadge } from "@/components/entrepreneur-app/AppStates";
import { AppCard, QuickActions } from "@/components/entrepreneur-app/ui";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { useEntrepreneurProfile } from "@/hooks/useEntrepreneurProfile";

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

  const requests = buildEntrepreneurRequests(submissions, accessRequests, chantiers);
  const company = profile?.company || profile?.contact_name || profile?.name || "votre entreprise";
  const recentChantiers = [...chantiers].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "")).slice(0, 4);
  const attention = requests.filter((request) => request.filter !== "done" && request.filter !== "cancelled" && request.nextAction === "Préciser le besoin (recevoir, évacuer ou acheter)").slice(0, 3);

  return (
    <EntrepreneurAppShell title="Accueil" backTo={null}>
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 lg:py-6">
        <header className="mb-3">
          <p className="mb-1 font-body text-sm text-muted-foreground">Bonjour,</p>
          <h1 className="break-words font-display text-xl font-semibold leading-snug sm:text-2xl">{company}</h1>
        </header>

        <QuickActions actions={[
          { label: "Demande", icon: Plus, to: "/demande-transport", primary: true },
          { label: "Dompes", icon: MapIcon, to: "/entrepreneur/carte" },
          { label: "Transport", icon: Truck, to: "/demande-transport" },
          { label: "Matériaux", icon: Layers, to: "/acheter-materiaux" },
        ]} />

        <section className="mt-4">
          <div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-display text-base font-semibold">Activité récente</h2><Button asChild variant="ghost" className="min-h-11 gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/entrepreneur/chantiers">Tout voir <ArrowRight className="!h-3.5 !w-3.5" /></Link></Button></div>
          {loading ? <LoadingSkeleton lines={3} /> : error ? <ErrorState onRetry={refresh} /> : recentChantiers.length === 0 ? <EmptyState title="Aucun chantier" message="Votre premier chantier apparaîtra ici dès votre demande." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
            <div className="divide-y divide-border/35">
              {recentChantiers.map(chantier => {
                const summary = summarizeChantier(chantier);
                const reference = chantier.submissions[0]?.number;
                return <Link key={chantier.key} to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} className="block rounded-md py-3 transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 motion-reduce:transition-none">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-display text-sm font-semibold leading-snug">{chantier.label}</p>
                    {chantier.city && chantier.label !== `${chantier.city} — lieu à préciser` && <p className="mt-0.5 font-body text-xs leading-snug text-muted-foreground">{chantier.city}</p>}
                    {(summary.material || summary.quantity) && <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{[summary.material, summary.quantity].filter(Boolean).join(" · ")}</p>}
                    <div className="mt-1.5 flex items-center justify-between gap-3"><StatusBadge label={summary.statusLabel} tone={summary.tone} /><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.6} /></div>
                    <p className="mt-0.5 font-body text-[10px] leading-relaxed text-muted-foreground">{[reference ? `Demande #${reference}` : null, relativeDate(summary.lastActivity)].filter(Boolean).join(" · ")}</p>
                  </div>
                </Link>;
              })}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-5">
            <Button asChild variant="ghost" className="min-h-11 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/entrepreneur/chantiers">Mes chantiers <ArrowRight className="!h-3.5 !w-3.5" /></Link></Button>
            <Button asChild variant="ghost" className="min-h-11 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/entrepreneur/demandes">Mes demandes <ArrowRight className="!h-3.5 !w-3.5" /></Link></Button>
          </div>
        </section>

        {attention.length > 0 && <section className="mt-3 border-t border-border/40 pt-4">
          <SectionHeader title="À faire" />
          <div className="space-y-2">{attention.map(request => <AppCard key={request.id} to={`/entrepreneur/demandes/${request.id}`} accent="amber"><p className="font-display text-sm font-semibold">{request.title}</p><p className="mt-1 font-body text-xs text-muted-foreground">{request.nextAction}</p></AppCard>)}</div>
        </section>}
      </div>
    </EntrepreneurAppShell>
  );
}
