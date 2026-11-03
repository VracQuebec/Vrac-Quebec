import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Gap = {
  origin_table: string; origin_record_id: string; reference: string | null; contact: string | null;
  email: string | null; created_at: string; reason: string; error: string | null; attempts: number; is_test: boolean;
};

const LABEL: Record<string, string> = {
  transport_requests: "Accès dompe / transport",
  mkt_quote_requests: "Services",
  jsc_requests: "Soumission matériaux",
};

/**
 * Dossiers opérationnels sans demande dans le CRM habituel (échec de transfert
 * ou ancien dossier non rattaché). Visible seulement s'il y a un écart; la
 * reprise est idempotente côté serveur (jamais de doublon).
 */
export default function CrmIntakeGaps({ onResolved }: { onResolved?: () => void }) {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("crm_intake_gaps" as never);
    if (!error) setGaps((data as unknown as Gap[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const retry = async (g: Gap) => {
    setBusy(g.origin_record_id);
    const { data, error } = await supabase.rpc("crm_intake_retry" as never, { p_table: g.origin_table, p_id: g.origin_record_id } as never);
    setBusy(null);
    if (error || !data) {
      toast({ title: "Reprise impossible", description: "L'écart reste signalé; réessayez plus tard.", variant: "destructive" });
    } else {
      toast({ title: "Demande ajoutée au CRM", description: g.reference ?? undefined });
      onResolved?.();
    }
    await load();
  };

  const real = gaps.filter((g) => !g.is_test);
  if (!gaps.length) return null;
  return (
    <div className={`mb-4 rounded-xl border p-3 text-sm ${real.length ? "border-destructive/40 bg-destructive/5" : "border-border bg-secondary/30"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left font-display font-bold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {real.length
            ? `${real.length} dossier${real.length > 1 ? "s" : ""} reçu${real.length > 1 ? "s" : ""} absent${real.length > 1 ? "s" : ""} de cette liste`
            : `${gaps.length} dossier${gaps.length > 1 ? "s" : ""} d'essai non rattaché${gaps.length > 1 ? "s" : ""}`}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Masquer" : "Voir"}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {gaps.map((g) => (
            <li key={g.origin_table + g.origin_record_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{g.reference ?? "Sans numéro"} · {LABEL[g.origin_table] ?? g.origin_table}{g.is_test ? " · Essai" : ""}</div>
                <div className="text-xs text-muted-foreground break-words">
                  {[g.contact, g.email, new Date(g.created_at).toLocaleString("fr-CA")].filter(Boolean).join(" · ")}
                  {g.reason === "transfert_echoue" ? ` · Transfert échoué (${g.attempts} essai${g.attempts > 1 ? "s" : ""})${g.error ? ` : ${g.error}` : ""}` : " · Non rattaché"}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={busy === g.origin_record_id} onClick={() => retry(g)}>
                <RotateCcw className="h-3.5 w-3.5" /> Ajouter au CRM
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
