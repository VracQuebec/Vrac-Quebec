import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { resolveCompanies, type Company } from "@/lib/entcrm/api";

// Entreprise active + rôle recalculé côté serveur (entcrm_role) à chaque changement.
export function useCompanyRole(storageKey = "vq.todo.company") {
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading } = useUserRoles(user, isReady);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isReady || loading || !user) return;
    resolveCompanies(isAdmin).then((list) => {
      setCompanies(list);
      const pref = localStorage.getItem(`${storageKey}.${user.id}`);
      setCompanyId((list.find((c) => c.id === pref) ?? list[0])?.id ?? null);
      setReady(true);
    });
  }, [isReady, loading, user, isAdmin, storageKey]);
  useEffect(() => {
    if (!companyId || !user) return;
    localStorage.setItem(`${storageKey}.${user.id}`, companyId);
    setRole(null);
    (supabase as any).rpc("entcrm_role", { _company_id: companyId }).then(({ data }: any) => setRole(data ?? "aucun"));
  }, [companyId, user, storageKey]);
  return { companies, companyId, setCompanyId, role, ready, isAdmin, loading: !isReady || loading };
}
