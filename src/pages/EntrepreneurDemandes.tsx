import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import EntrepreneurShell from "@/components/EntrepreneurShell";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Loader2, Sparkles, ArrowRight, MapPin } from "lucide-react";

interface Req {
  id: string;
  request_number: string | null;
  status: string;
  material_type: string;
  site_city: string | null;
  site_address: string;
  estimated_trips: number | null;
  created_at: string;
  desired_date: string | null;
}

const STATUS_META: Record<string, { label: string; color: string; bucket: "pending" | "accepted" | "completed" | "refused" }> = {
  nouvelle: { label: "Nouvelle", color: "#f59e0b", bucket: "pending" },
  a_rappeler: { label: "À rappeler", color: "#f59e0b", bucket: "pending" },
  en_analyse: { label: "En analyse", color: "#f59e0b", bucket: "pending" },
  soumission_envoyee: { label: "Soumission envoyée", color: "#f59e0b", bucket: "pending" },
  acceptee: { label: "Acceptée", color: "#10b981", bucket: "accepted" },
  planifiee: { label: "Planifiée", color: "#10b981", bucket: "accepted" },
  en_cours: { label: "En cours", color: "#10b981", bucket: "accepted" },
  terminee: { label: "Terminée", color: "#3b82f6", bucket: "completed" },
  annulee: { label: "Refusée / Annulée", color: "#ef4444", bucket: "refused" },
};

const BUCKETS: { key: "pending" | "accepted" | "completed" | "refused"; label: string }[] = [
  { key: "pending", label: "En attente" },
  { key: "accepted", label: "Acceptées" },
  { key: "completed", label: "Terminées" },
  { key: "refused", label: "Refusées" },
];

const EntrepreneurDemandes = () => {
  const { user } = useAuthReady();
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("transport_requests")
        .select("id, request_number, status, material_type, site_city, site_address, estimated_trips, created_at, desired_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setRequests((data as any) || []);
      setLoading(false);
    })();
  }, [user]);

  const grouped: Record<string, Req[]> = { pending: [], accepted: [], completed: [], refused: [] };
  requests.forEach((r) => {
    const b = STATUS_META[r.status]?.bucket || "pending";
    grouped[b].push(r);
  });

  return (
    <EntrepreneurShell title="Mes demandes d'accès" description="Historique et suivi de vos demandes d'accès aux dompes.">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-muted-foreground mb-4 font-body">Vous n'avez pas encore de demande d'accès.</p>
          <Link
            to="/demande-transport"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-display font-bold px-5 py-3 rounded-xl hover:opacity-90"
          >
            <Sparkles className="w-4 h-4" /> Lancer l'assistant intelligent
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {BUCKETS.map((b) => (
            <section key={b.key}>
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-muted-foreground mb-3">
                {b.label} ({grouped[b.key].length})
              </h2>
              {grouped[b.key].length === 0 ? (
                <p className="text-xs text-muted-foreground italic font-body">Aucune demande d'accès.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {grouped[b.key].map((r) => {
                    const meta = STATUS_META[r.status];
                    return (
                      <div key={r.id} className="p-4 rounded-lg border border-border bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-display font-bold text-sm">
                            {r.request_number || `#${r.id.slice(0, 8)}`}
                          </span>
                          {meta && (
                            <span
                              className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full text-white uppercase tracking-wide"
                              style={{ background: meta.color }}
                            >
                              {meta.label}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-display font-semibold mb-1">{r.material_type}</p>
                        <p className="text-xs text-muted-foreground flex items-start gap-1 mb-1 font-body">
                          <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{r.site_city ? `${r.site_city} — ` : ""}{r.site_address}</span>
                        </p>
                        <p className="text-xs text-muted-foreground font-body">
                          {r.estimated_trips ? `${r.estimated_trips} voyages estimés` : ""}
                          {r.desired_date ? ` • Date : ${new Date(r.desired_date).toLocaleDateString("fr-CA")}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
          <div className="pt-4">
            <Link
              to="/demande-transport"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-display font-bold px-5 py-3 rounded-xl hover:opacity-90"
            >
              <Sparkles className="w-4 h-4" /> Nouvelle demande d'accès <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </EntrepreneurShell>
  );
};

export default EntrepreneurDemandes;