import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

// Rôles de la plateforme. Vrac Québec coordonne plusieurs acteurs :
// aucun transporteur ni propriétaire n'est codé en dur.
export type AppRole = "admin" | "entrepreneur" | "proprietaire" | "transporteur" | "user";

export const useUserRoles = (authUser?: User | null, authReady?: boolean) => {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedFor = useRef<string | null>(null);

  // NAV-01 : une erreur réseau ou serveur sur la lecture des rôles n'est PAS
  // une absence de rôle. On réessaie, puis on reprend les derniers rôles connus
  // pour ce même utilisateur (mémoire d'onglet) au lieu de renvoyer à la connexion.
  const load = useCallback(async (user: User | null) => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    const cacheKey = `vq.roles.${user.id}`;
    // Même compte déjà chargé : on rafraîchit en arrière-plan sans repasser en « chargement ».
    if (loadedFor.current !== user.id) setLoading(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!error) {
        const next = (data || []).map((r) => r.role as AppRole);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* stockage indisponible */ }
        loadedFor.current = user.id;
        setRoles(next);
        setLoading(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    let cached: AppRole[] = [];
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? "[]"); } catch { cached = []; }
    setRoles(cached);
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
    let lastId: string | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const id = session?.user?.id ?? null;
      if (id === lastId) return; // renouvellement du même compte : rien à recharger
      lastId = id;
      load(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser?.id, load]);

  return {
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isEntrepreneur: roles.includes("entrepreneur"),
    isProprietaire: roles.includes("proprietaire"),
    isTransporteur: roles.includes("transporteur"),
  };
};