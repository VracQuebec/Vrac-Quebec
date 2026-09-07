import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check } from "lucide-react";

interface Notif {
  id: string;
  title: string | null;
  body: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Notifications de suivi des demandes d'accès. Elles sont générées
 * automatiquement par la plateforme à chaque changement d'état : aucune
 * intervention manuelle n'est requise.
 */
const EntrepreneurNotifications = ({ userId }: { userId: string | null | undefined }) => {
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("jsc_notifications")
        .select("id, title, body, entity_id, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6);
      if (active) setItems((data as any) || []);
    };
    load();
    const ch = supabase
      .channel(`entrepreneur-notifications-` + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "jsc_notifications", filter: `user_id=eq.${userId}` },
        () => load()
      )
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [userId]);

  const markRead = async (id: string) => {
    const now = new Date().toISOString();
    await supabase.from("jsc_notifications").update({ read_at: now }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
  };

  if (items.length === 0) return null;

  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-display font-bold text-lg mb-3">
        <Bell className="w-4 h-4 text-primary" /> Suivi de vos demandes
      </h2>
      <ul className="space-y-2">
        {items.map((n) => (
          <li
            key={n.id}
            className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 ${
              n.read_at ? "border-border bg-background" : "border-primary/40 bg-primary/5"
            }`}
          >
            <div className="min-w-0">
              <div className="text-sm font-display font-bold truncate">{n.title || "Demande d'accès"}</div>
              <p className="text-xs text-muted-foreground font-body">{n.body}</p>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {new Date(n.created_at).toLocaleString("fr-CA")}
              </div>
            </div>
            {!n.read_at && (
              <button
                onClick={() => markRead(n.id)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-display font-bold text-primary hover:underline"
              >
                <Check className="w-3.5 h-3.5" /> Lu
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default EntrepreneurNotifications;
