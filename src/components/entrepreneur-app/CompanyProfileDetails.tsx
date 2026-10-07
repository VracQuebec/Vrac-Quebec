import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, CheckCircle2, CircleAlert, MapPin, Phone, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchPartner, fetchPublicPartner, type PublicPartner } from "@/lib/marketplace/api";
import type { MarketplacePartner } from "@/lib/marketplace/types";

type CompanyVehicle = { id: string; name: string; type: string; active: boolean | null };
type CompanyIdentity = { name: string | null; legal_name: string | null; logo_url: string | null; phone: string | null; address: string | null };

export const isProfessionalCompanyName = (value: string | null | undefined) => Boolean(
  value?.trim() && !value.includes("@") && !/^entreprise de\s+/i.test(value.trim()),
);

export const professionalProfileIsComplete = (partner: MarketplacePartner | null) => Boolean(
  partner
  && (partner.trade_name?.trim() || partner.legal_name?.trim())
  && partner.description?.trim()
  && partner.city?.trim(),
);

/** Éléments publics manquants, dérivés uniquement des champs existants (aucune erreur affichée). */
export const missingProfileItems = (
  partner: Pick<MarketplacePartner, "logo_url" | "description"> | null,
  servicesCount: number,
  territoriesCount: number,
) => [
  !partner?.logo_url?.trim() && "Logo",
  !partner?.description?.trim() && "Description",
  servicesCount === 0 && "Services",
  territoriesCount === 0 && "Territoires",
].filter(Boolean) as string[];

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
  const [company, setCompany] = useState<CompanyIdentity | null>(null);
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
        const [profile, identity, fleet] = await Promise.all([
          fetchPartner(companyId),
          supabase.from("jsc_companies").select("name,legal_name,logo_url,phone,address").eq("id", companyId).maybeSingle(),
          supabase.from("trucks").select("id,name,type,active").eq("company_id", companyId).is("archived_at", null).order("name"),
        ]);
        if (!active) return;
        if (identity.error) throw identity.error;
        if (fleet.error) throw fleet.error;
        setPartner(profile);
        setCompany(identity.data as CompanyIdentity | null);
        setVehicles((fleet.data ?? []) as CompanyVehicle[]);
        if (profile?.is_public) setPublicProfile(await fetchPublicPartner(companyId));
        if (active) setState("ready");
      } catch {
        if (active) setState("error");
      }
    })();
    return () => { active = false; };
  }, [userId]);

  const nameCandidates = [partner?.trade_name, partner?.legal_name, company?.name, company?.legal_name, fallbackName];
  const companyName = nameCandidates.find(isProfessionalCompanyName)?.trim() || "Nom de l’entreprise · À compléter";
  const location = [partner?.city, partner?.region].filter(Boolean).join(" · ") || fallbackLocation || "Localisation · À compléter";
  const complete = professionalProfileIsComplete(partner);
  const services = publicProfile?.services ?? [];
  const territories = publicProfile?.territories ?? [];
  const missing = missingProfileItems(partner, services.length, territories.length);
  const vehicleTypes = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.type).filter(Boolean))], [vehicles]);

  if (state === "loading") return <p className="py-5 text-xs text-muted-foreground">Chargement de la fiche professionnelle…</p>;
  if (state === "error") return <p role="status" className="py-5 text-xs text-muted-foreground">Fiche professionnelle indisponible pour le moment.</p>;
  if (state === "multiple") return <Button asChild variant="link" className="h-auto min-h-11 whitespace-normal px-0 text-left"><Link to="/entrepreneur/crm">Choisir l’entreprise dans le CRM <ArrowUpRight className="h-4 w-4" /></Link></Button>;

  return (
    <section aria-labelledby="professional-profile-title" className="space-y-6">
      <header className="flex items-start gap-4 border-b border-border pb-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
          {partner?.logo_url || company?.logo_url ? <img src={partner?.logo_url || company?.logo_url || ""} alt={`Logo de ${companyName}`} className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7 text-muted-foreground" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Profil professionnel</p>
          <h2 id="professional-profile-title" className="mt-1 break-words font-display text-xl font-extrabold">{companyName}</h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{location}</p>
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            {complete && !missing.length ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <CircleAlert className="h-4 w-4" />}
            {complete && !missing.length ? "Profil complet" : "Profil à compléter"}
          </span>
          {missing.length > 0 && <p className="mt-1 text-xs text-muted-foreground">À ajouter : {missing.join(" · ")}</p>}
          {!(partner?.logo_url || company?.logo_url) && <p className="mt-1 text-xs text-muted-foreground">Logo à ajouter</p>}
        </div>
      </header>

      <>
          <p className="text-xs text-muted-foreground">« Public » : visible dans votre profil public. « Privé » : réservé à votre entreprise.{!partner?.is_public && " Votre profil n’est pas encore publié dans le réseau."}</p>
          <div>
            <h3 className="font-display text-sm font-bold">Description <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Public</span></h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{partner?.description || "À compléter"}</p>
          </div>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Nom légal</dt><dd className="mt-1 break-words font-medium">{[partner?.legal_name, company?.legal_name].find(isProfessionalCompanyName) || "À compléter"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Téléphone professionnel <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Privé</span></dt><dd className="mt-1 flex items-center gap-1.5 break-words font-medium"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{partner?.phone || company?.phone || "À compléter"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Adresse professionnelle <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Privé</span></dt><dd className="mt-1 break-words font-medium">{partner?.address || company?.address || "À compléter"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Ville <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Public</span></dt><dd className="mt-1 break-words font-medium">{partner?.city || "À compléter"}</dd></div>
          </dl>
          <div className="grid gap-5 border-y border-border py-5 sm:grid-cols-2">
            <div><h3 className="font-display text-sm font-bold">Services <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Public</span></h3><p className="mt-2 text-sm text-muted-foreground">{services.length ? services.join(" · ") : "Aucun service configuré"}</p></div>
            <div><h3 className="font-display text-sm font-bold">Territoires desservis <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Public</span></h3><p className="mt-2 text-sm text-muted-foreground">{territories.length ? territories.join(" · ") : "À compléter"}</p></div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-display text-sm font-bold"><Truck className="h-4 w-4" />Véhicules de l’entreprise <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Privé</span></h3><span className="text-sm font-bold">{vehicles.length}</span></div>
            <p className="mt-2 text-sm text-muted-foreground">{vehicles.length ? vehicleTypes.join(" · ") || `${vehicles.length} véhicule${vehicles.length > 1 ? "s" : ""}` : "Aucun véhicule enregistré"}</p>
            <Button asChild variant="link" className="mt-1 h-auto min-h-11 px-0"><Link to="/entrepreneur/flotte">Voir Ma flotte <ArrowUpRight className="h-4 w-4" /></Link></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-11"><Link to="/partenaire/profil">Compléter mon profil <ArrowUpRight className="h-4 w-4" /></Link></Button>
            {publicProfile && partner && <Button asChild variant="ghost" size="sm" className="min-h-11"><Link to={`/trouver-un-entrepreneur/fiche/${partner.company_id}`}>Voir mon profil public <ArrowUpRight className="h-4 w-4" /></Link></Button>}
          </div>
        </>
    </section>
  );
}