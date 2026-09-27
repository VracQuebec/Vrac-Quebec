// « Ajouter à mon CRM » : crée (une seule fois) une opportunité privée liée à une demande
// que l'entreprise peut déjà consulter. Aucun effet sur la demande partagée.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { resolveCompanies, type Company } from "@/lib/entcrm/api";

const db = supabase as any;

export default function AddToCrmButton({ sourceType, sourceId }: { sourceType: "submission" | "transport_request"; sourceId: string }) {
  const nav = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]); const [cid, setCid] = useState(""); const [linked, setLinked] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { resolveCompanies(false).then((l) => { setCompanies(l); setCid(l[0]?.id ?? ""); }); }, []);
  useEffect(() => { if (!cid) return; db.from("ent_crm_network_links").select("lead_id").eq("company_id", cid).eq("source_type", sourceType).eq("source_id", sourceId).maybeSingle().then(({ data }: any) => setLinked(data?.lead_id ?? null)); }, [cid, sourceType, sourceId]);
  if (!companies.length) return null;
  const go = async () => {
    setBusy(true);
    const { data, error } = await db.rpc("entcrm_track_network", { _company_id: cid, _type: sourceType, _id: sourceId });
    setBusy(false);
    if (error) return toast({ title: "Ajout impossible", description: error.message, variant: "destructive" });
    toast({ title: linked ? "Dossier déjà suivi : ouverture" : "Opportunité privée créée" });
    nav(`/entrepreneur/crm?tab=leads&company=${cid}&q=${encodeURIComponent("Demande réseau")}&lead=${data}`);
  };
  return <div className="space-y-2">
    {companies.length > 1 && <select aria-label="Entreprise" className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={cid} onChange={(e) => setCid(e.target.value)}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
    <Button variant="outline" className="h-11 w-full font-display font-bold" disabled={busy} onClick={go}>{linked ? "Ouvrir dans mon CRM" : "Ajouter à mon CRM"}</Button>
    <p className="text-xs text-muted-foreground">Vos notes, pièces et soumissions restent privées. La demande Vrac Québec n'est pas modifiée.</p>
  </div>;
}
