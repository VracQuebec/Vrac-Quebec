import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { useCompanyRole } from "@/components/todo/useCompanyRole";
import InsuranceBoard from "@/components/insurance/InsuranceBoard";
import PolicyDetail from "@/components/insurance/PolicyDetail";
import DriverProofs from "@/components/insurance/DriverProofs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

const db = supabase as any;

export default function EntrepreneurAssurances() {
  const { policyId } = useParams();
  const [sp] = useSearchParams();
  const { companies, companyId, setCompanyId, ready } = useCompanyRole();
  const [access, setAccess] = useState<{ read: boolean; write: boolean; role: string | null; admin: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const check = async (c: string) => {
    const [{ data: role }, { data: w }, { data: u }] = await Promise.all([db.rpc("asr_role", { _c: c }), db.rpc("asr_can_write", { _c: c }), supabase.auth.getUser()]);
    const { data: admin } = u.user ? await db.rpc("has_role", { _user_id: u.user.id, _role: "admin" }) : { data: false };
    setAccess({ role, read: !!role && !["chauffeur", "mecanicien"].includes(role), write: w === true, admin: admin === true });
  };
  useEffect(() => { setAccess(null); if (companyId) check(companyId); }, [companyId]);

  return (
    <EntrepreneurAppShell title="Assurances entreprise" subtitle={companies.find((c) => c.id === companyId)?.name ?? ""} backTo={policyId ? "/entrepreneur/assurances" : null} allowCompanyMembers>
      {companies.length > 1 && !policyId && (
        <select aria-label="Entreprise active" className="mb-4 h-10 w-full rounded-md border border-border bg-background px-2 text-sm sm:w-auto" value={companyId ?? ""} onChange={(e) => setCompanyId(e.target.value)}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>)}
      {!ready || (companyId && !access) ? <p className="text-muted-foreground">Chargement…</p>
        : !companyId ? <p className="text-muted-foreground">Aucune entreprise accessible.</p>
        : access!.admin && !access!.role ? (
          <div className="max-w-lg space-y-2 rounded-md border border-border p-4">
            <p className="text-sm">Le contenu des assurances est confidentiel. Pour y accéder en assistance, indiquez la raison : l’accès sera journalisé et visible par l’entreprise (4 h).</p>
            <Input placeholder="Raison de l’accès" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button disabled={reason.trim().length < 5} onClick={async () => { const { error } = await db.rpc("asr_support_open", { _company: companyId, _reason: reason }); if (error) toast({ title: "Refusé", description: error.message, variant: "destructive" }); else check(companyId); }}>Autoriser et journaliser l’accès</Button>
          </div>)
        : access!.role && ["chauffeur", "mecanicien"].includes(access!.role) ? <DriverProofs companyId={companyId} />
        : !access!.read ? <p className="text-muted-foreground">Accès refusé pour cette entreprise.</p>
        : policyId ? <><Link to="/entrepreneur/assurances" className="mb-3 inline-block text-sm text-primary underline">← Toutes les polices</Link><PolicyDetail key={policyId} companyId={companyId} policyId={policyId} canWrite={access!.write} tab={sp.get("onglet") ?? undefined} /></>
        : <InsuranceBoard key={companyId} companyId={companyId} canWrite={access!.write} />}
    </EntrepreneurAppShell>
  );
}
