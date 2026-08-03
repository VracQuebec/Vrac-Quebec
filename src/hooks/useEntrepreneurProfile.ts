import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";

export interface EntrepreneurProfile {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  billing_address: string;
  tax_tps: string;
  tax_tvq: string;
  contact_name: string;
}

const EMPTY: EntrepreneurProfile = {
  name: "", company: "", phone: "", email: "",
  address: "", billing_address: "", tax_tps: "", tax_tvq: "", contact_name: "",
};

const clean = (row: Record<string, unknown> | null): EntrepreneurProfile => ({
  ...EMPTY,
  ...Object.fromEntries(
    Object.keys(EMPTY).map((k) => [k, (row?.[k] as string | null) ?? ""]),
  ),
} as EntrepreneurProfile);

/**
 * Reads the entrepreneur profile of the signed-in user so forms can be
 * prefilled without ever asking for information the CRM already holds.
 */
export const useEntrepreneurProfile = () => {
  const { user, isReady } = useAuthReady();
  const [profile, setProfile] = useState<EntrepreneurProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setProfile(null); return; }
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("entrepreneurs")
        .select("name, company, phone, email, address, billing_address, tax_tps, tax_tvq, contact_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile(data ? clean(data as Record<string, unknown>) : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const saveProfile = useCallback(
    async (updates: Partial<EntrepreneurProfile>) => {
      if (!user?.id) throw new Error("Non connecté");
      const { error } = await supabase
        .from("entrepreneurs")
        .update(updates)
        .eq("user_id", user.id);
      if (error) throw error;
      setProfile((prev) => ({ ...(prev ?? EMPTY), ...updates }));
    },
    [user?.id],
  );

  return { user, isReady, profile, loading, saveProfile };
};
