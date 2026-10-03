import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import CompanyDocuments from "@/components/company-docs/CompanyDocuments";
import { useCompanyRole } from "@/components/todo/useCompanyRole";

export default function EntrepreneurDocuments() {
  const { companies, companyId, setCompanyId, role, ready } = useCompanyRole();
  const [canWrite, setCanWrite] = useState(false);
  useEffect(() => {
    setCanWrite(false);
    if (companyId) (supabase as any).rpc("entcrm_can_write", { _company_id: companyId }).then(({ data }: any) => setCanWrite(data === true));
  }, [companyId]);
  return (
    <EntrepreneurAppShell title="Documents de l’entreprise" subtitle={companies.find((c) => c.id === companyId)?.name ?? ""} backTo={null} allowCompanyMembers>
      {companies.length > 1 && (
        <select aria-label="Entreprise active" className="mb-4 h-10 w-full rounded-md border border-border bg-background px-2 text-sm sm:w-auto" value={companyId ?? ""} onChange={(e) => setCompanyId(e.target.value)}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {!ready ? <p className="text-muted-foreground">Chargement…</p>
        : !companyId ? <p className="text-muted-foreground">Aucune entreprise accessible.</p>
        : role === null ? <p className="text-muted-foreground">Vérification des droits…</p>
        : role === "aucun" ? <p className="text-muted-foreground">Accès refusé pour cette entreprise.</p>
        : <CompanyDocuments key={companyId} companyId={companyId} canWrite={canWrite} />}
    </EntrepreneurAppShell>
  );
}
