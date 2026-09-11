// Fournisseur de données unique de l'espace entrepreneur.
// Charge une seule fois (par session) les demandes, les chantiers
// (vue calculée) et les demandes d'accès, puis les partage à tous
// les écrans. Fin des rechargements répétés entre les pages.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { loadMySubmissions, type MySubmission } from "@/lib/parcours/mes-demandes";
import { buildChantiers, type Chantier } from "@/lib/parcours/chantiers";
import { statusBucket } from "@/lib/access-requests/status";

export interface AccessRequestRow {
  id: string;
  status: string;
  created_at: string | null;
  [key: string]: unknown;
}

interface EntrepreneurData {
  loading: boolean;
  error: string | null;
  submissions: MySubmission[];
  chantiers: Chantier[];
  accessRequests: AccessRequestRow[];
  counts: { pending: number; accepted: number; completed: number; refused: number };
  refresh: () => void;
}

const Ctx = createContext<EntrepreneurData | null>(null);

export function EntrepreneurDataProvider({ children }: { children: ReactNode }) {
  const { user, isReady } = useAuthReady();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<MySubmission[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRow[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      setSubmissions([]);
      setAccessRequests([]);
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const [subs, reqs] = await Promise.all([
        loadMySubmissions(),
        supabase.from("transport_requests").select("id,status,created_at,site_name,site_address").eq("user_id", user.id),
      ]);
      if (!active) return;
      if (subs.state === "error") setError(subs.message);
      if (subs.state === "ok") setSubmissions(subs.submissions);
      setAccessRequests((reqs.data as AccessRequestRow[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isReady, user, tick]);

  const value = useMemo<EntrepreneurData>(() => {
    const counts = { pending: 0, accepted: 0, completed: 0, refused: 0 };
    for (const r of accessRequests) counts[statusBucket(r.status)]++;
    return {
      loading,
      error,
      submissions,
      chantiers: buildChantiers(submissions),
      accessRequests,
      counts,
      refresh,
    };
  }, [loading, error, submissions, accessRequests, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntrepreneurData(): EntrepreneurData {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  // Hors fournisseur (ex. page publique) : état vide, aucune fuite de données.
  return {
    loading: false,
    error: null,
    submissions: [],
    chantiers: [],
    accessRequests: [],
    counts: { pending: 0, accepted: 0, completed: 0, refused: 0 },
    refresh: () => {},
  };
}
