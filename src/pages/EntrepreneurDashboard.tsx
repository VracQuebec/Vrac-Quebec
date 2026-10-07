import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, ClipboardList, HardHat, Layers, Map as MapIcon, Plus, Truck } from "lucide-react";
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
  const company = profile?.company || profile?.contact_name || profile?.name;
  const recentChantiers = [...chantiers].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "")).slice(0, 4);
  const attention = requests.filter((request) => request.filter !== "done" && request.filter !== "cancelled" && request.nextAction === "Préciser le besoin (recevoir, évacuer ou acheter)").slice(0, 3);

  const activeSites = chantiers.filter(c => summarizeChantier(c).active).length;
  const openRequests = requests.filter(r => r.filter === "active" || r.filter === "pending").length;
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = new Date().toLocaleDateString("fr-CA", { day: "numeric", month: "long" });
  const activity = [
    { value: activeSites, label: activeSites > 1 ? "Chantiers actifs" : "Chantier actif", to: "/entrepreneur/chantiers" },
    { value: openRequests, label: openRequests > 1 ? "Demandes" : "Demande", to: "/entrepreneur/demandes" },
    { value: attention.length, label: "À faire", to: "/entrepreneur/demandes", accent: attention.length > 0 },
  ];

  return (
    <EntrepreneurAppShell title="Accueil" backTo={null}>
      <div className="ent-home mx-auto w-full max-w-4xl pb-4">
        <section aria-label="Accueil" className="px-5 pb-2 pt-3 sm:px-8 sm:pt-7">
          <p className="font-body text-sm font-medium text-muted-foreground">Bonjour,</p>
          <h1 className="mt-1 max-w-full break-words font-display text-[32px] font-extrabold uppercase leading-[1.15] sm:text-4xl">{company || <span aria-label="Identité de l’entreprise en chargement" className="inline-block h-9 w-48 max-w-full rounded bg-muted" />}</h1>
          <p className="mt-3 font-body text-[11px] font-medium text-muted-foreground">Aujourd’hui · {today}</p>
        </section>

        {!loading && !error && <section aria-label="Activité" className="relative overflow-hidden bg-foreground px-5 pb-3 pt-2.5 text-background sm:px-8">
          <div className="flex items-center gap-4">
            <h2 className="font-body text-[10px] font-bold uppercase text-background/60">Activité</h2>
            <div aria-hidden className="relative h-3 flex-1 border-b border-background/15">
              <span className="absolute -bottom-0.5 left-0 h-1 w-1 bg-background/30" />
              <span className="absolute -bottom-0.5 left-1/3 h-1 w-1 rotate-45 border border-background/30" />
              <span className="absolute bottom-0 right-8 h-3 w-7 border-r border-t border-background/20" />
              <span className="absolute -bottom-0.5 right-0 h-1 w-1 bg-primary" />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {activity.map(stat => <Button asChild variant="ghost" key={stat.label} className="h-auto min-w-0 items-start justify-start rounded-none p-0 text-background hover:bg-transparent hover:text-background"><Link to={stat.to} aria-label={`${stat.value} ${stat.label}`} className="flex flex-col">
              <span className="flex items-start gap-1.5 font-display text-[52px] font-extrabold leading-none tabular-nums sm:text-[64px]">{pad(stat.value)}{stat.accent && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}</span>
              <span className="mt-2 font-body text-[11px] font-medium text-background/70">{stat.label}</span>
            </Link></Button>)}
          </div>
        </section>}

        <div className="px-5 pt-2 sm:px-8">
          <Button asChild variant="ghost" className="ent-home-create h-11 w-auto max-w-full justify-start rounded-lg p-0 font-display text-sm font-semibold text-foreground shadow-none hover:bg-transparent hover:text-foreground active:scale-[0.98] motion-reduce:transform-none"><Link to="/demande-transport"><span className="flex h-[38px] max-w-full items-center gap-2 rounded-lg bg-primary px-3"><Plus className="!h-4 !w-4" strokeWidth={2.3} />Nouvelle demande<ArrowRight className="ml-4 !h-4 !w-4" strokeWidth={2} /></span></Link></Button>
        </div>

        <nav aria-label="Accès rapides" className="grid grid-cols-4 gap-1 px-4 pb-0 pt-3 sm:px-7">
          {[
            { label: "Dompe", icon: MapIcon, to: "/entrepreneur/carte" },
            { label: "Transport", icon: Truck, to: "/entrepreneur/transports" },
            { label: "Demandes", icon: ClipboardList, to: "/entrepreneur/demandes", badge: openRequests },
            { label: "Matériaux", icon: Layers, to: "/acheter-materiaux" },
          ].map(({ label, icon: Icon, to, badge }) => <Button asChild variant="ghost" key={label} className="group h-auto min-w-0 flex-col gap-1 rounded-lg px-0 py-1 hover:bg-secondary/40 hover:text-foreground active:opacity-70"><Link to={to}>
            <span className="relative flex h-12 w-12 items-center justify-center text-foreground transition-transform duration-150 group-active:scale-95 motion-reduce:transform-none">
              <Icon className="!h-7 !w-7" strokeWidth={1.9} />
              {!!badge && <span className="absolute -right-0.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-body text-[9px] font-bold text-foreground ring-2 ring-background">{badge}</span>}
            </span>
            <span className="font-body text-xs font-semibold">{label}</span>
          </Link></Button>)}
        </nav>

        <div className="px-5 sm:px-8">
        {!loading && !error && <section className="mt-3" aria-label="À faire">
          {attention.length === 0 ? <p className="flex items-center gap-2 py-1.5 font-body text-xs font-medium text-muted-foreground"><Check className="h-4 w-4 text-primary" aria-hidden />Tout est à jour</p> :
          <><h2 className="mb-2 font-display text-sm font-extrabold uppercase">À faire</h2><div className="divide-y divide-border/25">{attention.map(request => <Link key={request.id} to={`/entrepreneur/demandes/${request.id}`} aria-label={`${request.title} · ${request.place} · ${request.nextAction}`} className="flex min-h-14 items-center gap-3 py-2 transition-colors duration-150 active:bg-secondary motion-reduce:transition-none"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><div className="min-w-0 flex-1"><p className="break-words font-display text-xs font-bold">Préciser le besoin · {request.title}</p><p className="mt-0.5 break-words font-body text-[11px] text-muted-foreground">{request.place}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2} /></Link>)}</div></>}
        </section>}

        <section className="mt-3">
           <div className="mb-0.5 flex items-center justify-between gap-2"><h2 className="font-display text-sm font-extrabold uppercase">Mes chantiers</h2><Button asChild variant="ghost" className="h-11 gap-1.5 px-0 font-body text-[11px] font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/entrepreneur/chantiers">Tout voir <ArrowRight className="!h-3.5 !w-3.5" /></Link></Button></div>
           {loading ? <LoadingSkeleton lines={3} compact /> : error ? <ErrorState onRetry={refresh} compact /> : recentChantiers.length === 0 ? <EmptyState compact title="Aucun chantier" message="Votre premier chantier apparaîtra ici dès votre demande." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
              <div className="divide-y divide-border/25">
              {recentChantiers.map(chantier => {
                const summary = summarizeChantier(chantier);
                const reference = chantier.submissions[0]?.number;
                const quantity = summary.quantity?.replace(/\btonnes?\b/g, "t");
                const live = summary.tone === "active" || summary.tone === "pending";
                  return <Link key={chantier.key} to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} aria-label={[chantier.label, chantier.city, summary.material, summary.quantity, summary.statusLabel, relativeDate(summary.lastActivity)].filter(Boolean).join(" · ")} className="group flex items-start gap-3 py-3 transition-colors duration-150 active:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none">
                    <span className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/50 text-foreground"><HardHat className="h-5 w-5" strokeWidth={1.9} aria-hidden />{live && <span className="absolute bottom-0 left-3 h-0.5 w-4 bg-primary" aria-hidden />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-display text-[16px] font-bold leading-snug" title={chantier.label}>{chantier.label.split(",")[0]}</p>
                    <p className="mt-1 break-words font-body text-xs leading-relaxed text-muted-foreground">{summary.material}{summary.material && quantity && <span className="px-1.5">·</span>}<span className="tabular-nums">{quantity}</span></p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="ent-site-status uppercase"><StatusBadge label={summary.statusLabel} tone={summary.tone} signature={live} /></span>
                      {reference && <span className="shrink-0 font-body text-[10px] font-normal tabular-nums text-muted-foreground">#{reference}</span>}
                    </div>
                  </div>
                   <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.8} />
                </Link>;
              })}
            </div>
          )}
        </section>

        </div>

      </div>
    </EntrepreneurAppShell>
  );
}
