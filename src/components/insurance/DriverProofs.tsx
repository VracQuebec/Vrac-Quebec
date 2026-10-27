// Chauffeur : seulement les preuves d'assurance des véhicules, sans primes ni soumissions.
import { useEffect, useState } from "react";
import { fetchSecureFile } from "@/lib/secureFile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export default function DriverProofs({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {let active=true;setRows(null);const load=()=>{(supabase as any).rpc("asr_driver_proofs",{_company:companyId}).then(({data,error}:any)=>{if(active)setRows(error?[]:data??[]);});};load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load);};}, [companyId]);
  const open = async (r: any) => {
    try {
      const blob = await fetchSecureFile("asr-files", r.storage_path, r.mime_type);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e: any) { toast({ title: "Ouverture impossible", description: e?.message, variant: "destructive" }); }
  };
  if (!rows) return <p className="text-muted-foreground">Chargement…</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Preuves d’assurance des véhicules de l’entreprise.</p>
      {!rows.length && <p className="text-sm text-muted-foreground">Aucune preuve disponible.</p>}
      {rows.map((r) => (
        <div key={r.doc_id} className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium break-words">{r.title}</p>
          <p className="text-xs text-muted-foreground break-words">{r.insurer ?? "Assureur non renseigné"} · N° {r.policy_number ?? "non renseigné"} · Échéance {r.expires_on ?? "non renseignée"} · {r.vehicles}</p>
          {r.claims_contact && <p className="text-xs">Réclamations : {r.claims_contact}</p>}
          <Button size="sm" className="mt-2" onClick={() => open(r)}>Consulter</Button>
        </div>))}
    </div>
  );
}
