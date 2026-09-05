// ============================================================
// ARCHITECTURE MULTI-ENTREPRISES — contexte d'entreprise actif
// ------------------------------------------------------------
// Chaque donnée de la flotte appartient à une entreprise
// (`company_id`). L'isolation est appliquée par la base de
// données (politiques RLS + fonctions `fleet_can_access`,
// `fleet_can_manage`, `fleet_can_administer`). Ce fichier ne
// fait QUE choisir l'entreprise de travail et l'ajouter aux
// enregistrements créés : il ne constitue jamais la sécurité.
//
// Exception plateforme : le SUPER ADMIN VRAC QUÉBEC (rôle
// `admin`) peut ouvrir l'environnement de n'importe quelle
// entreprise (mode support), ce qui est journalisé.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FleetCompany = {
  id: string;
  name: string;
  code: string;
  is_default: boolean;
  is_active: boolean;
};

/** Rôles au niveau entreprise (l'accès réel est décidé par la base de données). */
export const COMPANY_ROLES = [
  { value: "proprietaire", label: "Propriétaire / Admin entreprise" },
  { value: "gestionnaire", label: "Gestionnaire de flotte" },
  { value: "mecanicien", label: "Mécanicien" },
  { value: "chauffeur", label: "Chauffeur" },
  { value: "comptabilite", label: "Comptabilité" },
] as const;

export const companyRoleLabel = (r?: string | null) =>
  COMPANY_ROLES.find((x) => x.value === r)?.label ?? (r ? r : "—");

const STORAGE_KEY = "vq.fleet.company";

let activeCompanyId: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
let superAdmin = false;
const listeners = new Set<() => void>();

export const getActiveCompanyId = () => activeCompanyId;

export function setActiveCompanyId(id: string | null) {
  activeCompanyId = id;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* stockage indisponible */ }
  listeners.forEach((fn) => fn());
}

export const setSuperAdmin = (value: boolean) => { superAdmin = value; };

/** Vrai quand l'action est faite par l'administration Vrac Québec (support). */
export const isSupportSession = () => superAdmin;

/** Origine journalisée de chaque action. */
export const actionOrigin = () => (superAdmin ? "support_vrac_quebec" : "entreprise");

/** Restreint une requête à l'entreprise active (la base de données valide aussi). */
export function scoped<T>(query: T): T {
  if (!activeCompanyId) return query;
  return (query as unknown as { eq: (c: string, v: string) => T }).eq("company_id", activeCompanyId);
}

/** Ajoute l'entreprise active à un enregistrement créé. */
export function withCompany<T extends object>(row: T): T {
  return activeCompanyId ? ({ ...row, company_id: activeCompanyId } as T) : row;
}

// ---------------- Lectures ----------------

/** Entreprises visibles : toutes pour le Super Admin, la sienne pour un membre. */
export async function fetchCompanies(): Promise<FleetCompany[]> {
  const { data, error } = await supabase
    .from("jsc_companies")
    .select("id, name, code, is_default, is_active")
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []) as FleetCompany[];
}

/** Rôle de l'utilisateur dans l'entreprise active (informatif pour l'interface). */
export async function fetchMyRole(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data } = await supabase
    .from("jsc_company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .is("archived_at", null)
    .maybeSingle();
  return (data?.role as string) ?? null;
}

// ---------------- Hook d'interface ----------------

export type FleetTenant = {
  companies: FleetCompany[];
  companyId: string | null;
  company: FleetCompany | null;
  role: string | null;
  /** Super Admin Vrac Québec : accès à toutes les entreprises. */
  isSuperAdmin: boolean;
  /** Bandeau « Mode support » : un Super Admin travaille dans une entreprise. */
  supportMode: boolean;
  loading: boolean;
  select: (id: string) => void;
  reload: () => Promise<void>;
};

export function useFleetTenant(isSuperAdminUser: boolean, ready: boolean): FleetTenant {
  const [companies, setCompanies] = useState<FleetCompany[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(getActiveCompanyId());
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSuperAdmin(isSuperAdminUser);
      const list = await fetchCompanies();
      setCompanies(list);
      const current = getActiveCompanyId();
      const valid = list.find((c) => c.id === current)
        ?? list.find((c) => c.is_default)
        ?? list[0]
        ?? null;
      setActiveCompanyId(valid?.id ?? null);
      setCompanyId(valid?.id ?? null);
      setRole(await fetchMyRole(valid?.id ?? null));
    } finally {
      setLoading(false);
    }
  }, [isSuperAdminUser]);

  useEffect(() => { if (ready) void reload(); }, [ready, reload]);

  useEffect(() => {
    const fn = () => setCompanyId(getActiveCompanyId());
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const select = useCallback((id: string) => {
    setActiveCompanyId(id);
    setCompanyId(id);
    void fetchMyRole(id).then(setRole);
  }, []);

  const company = companies.find((c) => c.id === companyId) ?? null;

  return {
    companies,
    companyId,
    company,
    role,
    isSuperAdmin: isSuperAdminUser,
    supportMode: isSuperAdminUser && !!company,
    loading,
    select,
    reload,
  };
}
