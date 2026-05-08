import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the Supabase session alive across tab suspensions, refreshes,
 * mobile Safari aggressive throttling, and long idle periods.
 * - Starts auto-refresh while the tab is visible.
 * - Forces a getSession() (which refreshes if expired) on visibility/focus/online.
 * - Honors the "Rester connecté" preference: if disabled, sign out on tab close.
 */
const SessionKeeper = () => {
  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        await supabase.auth.getSession();
      } catch {
        /* ignore */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.startAutoRefresh();
        refresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };

    const onFocus = () => refresh();
    const onOnline = () => refresh();

    const onPageHide = () => {
      // If the user explicitly opted OUT of "Rester connecté", clear the
      // local session when the tab is closed. Default behavior keeps it.
      try {
        const stay = localStorage.getItem("vq_stay_logged_in");
        if (stay === "0") {
          // Local-only sign-out: removes tokens from storage without
          // revoking the refresh token server-side.
          supabase.auth.signOut({ scope: "local" });
        }
      } catch {
        /* ignore */
      }
    };

    // Kick things off once on mount.
    if (mounted) {
      supabase.auth.startAutoRefresh();
      refresh();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return null;
};

export default SessionKeeper;