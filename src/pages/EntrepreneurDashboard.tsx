import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, ClipboardList, HardHat, Layers, Map as MapIcon, Plus, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { Button } from "@/components/ui/button";

import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "@/components/entrepreneur-app/AppStates";
import { QuickActions } from "@/components/entrepreneur-app/ui";
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
  const openRequests = requests.filter(request => request.filter === "active" || request.filter === "pending").length;
  const activeSites = chantiers.filter(chantier => summarizeChantier(chantier).active).length;

  return (
    <EntrepreneurAppShell title="Accueil" backTo={null}>
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 lg:py-6">
        <header className="mb-4">
          <p className="mb-1 font-body text-sm text-muted-foreground">Bonjour,</p>
          <h1 className="break-words font-display text-xl font-semibold leading-snug">{company}</h1>
          {!loading && !error && (openRequests > 0 || activeSites > 0) && <div className="mt-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {openRequests > 0 && <Button asChild variant="ghost" className="min-h-11 gap-2 px-0 font-body text-xs hover:bg-transparent"><Link to="/entrepreneur/demandes"><ClipboardList className="!h-4 !w-4 text-primary" strokeWidth={1.6} /><span><strong className="font-semibold">{openRequests}</strong> demande{openRequests > 1 ? "s" : ""} en cours</span><ChevronRight className="!h-3 !w-3 text-muted-foreground" /></Link></Button>}
              {activeSites > 0 && <Button asChild variant="ghost" className="min-h-11 gap-2 px-0 font-body text-xs hover:bg-transparent"><Link to="/entrepreneur/chantiers"><HardHat className="!h-4 !w-4 text-primary" strokeWidth={1.6} /><span><strong className="font-semibold">{activeSites}</strong> chantier{activeSites > 1 ? "s" : ""} actif{activeSites > 1 ? "s" : ""}</span><ChevronRight className="!h-3 !w-3 text-muted-foreground" /></Link></Button>}
            </div>
          </div>}
        </header>

        {!loading && !error && attention.length > 0 && <section className="mb-4">
          <h2 className="font-body text-xs font-semibold uppercase">À faire</h2>
          <div className="divide-y divide-border/25">{attention.map(request => <Link key={request.id} to={`/entrepreneur/demandes/${request.id}`} aria-label={`${request.title} · ${request.place} · ${request.nextAction}`} className="flex min-h-16 items-center gap-3 py-2 transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 motion-reduce:transition-none"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary/45"><ClipboardList className="h-[18px] w-[18px] text-primary" strokeWidth={1.6} /></span><div className="min-w-0 flex-1"><p className="break-words font-display text-sm font-semibold">{request.title}</p><p className="mt-0.5 break-words font-body text-[11px] text-muted-foreground">{request.place} · Besoin à préciser</p></div><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} /></Link>)}</div>
        </section>}

        <section className="mt-4">
           <div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-body text-xs font-semibold uppercase">Mes chantiers</h2><Button asChild variant="ghost" className="min-h-11 gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/entrepreneur/chantiers">Tout voir <ArrowRight className="!h-3.5 !w-3.5" /></Link></Button></div>
           {loading ? <LoadingSkeleton lines={3} compact /> : error ? <ErrorState onRetry={refresh} compact /> : recentChantiers.length === 0 ? <EmptyState compact title="Aucun chantier" message="Votre premier chantier apparaîtra ici dès votre demande." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
            <div className="divide-y divide-border/35">
              {recentChantiers.map(chantier => {
                const summary = summarizeChantier(chantier);
                const reference = chantier.submissions[0]?.number;
                return <Link key={chantier.key} to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} aria-label={chantier.label} className="flex items-start gap-3 rounded-md py-3 transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 motion-reduce:transition-none">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary/45"><HardHat className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.6} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-display text-sm font-semibold leading-snug" title={chantier.label}>{chantier.label.split(",")[0]}</p>
                    {chantier.city && chantier.label !== `${chantier.city} — lieu à préciser` && <p className="mt-0.5 font-body text-xs leading-snug text-muted-foreground">{chantier.city}</p>}
                    {(summary.material || summary.quantity) && <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{[summary.material, summary.quantity].filter(Boolean).join(" · ")}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1"><StatusBadge label={summary.statusLabel} tone={summary.tone} signature={summary.tone === "active" || summary.tone === "pending"} /><p className="font-body text-[11px] leading-relaxed text-muted-foreground">{[reference ? `#${reference}` : null, relativeDate(summary.lastActivity)].filter(Boolean).join(" · ")}</p></div>
                  </div>
                  <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.6} />
                </Link>;
              })}
            </div>
          )}
        </section>

        <section className="mt-5">
          <h2 className="mb-2 font-body text-xs font-semibold uppercase">Accès rapide</h2>
          <QuickActions actions={[
            { label: "Dompe", icon: MapIcon, to: "/entrepreneur/carte" },
            { label: "Transport", icon: Truck, to: "/entrepreneur/transports", primary: true },
            { label: "Demandes", icon: ClipboardList, to: "/entrepreneur/demandes" },
            { label: "Matériaux", icon: Layers, to: "/acheter-materiaux" },
          ]} />
        </section>
      </div>
    </EntrepreneurAppShell>
  );
}
