import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, ClipboardList, HardHat, Layers, Map as MapIcon, Plus, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { Button } from "@/components/ui/button";

import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "@/components/entrepreneur-app/AppStates";
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

  const activeSites = chantiers.filter(c => summarizeChantier(c).active).length;
  const openRequests = requests.filter(r => r.filter === "active" || r.filter === "pending").length;
  const dayStats = [
    activeSites > 0 && { value: activeSites, label: activeSites > 1 ? "chantiers actifs" : "chantier actif", to: "/entrepreneur/chantiers" },
    openRequests > 0 && { value: openRequests, label: openRequests > 1 ? "demandes" : "demande", to: "/entrepreneur/demandes" },
    attention.length > 0 && { value: attention.length, label: "à faire", to: "/entrepreneur/demandes", accent: true },
  ].filter(Boolean) as { value: number; label: string; to: string; accent?: boolean }[];

  return (
    <EntrepreneurAppShell title="Accueil" backTo={null}>
      <div className="ent-home mx-auto w-full max-w-4xl pb-2">
        <section className="px-5 pb-1 pt-6 sm:px-6 lg:pt-7" aria-label="Accueil et activité">
          <header className="min-w-0">
            <p className="font-body text-sm text-muted-foreground">Bonjour,</p>
            <h1 className="mt-1 max-w-lg break-words font-display text-2xl font-bold leading-tight">{company}</h1>
            <p className="mt-2 font-body text-xs text-muted-foreground">Voici ce qui se passe aujourd’hui</p>
          </header>
          <Button asChild className="ent-home-create mt-5 h-11 w-fit gap-2.5 rounded-lg px-4 font-body text-sm font-bold shadow-none transition-transform duration-150 active:scale-[0.97] motion-reduce:transform-none"><Link to="/demande-transport"><Plus className="!h-[18px] !w-[18px]" strokeWidth={2} />Nouvelle demande</Link></Button>
        </section>
        <nav aria-label="Accès rapides" className="grid grid-cols-4 gap-2 px-5 pb-4 pt-5 sm:px-6">
          {[
            { label: "Dompe", icon: MapIcon, to: "/entrepreneur/carte" },
            { label: "Transport", icon: Truck, to: "/entrepreneur/transports" },
            { label: "Demandes", icon: ClipboardList, to: "/entrepreneur/demandes" },
            { label: "Matériaux", icon: Layers, to: "/acheter-materiaux" },
          ].map(({ label, icon: Icon, to }) => <Button key={label} asChild variant="ghost" className="group h-auto min-w-0 flex-col gap-2 rounded-none px-0 py-0 text-foreground hover:bg-transparent active:opacity-70 motion-reduce:transition-none"><Link to={to}>
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary/40"><Icon className="!h-6 !w-6 transition-transform duration-150 group-active:scale-90 motion-reduce:transform-none" strokeWidth={1.8} /></span>
            <span className="font-body text-[11px] font-medium">{label}</span>
          </Link></Button>)}
        </nav>

        <div className="px-5 sm:px-6">
        {!loading && !error && dayStats.length > 0 && <section aria-label="État du jour" className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-border/30 py-1">
          {dayStats.map(stat => <Button key={stat.label} asChild variant="ghost" className="h-auto min-h-11 gap-1.5 rounded-none px-0 py-1 hover:bg-transparent active:opacity-60">
            <Link to={stat.to} aria-label={`${stat.value} ${stat.label}`}>
              {stat.accent && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
              <span className="font-display text-base font-bold tabular-nums">{stat.value}</span>
              <span className="font-body text-[10px] font-normal text-muted-foreground">{stat.label}</span>
            </Link>
          </Button>)}
        </section>}
        <section className="mt-4">
           <div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-display text-lg font-bold">Mes chantiers</h2><Button asChild variant="ghost" className="min-h-11 gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/entrepreneur/chantiers">Tout voir <ArrowRight className="!h-3.5 !w-3.5" /></Link></Button></div>
           {loading ? <LoadingSkeleton lines={3} compact /> : error ? <ErrorState onRetry={refresh} compact /> : recentChantiers.length === 0 ? <EmptyState compact title="Aucun chantier" message="Votre premier chantier apparaîtra ici dès votre demande." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
              <div className="divide-y divide-border/25">
              {recentChantiers.map(chantier => {
                const summary = summarizeChantier(chantier);
                const reference = chantier.submissions[0]?.number;
                const quantity = summary.quantity?.replace(/\btonnes?\b/g, "t");
                  return <Link key={chantier.key} to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} aria-label={[chantier.label, chantier.city, summary.material, summary.quantity, summary.statusLabel, relativeDate(summary.lastActivity)].filter(Boolean).join(" · ")} className="group flex items-start gap-3 py-3.5 transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none">
                     <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/40"><HardHat className="h-5 w-5 text-foreground" strokeWidth={1.8} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-display text-[15px] font-bold leading-snug" title={chantier.label}>{chantier.label.split(",")[0]}</p>
                      {(summary.material || quantity) && <p className="mt-1 font-body text-xs text-muted-foreground"><span>{summary.material}</span>{summary.material && quantity && <span className="px-1.5">·</span>}<span className="tabular-nums">{quantity}</span></p>}
                     <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="ent-site-status"><StatusBadge label={summary.statusLabel} tone={summary.tone} signature={summary.tone === "active" || summary.tone === "pending"} /></span><span className="font-body text-[11px] tabular-nums text-muted-foreground" title={relativeDate(summary.lastActivity)}>{reference ? `#${reference}` : relativeDate(summary.lastActivity)}</span></div>
                  </div>
                   <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.6} />
                </Link>;
              })}
            </div>
          )}
        </section>

        {!loading && !error && attention.length > 0 && <section className="mt-5">
          <h2 className="font-body text-xs font-medium text-muted-foreground">À faire</h2>
          <div className="divide-y divide-border/25">{attention.map(request => <Link key={request.id} to={`/entrepreneur/demandes/${request.id}`} aria-label={`${request.title} · ${request.place} · ${request.nextAction}`} className="flex min-h-14 items-center gap-3 py-2 transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 motion-reduce:transition-none"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary/45"><ClipboardList className="h-[18px] w-[18px] text-primary" strokeWidth={1.6} /></span><div className="min-w-0 flex-1"><p className="break-words font-display text-sm font-semibold">{request.title}</p><p className="mt-0.5 break-words font-body text-[11px] text-muted-foreground">{request.place} · Besoin à préciser</p></div><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} /></Link>)}</div>
        </section>}
        </div>

      </div>
    </EntrepreneurAppShell>
  );
}
