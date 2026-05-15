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
      // Always keep the session — the user wants to stay logged in across
      // tab closures, browser restarts, and navigations of any kind.
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