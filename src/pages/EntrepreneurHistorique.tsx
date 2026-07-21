import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import EntrepreneurShell from "@/components/EntrepreneurShell";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Loader2, MapPin } from "lucide-react";

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
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("transport_requests")
        .select("id, request_number, status, material_type, site_city, site_address, created_at")
        .eq("user_id", user.id)
        .in("status", ["terminee", "annulee"])
        .order("created_at", { ascending: false });
      setRequests((data as any) || []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <EntrepreneurShell title="Historique" description="Toutes vos demandes terminées ou annulées.">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-muted-foreground font-body">Aucune demande dans votre historique pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="p-4 rounded-lg border border-border bg-card flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-display font-bold text-sm">{r.request_number || `#${r.id.slice(0, 8)}`}</span>
                  <span className="text-[10px] uppercase font-display font-bold px-2 py-0.5 rounded-full text-white" style={{ background: r.status === "terminee" ? "#3b82f6" : "#ef4444" }}>
                    {r.status === "terminee" ? "Terminée" : "Annulée"}
                  </span>
                </div>
                <p className="text-sm truncate">{r.material_type}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 font-body truncate">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{r.site_city ? `${r.site_city} — ` : ""}{r.site_address}</span>
                </p>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0 font-body">
                {new Date(r.created_at).toLocaleDateString("fr-CA")}
              </span>
            </div>
          ))}
        </div>
      )}
    </EntrepreneurShell>
  );
};

export default EntrepreneurHistorique;