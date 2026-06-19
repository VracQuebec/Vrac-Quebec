import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "entrepreneur" | "user";

export const useUserRoles = (authUser?: User | null, authReady?: boolean) => {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [approvedEntrepreneur, setApprovedEntrepreneur] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (user: User | null) => {
    if (!user) {
      setRoles([]);
      setApprovedEntrepreneur(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("user_roles")
      .select("role, approved")
      .eq("user_id", user.id);
    const rows = data || [];
    setRoles(rows.map((r) => r.role as AppRole));
    setApprovedEntrepreneur(
      rows.some((r: any) => r.role === "entrepreneur" && r.approved === true)
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const loadFromStoredSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session?.user) {
        setRoles([]);
        setLoading(false);
        return;
      }
      await load(session.user);
    };

    if (authReady !== undefined) {
      if (authReady) load(authUser ?? null);
      return () => { active = false; };
    }

    loadFromStoredSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      load(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [authReady, authUser, load]);

  return {
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isEntrepreneur: roles.includes("entrepreneur"),
    approvedEntrepreneur,
  };
};