import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type Trip = Database["public"]["Tables"]["cpn_trips"]["Row"];
export default function AdminVoyages() {
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void supabase.from("cpn_trips").select("*").order("created_at", { ascending: false }).limit(200).then(({ data, error: err }) => {
      if (active) { setRows(data ?? []); setError(Boolean(err)); setLoading(false); }
    });
    return () => { active = false; };
  }, [isAdmin]);
  if (!isReady || roleLoading) return <p className="p-8 text-muted-foreground">Chargement…</p>;
  if (!isAdmin) return <p className="p-8 text-muted-foreground">Accès réservé à l’équipe Vrac Québec.</p>;
  const grouped = Object.values(rows.reduce<Record<string, { id: string; label: string; last: string }>>((all, row) => {
    const item = all[row.submission_id] ?? { id: row.submission_id, label: row.entrepreneur_label || "Entrepreneur non précisé", last: row.trip_date };
    all[row.submission_id] = item;
    return all;
  }, {}));
  return <div className="min-h-screen bg-background">
    <PageHeader title="Compteur de voyages" backTo="/admin/volets" />
    <main className="mx-auto max-w-4xl space-y-2 px-4 py-6">
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : error ? <p role="alert" className="text-sm text-destructive">Voyages indisponibles pour le moment.</p> : grouped.length === 0 ? <p className="text-sm text-muted-foreground">Aucun voyage enregistré.</p> : grouped.map((group) => <div key={group.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm">
        <div><p className="font-semibold">Demande {group.id.slice(0, 8).toUpperCase()}</p><p className="text-muted-foreground">{group.label} · dernière saisie {group.last}</p></div>
        <Button asChild variant="outline" size="sm"><Link to={`/compteur/${group.id}`}>Voir les décomptes</Link></Button>
      </div>)}
    </main>
  </div>;
}