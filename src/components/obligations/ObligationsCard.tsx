import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { oblStatus, torontoToday } from "@/lib/obligations/status";

// Carte du tableau de bord : lit les obligations ouvertes visibles (RLS).
export default function ObligationsCard() {
  const [c, setC] = useState<{ conf: number; soon: number; late: number } | null>(null);
  useEffect(() => {
    (supabase as any).from("obl_items").select("status,applicability,due_date,due_source,due_confirmed").eq("status", "ouvert").neq("applicability", "non_applicable").limit(500)
      .then(({ data }: any) => {
        const t = torontoToday(); const s = (data ?? []).map((i: any) => oblStatus(i, t));
        setC({ conf: s.filter((x: string) => x === "a_confirmer").length, soon: s.filter((x: string) => x === "proche").length, late: s.filter((x: string) => x === "depassee").length });
      });
  }, []);
  if (!c) return null;
  return (
    <Link to="/entrepreneur/obligations" className="block rounded-md border border-border p-4 hover:bg-muted/50">
      <p className="font-display text-sm font-bold">Obligations à venir</p>
      <p className="mt-1 font-body text-xs">
        <span className="text-muted-foreground">{c.conf} à confirmer</span> · <span className="text-orange-700 dark:text-orange-300">{c.soon} à faire prochainement</span> · <span className="text-destructive">{c.late} en retard</span>
      </p>
    </Link>
  );
}
