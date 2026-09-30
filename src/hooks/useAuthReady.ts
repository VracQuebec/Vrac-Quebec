import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export const useAuthReady = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setIsReady(true);

      // NAV-01 : un renouvellement de jeton (même utilisateur) ne doit pas
      // changer l'identité de l'objet user — sinon rôles rechargés, écrans
      // remplacés par « Chargement… » et formulaires démontés (saisie perdue).
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        const next = nextSession?.user ?? null;
        setUser((prev) => (prev && next && prev.id === next.id ? prev : next));
      });
      subscription = data.subscription;
    }).catch(() => {
      if (!active) return;
      setUser(null);
      setIsReady(true);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  return { user, isReady, isAuthenticated: !!user };
};