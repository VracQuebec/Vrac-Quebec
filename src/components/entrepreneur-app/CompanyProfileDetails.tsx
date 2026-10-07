import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchPartner, fetchPublicPartner, type PublicPartner } from "@/lib/marketplace/api";
import type { MarketplacePartner } from "@/lib/marketplace/types";

/** Read-only supplement: never ensure/create a company or partner on page load. */
export default function CompanyProfileDetails({ userId }: { userId: string }) {
  const [partner, setPartner] = useState<MarketplacePartner | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicPartner | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "multiple" | "error">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    setPartner(null);
    setPublicProfile(null);
    void (async () => {
      try {
        const { data, error } = await supabase.from("jsc_company_members")
          .select("company_id").eq("user_id", userId).eq("is_active", true).is("archived_at", null).limit(2);
        if (error) throw error;
        if (!active) return;
        if (!data?.length) { setState("missing"); return; }
        if (data.length > 1) { setState("multiple"); return; }
        const companyId = data[0].company_id;
        const p = await fetchPartner(companyId);
        if (!active) return;
        setPartner(p);
        if (!p) { setState("missing"); return; }
        if (p.is_public) {
          const pub = await fetchPublicPartner(companyId);
          if (!active) return;
          setPublicProfile(pub);
        }
        setState("ready");
      } catch { if (active) setState("error"); }
    })();
    return () => { active = false; };
  }, [userId]);

  if (state === "loading") return <p className="text-xs text-muted-foreground">Chargement de la fiche professionnelle…</p>;
  if (state === "error") return <p role="status" className="text-xs text-muted-foreground">Fiche professionnelle indisponible pour le moment.</p>;
  if (state === "multiple") return <Button asChild variant="link" className="h-auto whitespace-normal px-0 text-left"><Link to="/entrepreneur/crm">Choisir l’entreprise dans le CRM <ArrowUpRight className="h-4 w-4" /></Link></Button>;
  if (!partner) return <p className="text-xs text-muted-foreground">Logo, services et secteurs desservis : À compléter — aucune fiche partenaire liée.</p>;

  return <section aria-label="Fiche professionnelle" className="space-y-4 border-t border-border/30 pt-4">
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary">
        {partner.logo_url ? <img src={partner.logo_url} alt="Logo de l’entreprise" className="h-full w-full object-contain" /> : <Building2 className="h-5 w-5 text-muted-foreground" />}
      </div>
      <div className="min-w-0"><p className="break-words font-display font-semibold">{partner.trade_name || partner.legal_name || "À compléter"}</p><p className="text-xs text-muted-foreground">Fiche professionnelle</p></div>
    </div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {[
        ["Logo", partner.logo_url ? "Renseigné" : null],
        ["Téléphone professionnel", partner.phone],
        ["Adresse professionnelle", partner.address],
        ["Ville", partner.city],
        ["Nom légal", partner.legal_name],
        ["NEQ", partner.neq],
        ["Description", partner.description],
        ["Services publics", publicProfile?.services.join(" · ")],
        ["Secteurs publics desservis", publicProfile?.territories.join(" · ")],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value || "À compléter"}</dd></div>)}
    </dl>
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm" className="min-h-11"><Link to="/partenaire/profil">Compléter la fiche professionnelle <ArrowUpRight className="h-4 w-4" /></Link></Button>
      {publicProfile && <Button asChild variant="ghost" size="sm" className="min-h-11"><Link to={`/trouver-un-entrepreneur/fiche/${partner.company_id}`}>Voir la fiche publique <ArrowUpRight className="h-4 w-4" /></Link></Button>}
    </div>
  </section>;
}