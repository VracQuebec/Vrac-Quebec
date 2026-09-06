// ============================================================
// CENTRE DE NOTIFICATIONS de la place de marché.
// Affiche les avis destinés à la personne connectée (ou à son
// entreprise) et permet de choisir les canaux et les avis à taire.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  NOTIFICATION_EVENTS, fetchNotificationPrefs, fetchNotifications,
  markNotificationRead, saveNotificationPrefs,
} from "@/lib/marketplace/api";
import type { MktNotification } from "@/lib/marketplace/api";

type Props = { userId?: string | null; audience?: "client" | "partenaire" };

const dt = (v: string) => new Date(v).toLocaleString("fr-CA");

export default function NotificationsPanel({ userId, audience = "client" }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<MktNotification[]>([]);
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [reglages, setReglages] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchNotifications(30);
      setRows(list);
      if (userId) setPrefs((await fetchNotificationPrefs(userId)) ?? {});
    } catch {
      setRows([]);
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { void charger(); }, [charger]);

  const majPrefs = async (updates: Record<string, unknown>) => {
    if (!userId) return;
    const next = { ...prefs, ...updates };
    setPrefs(next);
    try {
      await saveNotificationPrefs(userId, {
        app_enabled: next.app_enabled !== false,
        email_enabled: next.email_enabled !== false,
        sms_enabled: next.sms_enabled === true,
        muted_events: (next.muted_events as string[]) ?? [],
      });
    } catch (e) {
      toast({ title: "Modification refusée", description: (e as Error).message, variant: "destructive" });
    }
  };

  const muted = (prefs.muted_events as string[]) ?? [];
  const evenements = NOTIFICATION_EVENTS.filter((e) => e.audience === audience);
  const nonLues = rows.filter((r) => !r.read_at).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" /> Notifications {nonLues > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{nonLues}</span>}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setReglages((v) => !v)}>
          {reglages ? "Voir les avis" : "Réglages"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {!loading && reglages && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span>Dans l'application</span>
              <Switch checked={prefs.app_enabled !== false} onCheckedChange={(v) => majPrefs({ app_enabled: v })} /></div>
            <div className="flex items-center justify-between"><span>Par courriel</span>
              <Switch checked={prefs.email_enabled !== false} onCheckedChange={(v) => majPrefs({ email_enabled: v })} /></div>
            <div className="flex items-center justify-between"><span>Par texto (à venir)</span>
              <Switch checked={prefs.sms_enabled === true} onCheckedChange={(v) => majPrefs({ sms_enabled: v })} /></div>
            <p className="pt-2 text-xs text-muted-foreground">Avis que vous souhaitez recevoir</p>
            {evenements.map((e) => (
              <div key={e.value} className="flex items-center justify-between">
                <span>{e.label}</span>
                <Switch checked={!muted.includes(e.value)}
                  onCheckedChange={(v) => majPrefs({
                    muted_events: v ? muted.filter((m) => m !== e.value) : [...muted, e.value],
                  })} />
              </div>
            ))}
          </div>
        )}

        {!loading && !reglages && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune notification pour le moment.</p>
        )}

        {!loading && !reglages && rows.map((n) => (
          <div key={n.id} className={`rounded-md border p-3 text-sm ${n.read_at ? "opacity-70" : "border-primary/40"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{n.title}</p>
              <span className="text-xs text-muted-foreground">{dt(n.created_at)}</span>
            </div>
            {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
            <div className="mt-2 flex gap-2">
              {n.link && <Button size="sm" variant="outline" asChild><Link to={n.link}>Ouvrir</Link></Button>}
              {!n.read_at && (
                <Button size="sm" variant="ghost" onClick={async () => { await markNotificationRead(n.id); void charger(); }}>
                  Marquer comme lu
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
