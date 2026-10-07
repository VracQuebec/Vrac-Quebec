import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, CheckCircle2, CircleAlert, MapPin, Phone, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchPartner, fetchPublicPartner, type PublicPartner } from "@/lib/marketplace/api";
import type { MarketplacePartner } from "@/lib/marketplace/types";

type CompanyVehicle = { id: string; name: string; type: string; active: boolean | null };

export const professionalProfileIsComplete = (partner: MarketplacePartner | null) => Boolean(
  partner
  && (partner.trade_name?.trim() || partner.legal_name?.trim())
  && partner.description?.trim()
  && partner.city?.trim(),
);

/** Lecture seule : aucune fiche ni entreprise n'est créée lors de la consultation. */
export default function CompanyProfileDetails({
  userId,
  fallbackName,
  fallbackLocation,
}: {
  userId: string;
  fallbackName?: string | null;
  fallbackLocation?: string | null;
}) {
  const [partner, setPartner] = useState<MarketplacePartner | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicPartner | null>(null);
  const [vehicles, setVehicles] = useState<CompanyVehicle[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "multiple" | "error">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    void (async () => {
      try {
        const { data, error } = await supabase.from("jsc_company_members")
          .select("company_id").eq("user_id", userId).eq("is_active", true).is("archived_at", null).limit(2);
        if (error) throw error;
        if (!active) return;
        if (!data?.length) { setState("missing"); return; }
        if (data.length > 1) { setState("multiple"); return; }
        const companyId = data[0].company_id;
        const [profile, fleet] = await Promise.all([
          fetchPartner(companyId),
          supabase.from("trucks").select("id,name,type,active").eq("company_id", companyId).is("archived_at", null).order("name"),
        ]);
        if (!active) return;
        if (fleet.error) throw fleet.error;
        setPartner(profile);
        setVehicles((fleet.data ?? []) as CompanyVehicle[]);
        if (profile?.is_public) setPublicProfile(await fetchPublicPartner(companyId));
        if (active) setState(profile ? "ready" : "missing");
      } catch {
        if (active) setState("error");
      }
    })();
    return () => { active = false; };
  }, [userId]);

  const companyName = partner?.trade_name?.trim() || partner?.legal_name?.trim() || fallbackName || "Nom de l’entreprise · À compléter";
  const location = [partner?.city, partner?.region].filter(Boolean).join(" · ") || fallbackLocation || "Localisation · À compléter";
  const complete = professionalProfileIsComplete(partner);
  const services = publicProfile?.services ?? [];
  const territories = publicProfile?.territories ?? [];
  const vehicleTypes = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.type).filter(Boolean))], [vehicles]);

  if (state === "loading") return <p className="py-5 text-xs text-muted-foreground">Chargement de la fiche professionnelle…</p>;
  if (state === "error") return <p role="status" className="py-5 text-xs text-muted-foreground">Fiche professionnelle indisponible pour le moment.</p>;
  if (state === "multiple") return <Button asChild variant="link" className="h-auto min-h-11 whitespace-normal px-0 text-left"><Link to="/entrepreneur/crm">Choisir l’entreprise dans le CRM <ArrowUpRight className="h-4 w-4" /></Link></Button>;

  return (
    <section aria-labelledby="professional-profile-title" className="space-y-6">
      <header className="flex items-start gap-4 border-b border-border pb-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
          {partner?.logo_url ? <img src={partner.logo_url} alt={`Logo de ${companyName}`} className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7 text-muted-foreground" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Profil professionnel</p>
          <h2 id="professional-profile-title" className="mt-1 break-words font-display text-xl font-extrabold">{companyName}</h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{location}</p>
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            {complete ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <CircleAlert className="h-4 w-4" />}
            {complete ? "Profil complet" : "Profil à compléter"}
          </span>
        </div>
      </header>

      {partner ? (
        <>
          <div>
            <h3 className="font-display text-sm font-bold">Description</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{partner.description || "À compléter"}</p>
          </div>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Nom légal</dt><dd className="mt-1 break-words font-medium">{partner.legal_name || "À compléter"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Téléphone professionnel</dt><dd className="mt-1 flex items-center gap-1.5 break-words font-medium"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{partner.phone || "À compléter"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Adresse professionnelle</dt><dd className="mt-1 break-words font-medium">{partner.address || "À compléter"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Ville</dt><dd className="mt-1 break-words font-medium">{partner.city || "À compléter"}</dd></div>
          </dl>
          <div className="grid gap-5 border-y border-border py-5 sm:grid-cols-2">
            <div><h3 className="font-display text-sm font-bold">Services</h3><p className="mt-2 text-sm text-muted-foreground">{services.length ? services.join(" · ") : "Aucun service configuré"}</p></div>
            <div><h3 className="font-display text-sm font-bold">Territoires desservis</h3><p className="mt-2 text-sm text-muted-foreground">{territories.length ? territories.join(" · ") : "À compléter"}</p></div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-display text-sm font-bold"><Truck className="h-4 w-4" />Véhicules de l’entreprise</h3><span className="text-sm font-bold">{vehicles.length}</span></div>
            <p className="mt-2 text-sm text-muted-foreground">{vehicles.length ? vehicleTypes.join(" · ") || `${vehicles.length} véhicule${vehicles.length > 1 ? "s" : ""}` : "Aucun véhicule enregistré"}</p>
            <Button asChild variant="link" className="mt-1 h-auto min-h-11 px-0"><Link to="/entrepreneur/flotte">Voir Ma flotte <ArrowUpRight className="h-4 w-4" /></Link></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-11"><Link to="/partenaire/profil">Compléter la fiche <ArrowUpRight className="h-4 w-4" /></Link></Button>
            {publicProfile && <Button asChild variant="ghost" size="sm" className="min-h-11"><Link to={`/trouver-un-entrepreneur/fiche/${partner.company_id}`}>Voir le profil public <ArrowUpRight className="h-4 w-4" /></Link></Button>}
          </div>
        </>
      ) : (
        <div className="border-y border-border py-5">
          <p className="text-sm text-muted-foreground">Description, logo, services et territoires : À compléter.</p>
          <Button asChild variant="outline" size="sm" className="mt-3 min-h-11"><Link to="/partenaire/profil">Compléter la fiche professionnelle <ArrowUpRight className="h-4 w-4" /></Link></Button>
        </div>
      )}
    </section>
  );
}