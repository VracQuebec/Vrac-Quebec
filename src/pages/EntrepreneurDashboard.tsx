import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, ClipboardList, Layers, Map as MapIcon, Plus, Truck } from "lucide-react";
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
    openRequests > 0 && { value: openRequests, label: openRequests > 1 ? "demandes en cours" : "demande en cours", to: "/entrepreneur/demandes" },
    attention.length > 0 && { value: attention.length, label: attention.length > 1 ? "actions requises" : "action requise", to: "/entrepreneur/demandes", accent: true },
  ].filter(Boolean) as { value: number; label: string; to: string; accent?: boolean }[];
  const todayLabel = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });

  return (
    <EntrepreneurAppShell title="Accueil" backTo={null}>
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 lg:py-6">
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{todayLabel}</p>
            <h1 className="mt-1 break-words font-display text-xl font-semibold leading-tight tracking-tight">Bonjour, {company}</h1>
          </div>
          <Button asChild className="h-11 shrink-0 gap-2 rounded-full pl-1.5 pr-4 font-body text-sm font-semibold shadow-none transition-transform duration-150 active:scale-[0.96] motion-reduce:transform-none"><Link to="/demande-transport" aria-label="Nouvelle demande"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-primary"><Plus className="!h-4 !w-4" strokeWidth={2.2} /></span>Demande</Link></Button>
        </header>

        {!loading && !error && <section aria-label="État du jour" className="mt-5 border-y border-border/40 py-3">
          {dayStats.length === 0 ? <p className="flex items-center gap-2 font-body text-xs text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Tout est à jour · aucune action requise</p> : (
            <div className="grid divide-x divide-border/40" style={{ gridTemplateColumns: `repeat(${dayStats.length}, minmax(0, 1fr))` }}>
              {dayStats.map(stat => <Link key={stat.label} to={stat.to} className="min-w-0 px-3 first:pl-0 transition-opacity duration-150 active:opacity-60">
                <p className={`font-display text-2xl font-semibold leading-none tabular-nums ${stat.accent ? "text-foreground" : ""}`}>{stat.value}{stat.accent && <span className="ml-1 inline-block h-1.5 w-1.5 -translate-y-3 rounded-full bg-attention" />}</p>
                <p className="mt-1.5 truncate font-body text-[11px] text-muted-foreground">{stat.label}</p>
              </Link>)}
            </div>
          )}
        </section>}

        <nav aria-label="Accès rapides" className="mt-6 grid grid-cols-4 gap-2">
          {[
            { label: "Dompes", icon: MapIcon, to: "/entrepreneur/carte" },
            { label: "Transport", icon: Truck, to: "/entrepreneur/transports" },
            { label: "Demandes", icon: ClipboardList, to: "/entrepreneur/demandes" },
            { label: "Matériaux", icon: Layers, to: "/acheter-materiaux" },
          ].map(({ label, icon: Icon, to }) => <Link key={label} to={to} className="group flex min-w-0 flex-col items-center gap-2 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-primary transition-transform duration-150 group-active:scale-[0.92] motion-reduce:transform-none"><Icon className="h-6 w-6" strokeWidth={1.7} /></span>
            <span className="truncate font-body text-[11px] font-medium">{label}</span>
          </Link>)}
        </nav>

        <section className="mt-8">
           <div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mes chantiers</h2><Button asChild variant="ghost" className="min-h-11 gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/entrepreneur/chantiers">Tout voir <ArrowRight className="!h-3.5 !w-3.5" /></Link></Button></div>
           {loading ? <LoadingSkeleton lines={3} compact /> : error ? <ErrorState onRetry={refresh} compact /> : recentChantiers.length === 0 ? <EmptyState compact title="Aucun chantier" message="Votre premier chantier apparaîtra ici dès votre demande." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
            <div className="divide-y divide-border/35">
              {recentChantiers.map(chantier => {
                const summary = summarizeChantier(chantier);
                const reference = chantier.submissions[0]?.number;
                const quantity = summary.quantity?.replace(/\btonnes?\b/g, "t");
                const measuredQuantity = quantity && /^\d/.test(quantity) ? quantity : null;
                return <Link key={chantier.key} to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} aria-label={[chantier.label, chantier.city, summary.material, summary.quantity, summary.statusLabel, relativeDate(summary.lastActivity)].filter(Boolean).join(" · ")} className="group relative flex items-start gap-3 py-3.5 pl-3 transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none">
                  <span aria-hidden className={`absolute left-0 top-4 h-8 w-[3px] rounded-full ${summary.tone === "active" || summary.tone === "pending" ? "bg-primary" : "bg-border"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-display text-sm font-semibold leading-snug" title={chantier.label}>{chantier.label.split(",")[0]}</p>
                    {(summary.material || quantity) && <p className="mt-1 font-body text-xs text-muted-foreground">{[summary.material, !measuredQuantity ? quantity : null].filter(Boolean).join(" · ")}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><StatusBadge label={summary.statusLabel} tone={summary.tone} signature={summary.tone === "active" || summary.tone === "pending"} /><span className="font-body text-[11px] tabular-nums text-muted-foreground" title={relativeDate(summary.lastActivity)}>{reference ? `#${reference}` : relativeDate(summary.lastActivity)}</span></div>
                  </div>
                  <div className="flex max-w-24 shrink-0 flex-col items-end gap-2">
                    {measuredQuantity && <span className="break-words text-right font-display text-lg font-semibold leading-snug tabular-nums">{measuredQuantity}</span>}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.6} />
                  </div>
                </Link>;
              })}
            </div>
          )}
        </section>

        {!loading && !error && attention.length > 0 && <section className="mt-4">
          <h2 className="font-body text-xs font-medium text-muted-foreground">À faire</h2>
          <div className="divide-y divide-border/25">{attention.map(request => <Link key={request.id} to={`/entrepreneur/demandes/${request.id}`} aria-label={`${request.title} · ${request.place} · ${request.nextAction}`} className="flex min-h-14 items-center gap-3 py-2 transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 motion-reduce:transition-none"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary/45"><ClipboardList className="h-[18px] w-[18px] text-primary" strokeWidth={1.6} /></span><div className="min-w-0 flex-1"><p className="break-words font-display text-sm font-semibold">{request.title}</p><p className="mt-0.5 break-words font-body text-[11px] text-muted-foreground">{request.place} · Besoin à préciser</p></div><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} /></Link>)}</div>
        </section>}

      </div>
    </EntrepreneurAppShell>
  );
}
