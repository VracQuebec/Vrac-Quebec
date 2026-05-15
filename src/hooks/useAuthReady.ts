import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export const useAuthReady = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setIsReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setIsReady(true);
    }).catch(() => {
      if (!active) return;
      setUser(null);
      setIsReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isReady, isAuthenticated: !!user };
};