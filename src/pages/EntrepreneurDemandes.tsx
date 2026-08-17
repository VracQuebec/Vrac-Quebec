import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import EntrepreneurShell from "@/components/EntrepreneurShell";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Loader2, Sparkles, ArrowRight, MapPin } from "lucide-react";
import { statusMeta } from "@/lib/access-requests/status";
import MesDemandesList from "@/components/entrepreneur/MesDemandesList";
import { formatCad } from "@/lib/transport/pricing";

interface Req {
  id: string;
  request_number: string | null;
  status: string;
  material_type: string;
  site_city: string | null;
  site_address: string;
  estimated_trips: number | null;
  truck_type: string | null;
  truck_rate_per_trip: number | null;
  transport_subtotal: number | null;
  transport_total: number | null;
  created_at: string;
  desired_date: string | null;
}


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
        .select("id, request_number, status, material_type, site_city, site_address, estimated_trips, truck_type, truck_rate_per_trip, transport_subtotal, transport_total, created_at, desired_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setRequests((data as any) || []);
      setLoading(false);
    })();
  }, [user]);

  const grouped: Record<string, Req[]> = { pending: [], accepted: [], completed: [], refused: [] };
  requests.forEach((r) => {
    const b = statusMeta(r.status).bucket;
    grouped[b].push(r);
  });

  return (
    <EntrepreneurShell title="Mes demandes" description="Vos demandes enregistrées et le suivi de vos demandes d'accès aux dompes.">
      <section className="mb-10">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Mes demandes
        </h2>
        <MesDemandesList />
      </section>

      <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Mes demandes d'accès aux dompes
      </h2>
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
                    const meta = statusMeta(r.status);
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
                        {r.transport_subtotal != null && (
                          <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs font-body">
                            <p className="font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              Transport
                            </p>
                            <p>{r.truck_type || "Camion"} • {r.estimated_trips ?? "—"} voyage{(r.estimated_trips ?? 0) > 1 ? "s" : ""}
                              {r.truck_rate_per_trip != null ? ` • ${formatCad(Number(r.truck_rate_per_trip))} / voyage` : ""}
                            </p>
                            <p>Avant taxes : <b className="tabular-nums">{formatCad(Number(r.transport_subtotal))}</b></p>
                            {r.transport_total != null && (
                              <p>Taxes incluses : <b className="tabular-nums">{formatCad(Number(r.transport_total))}</b></p>
                            )}
                          </div>
                        )}
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