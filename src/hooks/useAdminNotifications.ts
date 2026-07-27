import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";

type AdminNotification = {
  id: string;
  title: string;
  body: string | null;
  level: "info" | "success" | "warning" | "error";
  link: string | null;
  created_at: string;
};

/**
 * Subscribes to admin_notifications for logged-in admins and surfaces them
 * as sonner toasts. Fire-and-forget; safe to mount once at the app root.
 */
export function useAdminNotifications() {
  const { isReady, user } = useAuthReady();
  const { isAdmin } = useUserRoles(user, isReady);

  useEffect(() => {
    if (!isReady || !user || !isAdmin) return;
    const seenAt = new Date().toISOString();
    const channel = supabase
      .channel("admin-notifications-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const n = payload.new as AdminNotification;
          if (n.created_at < seenAt) return;
          const opts = {
            description: n.body ?? undefined,
            action: n.link
              ? { label: "Ouvrir", onClick: () => { window.location.href = n.link!; } }
              : undefined,
          };
          switch (n.level) {
            case "success": toast.success(n.title, opts); break;
            case "warning": toast.warning(n.title, opts); break;
            case "error":   toast.error(n.title, opts); break;
            default:        toast(n.title, opts);
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isReady, user, isAdmin]);
}