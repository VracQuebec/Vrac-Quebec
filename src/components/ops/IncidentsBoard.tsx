// Incidents : suivi, résolution et impact opérationnel.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { INCIDENT_TYPES, INCIDENT_SEVERITIES } from "@/lib/jsc/operations";
import { toast } from "sonner";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Incident {
  id: string;
  incident_type: string;
  severity: string;
  status: string;
  description: string | null;
  resolution: string | null;
  delivery_id: string | null;
  created_at: string;
}

export default function IncidentsBoard({ companyId }: { companyId?: string | null }) {
  const [rows, setRows] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase.from("jsc_incidents" as never) as any)
      .select("*").is("archived_at", null).order("created_at", { ascending: false }).limit(300);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as Incident[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("jsc_incidents" as never) as any)
      .update({ status: "resolu", resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Incident résolu"); load(); }
  };

  const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>;

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun incident enregistré. Les opérations se déroulent normalement.
        </div>
      )}
      {rows.map((i) => (
        <div key={i.id} className="rounded-xl border border-border bg-card p-3 flex items-start gap-3">
          <AlertTriangle className={`w-4 h-4 mt-0.5 ${i.status === "resolu" ? "text-muted-foreground" : "text-destructive"}`} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-display font-bold">
              {label(INCIDENT_TYPES, i.incident_type)} · {label(INCIDENT_SEVERITIES, i.severity)}
            </div>
            <div className="text-xs text-muted-foreground">{i.description}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {new Date(i.created_at).toLocaleString("fr-CA")} · Statut : {i.status}
            </div>
          </div>
          {i.status !== "resolu" && (
            <Button size="sm" variant="outline" onClick={() => resolve(i.id)}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Résoudre
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}