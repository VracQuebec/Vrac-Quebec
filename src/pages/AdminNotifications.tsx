// ============================================================
// CENTRE DE NOTIFICATIONS CRM — VRAC QUÉBEC
// ------------------------------------------------------------
// Vue unique de tout ce qui demande une action : leads, relances,
// soumissions, livraisons, paiements, calendrier, sites.
// Chaque notification renvoie directement à l'élément concerné.
// Cette page ne modifie aucune donnée métier : elle pilote
// uniquement l'état de traitement des notifications et les
// préférences d'alerte (catégories, délais, push iPhone).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Bell, BellRing, CheckCheck, ChevronDown, Loader2, Send, Settings2, Smartphone } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import NotificationItem from "@/components/notifications/NotificationItem";
import { useCrmNotifications } from "@/hooks/useCrmNotifications";
import { toast } from "@/hooks/use-toast";
import {
  CATEGORY_ICONS, CATEGORY_LABELS, DISPLAY_CATEGORY_ICONS, DISPLAY_CATEGORY_LABELS, FILTER_LABELS,
  displayCategory, fetchSettings, groupNotifications, matchesFilter, saveSettings,
  type NotificationDisplayCategory, type NotifCategory, type NotifFilter, type NotificationSettings,
} from "@/lib/notifications/api";
import {
  disablePush, enablePush, getPushState, isIos, isStandalone, sendTestPush,
  updatePushCategories, type PushState,
} from "@/lib/notifications/push";
import { Button } from "@/components/ui/button";

const FILTERS: NotifFilter[] = ["all", "urgent", "todo", "unread", "done"];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as NotifCategory[];
const DISPLAY_CATEGORIES = Object.keys(DISPLAY_CATEGORY_LABELS) as NotificationDisplayCategory[];

const DELAY_FIELDS: { key: string; label: string; suffix: string }[] = [
  { key: "lead_untreated_hours", label: "Lead non traité après", suffix: "heures" },
  { key: "quote_followup_days", label: "Relance de soumission après", suffix: "jours" },
  { key: "payment_overdue_days", label: "Paiement en retard après", suffix: "jours" },
  { key: "delivery_reminder_hours", label: "Rappel de livraison", suffix: "heures avant" },
];

export default function AdminNotifications() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const allowed = isReady && !!user && isAdmin;

  const { items, stats, loading, error, read, change, readAll } = useCrmNotifications(allowed);
  const [filter, setFilter] = useState<NotifFilter>("todo");
  const [category, setCategory] = useState<NotificationDisplayCategory | "all">("all");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  const visible = useMemo(
    () => groupNotifications(items.filter((n) => matchesFilter(n, filter) && (category === "all" || displayCategory(n) === category))),
    [items, filter, category],
  );

  if (!isReady || roleLoading || !allowed) {
    return <FullPageState title="Centre de notifications" message="Vérification des permissions…" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Centre de notifications | CRM Vrac Québec</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex min-h-14 items-center justify-between gap-3 px-3 py-2 sm:px-6">
          <h1 className="min-w-0 font-display font-bold text-base inline-flex items-center gap-1.5 sm:text-lg">
            <Bell className="w-4 h-4 text-primary" /> Notifications
          </h1>
           <Button
             type="button"
             variant="ghost"
             size="sm"
            onClick={readAll}
            disabled={stats.unread === 0}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs font-display font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
           >
            <CheckCheck className="w-3.5 h-3.5" /> Tout lire
           </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
         <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
           <KpiBadge label="Urgentes" value={stats.urgent} alert />
           <KpiBadge label="À traiter" value={stats.total} />
           <KpiBadge label="Non lues" value={stats.unread} />
           <KpiBadge label="En retard" value={stats.overdue} alert />
        </div>

        <PushPanel />

        <div className="flex gap-1 overflow-x-auto pb-1.5 mb-1.5 -mx-3 px-3 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
             <Button key={f} type="button" size="sm" variant={filter === f ? "default" : "secondary"} onClick={() => setFilter(f)}
               className="shrink-0 min-h-11 text-xs">
              {FILTER_LABELS[f]}
             </Button>
          ))}
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1.5 mb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
           <Button type="button" size="sm" variant={category === "all" ? "outline" : "ghost"} onClick={() => setCategory("all")}
             className="shrink-0 min-h-11 text-xs">
            Toutes catégories
           </Button>
           {DISPLAY_CATEGORIES.map((c) => (
             <Button type="button" size="sm" variant={category === c ? "outline" : "ghost"} key={c} onClick={() => setCategory(c)}
               className="shrink-0 min-h-11 text-xs">
               {DISPLAY_CATEGORY_ICONS[c]} {DISPLAY_CATEGORY_LABELS[c]}
             </Button>
          ))}
        </div>

         <Button
           type="button"
           variant="ghost"
           size="sm"
          onClick={() => setShowSettings((v) => !v)}
           className="mb-2 min-h-11 px-2 text-xs"
        >
           <Settings2 className="h-4 w-4" /> Réglages des alertes <ChevronDown className={`h-4 w-4 transition-transform ${showSettings ? "rotate-180" : ""}`} />
         </Button>
        {showSettings && <SettingsPanel />}

        {error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive font-body mb-3">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          {loading && <p className="text-sm text-muted-foreground font-body">Chargement…</p>}
          {!loading && visible.length === 0 && (
            <div className="text-center py-10 rounded-2xl border border-border bg-card">
              <div className="text-3xl mb-1.5">✅</div>
              <p className="font-display font-bold text-sm">Rien à traiter ici</p>
              <p className="text-xs text-muted-foreground font-body">Aucune notification ne correspond à ce filtre.</p>
            </div>
          )}
           {visible.map((group) => (
             <NotificationItem key={group.key} n={group.latest} activityCount={group.items.length} onRead={read} onChange={change} />
          ))}
        </div>
      </main>
    </div>
  );
}

