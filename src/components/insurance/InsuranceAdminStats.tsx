// Super admin : indicateurs de fonctionnement seulement, sans contenu confidentiel.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function InsuranceAdminStats() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { (supabase as any).rpc("asr_admin_stats").then(({ data }: any) => setS(data)); }, []);
  if (!s) return null;
  const last = s.dernier_passage;
  return (
    <section className="rounded-lg border border-border bg-card p-3 text-sm">
      <h2 className="font-semibold">Assurances entreprise — fonctionnement</h2>
      <p className="text-xs text-muted-foreground">Indicateurs seulement. Pour consulter le contenu d’une entreprise, ouvrez Assurances entreprise : une raison est demandée et l’accès est journalisé.</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[["Entreprises", s.entreprises], ["Polices", s.polices], ["Renouvellements ouverts", s.renouvellements_ouverts], ["Rappels (7 j)", s.rappels_7j], ["Erreurs (7 j)", s.erreurs_7j]].map(([l, v]) => (
          <div key={l}><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold">{v}</p></div>))}
      </div>
      <p className="mt-2 text-xs">Dernier passage automatique : {last ? new Date(last.started_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" }) : "pas encore"} · Canaux : application opérationnelle, courriel désactivé pendant les essais, texto et push non raccordés.</p>
    </section>
  );
}
