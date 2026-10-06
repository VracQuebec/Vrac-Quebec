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

  const pad = (n: number) => String(n).padStart(2, "0");
  const today = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  const activity = [
    { value: activeSites, label: activeSites > 1 ? "Chantiers actifs" : "Chantier actif", to: "/entrepreneur/chantiers" },
    { value: openRequests, label: openRequests > 1 ? "Demandes" : "Demande", to: "/entrepreneur/demandes" },
    { value: attention.length, label: "À faire", to: "/entrepreneur/demandes", accent: attention.length > 0 },
  ];
  void dayStats;

  return (
    <EntrepreneurAppShell title="Accueil" backTo={null}>
      <div className="ent-home mx-auto w-full max-w-4xl pb-4">
        <div className="px-3 pt-3 sm:px-6 sm:pt-5">
          <section aria-label="Accueil et activité" className="relative overflow-hidden rounded-2xl bg-foreground px-5 pb-5 pt-5 text-background">
            <svg aria-hidden className="pointer-events-none absolute -right-6 top-0 h-full w-40 text-background/[0.07]" viewBox="0 0 160 200" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round"><path d="M10 210 L90 120 L60 80 L150 -10" /></svg>
            <span aria-hidden className="absolute left-0 top-5 h-8 w-1 rounded-r bg-primary" />
            <p className="relative font-body text-[11px] font-medium uppercase tracking-[0.12em] text-background/55 first-letter:uppercase">{today}</p>
            <h1 className="relative mt-2 break-words font-display text-[26px] font-extrabold leading-[1.1]"><span className="block text-base font-semibold text-background/70">Bonjour,</span>{company}</h1>
            <p className="relative mt-2 font-body text-[13px] text-background/60">Voici ce qui se passe sur vos chantiers.</p>
            <Button asChild className="ent-home-create relative mt-5 h-[52px] w-full justify-between gap-3 rounded-xl bg-primary px-5 font-display text-[15px] font-bold text-foreground shadow-none hover:bg-primary active:scale-[0.98] motion-reduce:transform-none sm:w-auto sm:min-w-72"><Link to="/demande-transport"><span className="flex items-center gap-2.5"><Plus className="!h-5 !w-5" strokeWidth={2.6} />Nouvelle demande</span><ArrowRight className="!h-[18px] !w-[18px]" strokeWidth={2.2} /></Link></Button>
            {!loading && !error && <div className="relative mt-5 grid grid-cols-3 border-t border-background/10 pt-4">
              {activity.map((stat, i) => <Link key={stat.label} to={stat.to} aria-label={`${stat.value} ${stat.label}`} className={`flex min-h-11 flex-col rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${i > 0 ? "border-l border-background/10 pl-4" : ""}`}>
                <span className={`font-display text-[30px] font-extrabold leading-none tabular-nums ${stat.accent ? "text-primary" : ""}`}>{pad(stat.value)}</span>
                <span className="mt-1.5 font-body text-[11px] text-background/60">{stat.label}</span>
              </Link>)}
            </div>}
          </section>
        </div>

        <nav aria-label="Accès rapides" className="grid grid-cols-4 gap-1 px-4 pb-2 pt-5 sm:px-6">
          {[
            { label: "Dompe", icon: MapIcon, to: "/entrepreneur/carte" },
            { label: "Transport", icon: Truck, to: "/entrepreneur/transports" },
            { label: "Demandes", icon: ClipboardList, to: "/entrepreneur/demandes", badge: openRequests },
            { label: "Matériaux", icon: Layers, to: "/acheter-materiaux" },
          ].map(({ label, icon: Icon, to, badge }) => <Link key={label} to={to} className="group flex min-w-0 flex-col items-center gap-2 rounded-xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:opacity-70">
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground transition-transform duration-150 group-active:scale-95 motion-reduce:transform-none">
              <Icon className="h-6 w-6" strokeWidth={2} />
              {!!badge && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-body text-[10px] font-bold text-foreground ring-2 ring-background">{badge}</span>}
            </span>
            <span className="font-body text-xs font-semibold">{label}</span>
          </Link>)}
        </nav>

        <div className="px-5 sm:px-6">
        <section className="mt-5">
           <div className="mb-1 flex items-end justify-between gap-2"><h2 className="font-display text-xl font-extrabold">Mes chantiers</h2><Link to="/entrepreneur/chantiers" className="flex min-h-11 items-center gap-1 font-body text-xs font-semibold text-muted-foreground hover:text-foreground">Tout voir <ArrowRight className="h-3.5 w-3.5" /></Link></div>
           {loading ? <LoadingSkeleton lines={3} compact /> : error ? <ErrorState onRetry={refresh} compact /> : recentChantiers.length === 0 ? <EmptyState compact title="Aucun chantier" message="Votre premier chantier apparaîtra ici dès votre demande." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
              <div className="divide-y divide-border/40">
              {recentChantiers.map(chantier => {
                const summary = summarizeChantier(chantier);
                const reference = chantier.submissions[0]?.number;
                const quantity = summary.quantity?.replace(/\btonnes?\b/g, "t");
                const live = summary.tone === "active" || summary.tone === "pending";
                  return <Link key={chantier.key} to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} aria-label={[chantier.label, chantier.city, summary.material, summary.quantity, summary.statusLabel, relativeDate(summary.lastActivity)].filter(Boolean).join(" · ")} className="group flex items-center gap-3.5 py-4 transition-colors duration-150 active:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${live ? "bg-foreground text-primary" : "bg-secondary text-foreground"}`}><HardHat className="h-5 w-5" strokeWidth={2} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3"><p className="min-w-0 truncate font-display text-base font-bold leading-snug" title={chantier.label}>{chantier.label.split(",")[0]}</p>{reference && <span className="shrink-0 font-body text-[11px] font-semibold tabular-nums text-muted-foreground">#{reference}</span>}</div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <p className="min-w-0 font-body text-xs text-muted-foreground">{summary.material}{summary.material && quantity && <span className="px-1.5">·</span>}<span className="tabular-nums">{quantity}</span></p>
                      <span className="ent-site-status"><StatusBadge label={summary.statusLabel} tone={summary.tone} signature={live} /></span>
                    </div>
                  </div>
                   <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.8} />
                </Link>;
              })}
            </div>
          )}
        </section>

        {!loading && !error && <section className="mt-6" aria-label="À faire">
          <h2 className="mb-2 font-display text-xl font-extrabold">À faire</h2>
          {attention.length === 0 ? <p className="flex items-center gap-2 py-2 font-body text-sm font-medium"><span className="h-2 w-2 rounded-full bg-primary" aria-hidden />Tout est à jour</p> :
          <div className="space-y-2">{attention.map(request => <Link key={request.id} to={`/entrepreneur/demandes/${request.id}`} aria-label={`${request.title} · ${request.place} · ${request.nextAction}`} className="flex min-h-14 items-center gap-3 rounded-xl bg-secondary/60 px-3 py-3 transition-colors duration-150 active:bg-secondary motion-reduce:transition-none"><span className="h-8 w-1 shrink-0 rounded-full bg-primary" aria-hidden /><div className="min-w-0 flex-1"><p className="break-words font-display text-sm font-bold">Préciser le besoin · {request.title}</p><p className="mt-0.5 break-words font-body text-[11px] text-muted-foreground">{request.place}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2} /></Link>)}</div>}
        </section>}
        </div>

      </div>
    </EntrepreneurAppShell>
  );
}
