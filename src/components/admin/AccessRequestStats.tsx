import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface TopItem { name: string; n: number }
interface Stats {
  today: number; week: number; month: number; total: number;
  accepted: number; refused: number; cancelled: number; done: number; pending: number;
  avg_response_hours: number | null;
  top_cities: TopItem[]; top_materials: TopItem[]; top_dumps: TopItem[];
  active_entrepreneurs: number;
}

/**
 * Tableau de bord des demandes d'accès aux dompes.
 * Les chiffres proviennent d'une seule source de vérité : la table des
 * demandes, agrégée côté base pour éviter tout calcul parallèle.
 */
const AccessRequestStats = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.rpc("access_requests_stats" as any);
      if (active) { setStats((data as any) || null); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des statistiques…
      </div>
    );
  }
  if (!stats) return null;

  const cards: Array<{ label: string; value: string | number }> = [
    { label: "Aujourd'hui", value: stats.today },
    { label: "Cette semaine", value: stats.week },
    { label: "Ce mois", value: stats.month },
    { label: "En attente", value: stats.pending },
    { label: "Acceptées", value: stats.accepted },
    { label: "Refusées", value: stats.refused },
    { label: "Terminées", value: stats.done },
    { label: "Délai moyen", value: stats.avg_response_hours != null ? `${stats.avg_response_hours} h` : "—" },
    { label: "Entrepreneurs actifs (30 j)", value: stats.active_entrepreneurs },
  ];

  return (
    <section className="mb-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="text-lg font-display font-bold leading-tight">{c.value}</div>
            <div className="text-[11px] text-muted-foreground font-body">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <TopList title="Villes les plus demandées" items={stats.top_cities} />
        <TopList title="Matériaux les plus fréquents" items={stats.top_materials} />
        <TopList title="Dompes les plus sollicitées" items={stats.top_dumps} />
      </div>
    </section>
  );
};

const TopList = ({ title, items }: { title: string; items: TopItem[] }) => (
  <div className="rounded-xl border border-border bg-card px-3 py-2.5">
    <h3 className="text-[11px] font-display font-bold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</h3>
    {(!items || items.length === 0) ? (
      <p className="text-xs text-muted-foreground font-body">Aucune donnée.</p>
    ) : (
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.name} className="flex items-center justify-between text-xs font-body">
            <span className="truncate pr-2">{i.name}</span>
            <span className="text-muted-foreground shrink-0">{i.n}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default AccessRequestStats;
