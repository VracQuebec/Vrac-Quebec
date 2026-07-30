// Tableau de bord du back office : activité du jour, en-attente et chiffre d'affaires.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Inbox, Calculator, FileText, ClipboardList, Truck, Users,
  DollarSign, Clock, CalendarClock, Wallet,
} from "lucide-react";

type Stats = Record<string, number | string | null>;

const money = (v: unknown) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })
    .format(Number(v ?? 0));

export default function JscDashboard({ companyId }: { companyId?: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("jsc_dashboard_stats", {
      _company_id: companyId ?? undefined,
    });
    if (error) toast.error(error.message);
    setStats((data as unknown as Stats) ?? null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement du tableau de bord…
      </div>
    );
  }
  if (!stats) return <p className="py-10 text-center text-sm text-muted-foreground">Aucune donnée.</p>;

  const today = [
    { label: "Demandes aujourd'hui", value: stats.requests_today, Icon: Inbox },
    { label: "Estimations générées", value: stats.estimates_today, Icon: Calculator },
    { label: "Soumissions envoyées", value: stats.quotes_sent_today, Icon: FileText },
    { label: "Commandes créées", value: stats.orders_today, Icon: ClipboardList },
    { label: "Livraisons prévues", value: stats.deliveries_today, Icon: Truck },
    { label: "Nouveaux clients", value: stats.new_clients_today, Icon: Users },
  ];

  const pending = [
    { label: "Demandes en attente", value: stats.requests_pending, Icon: Clock },
    { label: "Soumissions en attente", value: stats.quotes_pending, Icon: FileText },
    { label: "Commandes à planifier", value: stats.orders_to_plan, Icon: CalendarClock },
    { label: "Clients actifs", value: stats.clients_total, Icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Tableau de bord</h2>
        <p className="text-sm text-muted-foreground">Activité du jour, dossiers en attente et revenus.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Chiffre d'affaires du mois", value: money(stats.revenue_month), Icon: DollarSign },
          { label: "Chiffre d'affaires de l'année", value: money(stats.revenue_year), Icon: DollarSign },
          { label: "Solde à recevoir", value: money(stats.outstanding_balance), Icon: Wallet },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Icon className="h-4 w-4 text-primary" /> {label}
            </div>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Aujourd'hui</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {today.map(({ label, value, Icon }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <span className="rounded-lg bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></span>
              <div>
                <p className="text-2xl font-bold leading-none">{Number(value ?? 0)}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">À traiter</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pending.map(({ label, value, Icon }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <span className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4" /></span>
              <div>
                <p className="text-2xl font-bold leading-none">{Number(value ?? 0)}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
