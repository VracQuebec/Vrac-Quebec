// Historique — demandes terminées, annulées ou refusées.
// Lecture seule sur les données existantes : aucune suppression.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { statusMeta } from "@/lib/access-requests/status";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { EmptyState, LoadingSkeleton } from "@/components/entrepreneur-app/AppStates";
import { useAuthReady } from "@/hooks/useAuthReady";
import { MapPin, Package } from "lucide-react";

interface Req {
  id: string;
  request_number: string | null;
  status: string;
  material_type: string;
  site_city: string | null;
  site_address: string;
  created_at: string;
}

const EntrepreneurHistorique = () => {
  const { user } = useAuthReady();
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("transport_requests")
        .select("id, request_number, status, material_type, site_city, site_address, created_at")
        .eq("user_id", user.id)
        .in("status", ["terminee", "annulee", "refusee"])
        .order("created_at", { ascending: false });
      if (!active) return;
      setRequests((data as Req[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  return (
    <EntrepreneurAppShell title="Historique" subtitle="Dossiers clos" backTo="/entrepreneur">
      <div className="mx-auto w-full min-w-0 max-w-2xl px-4 py-5 sm:px-6">
        {loading ? (
          <LoadingSkeleton lines={3} />
        ) : requests.length === 0 ? (
          <EmptyState
            title="Rien dans l'historique"
            message="Vos dossiers terminés ou annulés apparaîtront ici automatiquement."
            actionLabel="Voir mes demandes en cours"
            actionTo="/entrepreneur/demandes"
          />
        ) : (
          <div className="space-y-2.5">
            {requests.map((r) => {
              const meta = statusMeta(r.status);
              return (
                <article key={r.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-display text-sm font-bold">
                      {r.request_number || `#${r.id.slice(0, 8)}`}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 font-display text-[10px] font-bold uppercase text-white"
                      style={{ background: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 font-body text-sm text-foreground">
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{r.material_type}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {r.site_city ? `${r.site_city} — ` : ""}{r.site_address}
                    </span>
                  </p>
                  <p className="mt-2 font-body text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("fr-CA", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
};

export default EntrepreneurHistorique;
