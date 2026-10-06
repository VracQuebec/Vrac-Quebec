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

  return (
    <EntrepreneurAppShell title="Accueil" backTo={null}>
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 lg:py-6">
        <header className="mb-5">
          <h1 className="break-words font-body text-sm font-medium leading-snug"><span className="font-normal text-muted-foreground">Bonjour, </span>{company}</h1>
          <Button asChild className="mt-5 h-12 w-fit max-w-full gap-3 rounded-lg py-1.5 pl-1.5 pr-4 font-body text-sm font-semibold shadow-none transition-transform duration-150 active:scale-[0.97] motion-reduce:transform-none"><Link to="/demande-transport"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground text-primary"><Plus className="!h-5 !w-5" strokeWidth={1.8} /></span>Nouvelle demande</Link></Button>
        </header>

        <section aria-label="Accès rapides" className="grid grid-cols-2 gap-2">
          {[
            { label: "Dompes", icon: MapIcon, to: "/entrepreneur/carte" },
            { label: "Transport", icon: Truck, to: "/entrepreneur/transports" },
            { label: "Demandes", icon: ClipboardList, to: "/entrepreneur/demandes" },
            { label: "Matériaux", icon: Layers, to: "/acheter-materiaux" },
          ].map(({ label, icon: Icon, to }) => <Button key={label} asChild variant="ghost" className="h-14 min-w-0 justify-start gap-3 rounded-lg bg-secondary/40 px-3 font-body text-xs font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-secondary/65 active:scale-[0.97] active:bg-secondary motion-reduce:transform-none motion-reduce:transition-none"><Link to={to}><Icon className="!h-5 !w-5 shrink-0" strokeWidth={1.6} /><span>{label}</span><ArrowRight className="!h-3 !w-3 ml-auto shrink-0 text-muted-foreground/60" strokeWidth={1.6} /></Link></Button>)}
        </section>

        <section className="mt-6">
           <div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-display text-base font-semibold">Mes chantiers</h2><Button asChild variant="ghost" className="min-h-11 gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/entrepreneur/chantiers">Tout voir <ArrowRight className="!h-3.5 !w-3.5" /></Link></Button></div>
           {loading ? <LoadingSkeleton lines={3} compact /> : error ? <ErrorState onRetry={refresh} compact /> : recentChantiers.length === 0 ? <EmptyState compact title="Aucun chantier" message="Votre premier chantier apparaîtra ici dès votre demande." actionLabel="Nouvelle demande" actionTo="/demande-transport" /> : (
            <div className="space-y-1">
              {recentChantiers.map(chantier => {
                const summary = summarizeChantier(chantier);
                const reference = chantier.submissions[0]?.number;
                const quantity = summary.quantity?.replace(/\btonnes?\b/g, "t");
                const measuredQuantity = quantity && /^\d/.test(quantity) ? quantity : null;
                return <Link key={chantier.key} to={`/entrepreneur/chantiers/${encodeURIComponent(chantier.key)}`} aria-label={[chantier.label, chantier.city, summary.material, summary.quantity, summary.statusLabel, relativeDate(summary.lastActivity)].filter(Boolean).join(" · ")} className="group flex items-start gap-3 rounded-lg py-4 transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none">
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
