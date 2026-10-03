// Lot 5 — vue équipe des missions chauffeurs, arrivées/départs et arrêts horodatés.
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { detectStops, type Point } from "@/lib/ops/stops";
import type { Database } from "@/integrations/supabase/types";

type M = Database["public"]["Tables"]["drv_missions"]["Row"];
const hm = (s: string) => new Date(s).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AdminMissions() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rl } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<M[]>([]);
  const [pts, setPts] = useState<Record<string, Point[]>>({});
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("drv_missions").select("*").order("started_at", { ascending: false }).limit(200);
    setRows(data ?? []);
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);
  const toggle = async (id: string) => {
    setOpen(open === id ? null : id);
    if (!pts[id]) {
      const { data } = await supabase.from("drv_points").select("lat,lng,recorded_at").eq("mission_id", id).order("recorded_at");
      setPts((p) => ({ ...p, [id]: data ?? [] }));
    }
  };

  if (!isReady || rl) return <p className="p-8"><Loader2 className="inline h-4 w-4 animate-spin" /></p>;
  if (!isAdmin) return <p className="p-8 text-muted-foreground">Accès réservé à l'équipe Vrac Québec.</p>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Missions des chauffeurs" subtitle="Positions recueillies seulement pendant les missions activées par le chauffeur. Un arrêt est un indice à confirmer." />
      <main className="mx-auto max-w-5xl space-y-2 px-4 py-5">
        {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucune mission.</p>}
        {rows.map((m) => {
          const p = pts[m.id] ?? [];
          const stops = detectStops(p);
          return (
            <Card key={m.id} className="cursor-pointer" onClick={() => void toggle(m.id)}>
              <CardContent className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">{m.driver_label ?? "Chauffeur"} · {m.truck_label ?? "camion non précisé"}</p>
                  <Badge variant={m.ended_at ? "secondary" : "default"}>{m.ended_at ? "Terminée" : "En cours"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Départ {hm(m.started_at)}{m.ended_at ? ` · fin ${hm(m.ended_at)}` : ""} · suivi accepté {hm(m.consent_at)}</p>
                {open === m.id && (
                  <div className="mt-2 border-t pt-2 text-xs">
                    <p>{p.length} position(s){p.length ? ` · première ${hm(p[0].recorded_at)} · dernière ${hm(p[p.length - 1].recorded_at)}` : ""}</p>
                    {stops.length === 0 ? <p className="text-muted-foreground">Aucun arrêt de 5 min ou plus.</p> : stops.map((s, i) => (
                      <p key={i}>Arrêt : arrivée {hm(s.arrived_at)} · départ {hm(s.left_at)} · {s.minutes} min ·{" "}
                        <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} onClick={(e) => e.stopPropagation()}>carte</a></p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
