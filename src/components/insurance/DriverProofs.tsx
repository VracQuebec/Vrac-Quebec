// Chauffeur : seulement les preuves d'assurance des véhicules, sans primes ni soumissions.
import { useEffect, useRef, useState } from "react";
import { fileProgressLabel } from "@/lib/uploads/readProgress";
import { fetchSecureFile } from "@/lib/secureFile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export default function DriverProofs({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {let active=true;setRows(null);const load=()=>{(supabase as any).rpc("asr_driver_proofs",{_company:companyId}).then(({data,error}:any)=>{if(active)setRows(error?[]:data??[]);});};load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load);};}, [companyId]);
  const open = async (r: any) => {
    if (lock.current) return;
    lock.current = true;
    setOpening("Vérification de l’accès…");
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const blob = await fetchSecureFile("asr-files", r.storage_path, r.mime_type, p => setOpening(fileProgressLabel(p)));
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { tab?.close(); toast({ title: "Ouverture impossible", description: e?.message, variant: "destructive" }); }
    finally { lock.current = false; setOpening(null); }
  };
  if (!rows) return <p className="text-muted-foreground">Chargement…</p>;
  return (
    <div className="space-y-2">
      {opening && <p role="status" className="text-sm text-muted-foreground">Ouverture : {opening}</p>}
      <p className="text-xs text-muted-foreground">Preuves d’assurance des véhicules de l’entreprise.</p>
      {!rows.length && <p className="text-sm text-muted-foreground">Aucune preuve disponible.</p>}
      {rows.map((r) => (
        <div key={r.doc_id} className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium break-words">{r.title}</p>
          <p className="text-xs text-muted-foreground break-words">{r.insurer ?? "Assureur non renseigné"} · N° {r.policy_number ?? "non renseigné"} · Échéance {r.expires_on ?? "non renseignée"} · {r.vehicles}</p>
          {r.claims_contact && <p className="text-xs">Réclamations : {r.claims_contact}</p>}
          <Button size="sm" disabled={!!opening} className="mt-2" onClick={() => open(r)}>Consulter</Button>
        </div>))}
    </div>
  );
}