const KpiBadge = ({ label, value, alert }: { label: string; value: number; alert?: boolean }) => (
  <div
    className={`rounded-lg border px-3 py-3 font-display ${
      alert && value > 0 ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-card text-foreground"
    }`}
  >
    <strong className="block text-xl leading-none">{value}</strong>
    <span className="mt-1 block text-xs font-semibold text-muted-foreground">{label}</span>
  </div>
);

/* ------------------ PUSH iPHONE ------------------ */

function PushPanel() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getPushState().then(setState); }, []);

  const activate = async () => {
    setBusy(true);
    try {
      await enablePush(Object.fromEntries(CATEGORIES.map((c) => [c, true])));
      setState(await getPushState());
      toast({ title: "Notifications activées", description: "Cet appareil recevra désormais les alertes du CRM." });
    } catch (e) {
      toast({ title: "Activation impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const deactivate = async () => {
    setBusy(true);
    try { await disablePush(); setState(await getPushState()); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await sendTestPush();
      toast({ title: "Test envoyé", description: `${res.sent} notification(s) sur ${res.devices} appareil(s).` });
    } catch (e) {
      toast({ title: "Test échoué", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!state) return null;

  return (
    <section className="mb-3 rounded-xl border border-border bg-card p-3">
      <h2 className="flex items-center gap-1.5 font-display font-bold text-sm mb-1">
        <Smartphone className="w-4 h-4 text-primary" /> Notifications sur iPhone / iPad
      </h2>

      {state === "needs_install" || (isIos() && !isStandalone()) ? (
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Sur iPhone, ouvrez <strong>vracquebec.ca/admin</strong> dans Safari, appuyez sur <strong>Partager</strong> →
          {" "}<strong>Sur l'écran d'accueil</strong>, puis rouvrez l'app depuis l'icône pour activer les notifications.
        </p>
      ) : state === "unsupported" ? (
        <p className="text-xs text-muted-foreground font-body">
          Ce navigateur ne prend pas en charge les notifications push. Le centre de notifications reste disponible.
        </p>
      ) : state === "denied" ? (
        <p className="text-xs text-muted-foreground font-body">
          Notifications refusées pour cet appareil. Activez-les dans Réglages → Notifications → Vrac Québec.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground font-body mb-2 leading-snug">
            {state === "subscribed"
              ? "Cet appareil reçoit les alertes du CRM, même application fermée."
              : "Recevez les leads, relances et paiements directement sur votre écran verrouillé."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {state === "subscribed" ? (
              <>
                <button onClick={test} disabled={busy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold disabled:opacity-60">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyer un test
                </button>
                <button onClick={deactivate} disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-display font-semibold">
                  Désactiver sur cet appareil
                </button>
              </>
            ) : (
              <button onClick={activate} disabled={busy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold disabled:opacity-60">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />} Activer les notifications
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------ RÉGLAGES ------------------ */

function SettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSettings().then(setSettings).catch(() => setSettings(null)); }, []);
  if (!settings) return null;

  const persist = async (next: NotificationSettings) => {
    setSettings(next);
    setSaving(true);
    try {
      await saveSettings(next);
      await updatePushCategories(next.push_categories);
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggle = (field: "categories" | "push_categories", c: NotifCategory) => {
    const current = settings[field][c] !== false;
    persist({ ...settings, [field]: { ...settings[field], [c]: !current } });
  };

  return (
    <section className="mb-3 rounded-xl border border-border bg-card p-3 space-y-3">
      <div>
        <h3 className="font-display font-bold text-xs mb-1.5">Catégories suivies</h3>
        <div className="space-y-1">
          {CATEGORIES.map((c) => (
            <div key={c} className="flex items-center justify-between gap-3 text-xs font-body">
              <span>{CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}</span>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={settings.categories[c] !== false}
                    onChange={() => toggle("categories", c)} /> CRM
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={settings.push_categories[c] !== false}
                    onChange={() => toggle("push_categories", c)} /> Push
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display font-bold text-xs mb-1.5">Délais de déclenchement</h3>
        <div className="space-y-1.5">
          {DELAY_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 text-xs font-body">
              <span>{f.label}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number" min={0} max={720}
                  value={Number(settings.delays[f.key] ?? 0)}
                  onChange={(e) => setSettings({ ...settings, delays: { ...settings.delays, [f.key]: Number(e.target.value) } })}
                  onBlur={() => persist(settings)}
                  className="w-20 px-2 py-1 rounded-lg border border-border bg-background text-right"
                />
                <span className="text-xs text-muted-foreground">{f.suffix}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {saving && <p className="text-xs text-muted-foreground font-body">Enregistrement…</p>}
    </section>
  );
}
