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
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Bell, BellRing, CheckCheck, Loader2, Send, Smartphone } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import NotificationItem from "@/components/notifications/NotificationItem";
import { useCrmNotifications } from "@/hooks/useCrmNotifications";
import { toast } from "@/hooks/use-toast";
import {
  CATEGORY_ICONS, CATEGORY_LABELS, FILTER_LABELS, fetchSettings, matchesFilter,
  saveSettings, type NotifCategory, type NotifFilter, type NotificationSettings,
} from "@/lib/notifications/api";
import {
  disablePush, enablePush, getPushState, isIos, isStandalone, sendTestPush,
  updatePushCategories, type PushState,
} from "@/lib/notifications/push";

const FILTERS: NotifFilter[] = ["todo", "urgent", "today", "overdue", "unread", "done", "all"];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as NotifCategory[];

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
  const [category, setCategory] = useState<NotifCategory | "all">("all");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  const visible = useMemo(
    () => items.filter((n) => matchesFilter(n, filter) && (category === "all" || n.category === category)),
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

      <nav className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-display font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Retour au CRM
          </Link>
          <h1 className="font-display font-bold inline-flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Notifications
          </h1>
          <button
            onClick={readAll}
            disabled={stats.unread === 0}
            className="inline-flex items-center gap-1 text-xs font-display font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <CheckCheck className="w-4 h-4" /> Tout lire
          </button>
        </div>
      </nav>

      <main className="container mx-auto px-4 sm:px-6 py-6 max-w-4xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <Kpi label="Urgentes" value={stats.urgent} alert />
          <Kpi label="En retard" value={stats.overdue} alert />
          <Kpi label="Aujourd'hui" value={stats.today} />
          <Kpi label="À traiter" value={stats.total} />
        </div>

        <PushPanel />

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-display font-bold ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
          <button onClick={() => setCategory("all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-display font-semibold ${
              category === "all" ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}>
            Toutes catégories
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-display font-semibold ${
                category === c ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}>
              {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
              {stats.byCategory[c] > 0 && <span className="ml-1 opacity-70">({stats.byCategory[c]})</span>}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowSettings((v) => !v)}
          className="mb-4 text-xs font-display font-bold text-primary"
        >
          {showSettings ? "Masquer les réglages" : "Réglages des alertes et délais"}
        </button>
        {showSettings && <SettingsPanel />}

        {error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive font-body mb-4">
            {error}
          </p>
        )}

        <div className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground font-body">Chargement…</p>}
          {!loading && visible.length === 0 && (
            <div className="text-center py-14 rounded-2xl border border-border bg-card">
              <div className="text-4xl mb-2">✅</div>
              <p className="font-display font-bold">Rien à traiter ici</p>
              <p className="text-sm text-muted-foreground font-body">Aucune notification ne correspond à ce filtre.</p>
            </div>
          )}
          {visible.map((n) => (
            <NotificationItem key={n.id} n={n} onRead={read} onChange={change} />
          ))}
        </div>
      </main>
    </div>
  );
}

const Kpi = ({ label, value, alert }: { label: string; value: number; alert?: boolean }) => (
  <div className={`rounded-xl border p-3 ${alert && value > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
    <div className={`text-2xl font-display font-bold ${alert && value > 0 ? "text-destructive" : "text-foreground"}`}>{value}</div>
    <div className="text-[11px] uppercase tracking-wide font-display font-bold text-muted-foreground">{label}</div>
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
    <section className="mb-5 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-display font-bold mb-1">
        <Smartphone className="w-4 h-4 text-primary" /> Notifications sur iPhone / iPad
      </h2>

      {state === "needs_install" || (isIos() && !isStandalone()) ? (
        <p className="text-sm text-muted-foreground font-body">
          Sur iPhone, ouvrez <strong>vracquebec.ca/admin</strong> dans Safari, appuyez sur <strong>Partager</strong> →
          {" "}<strong>Sur l'écran d'accueil</strong>, puis rouvrez l'app depuis l'icône pour activer les notifications.
        </p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-muted-foreground font-body">
          Ce navigateur ne prend pas en charge les notifications push. Le centre de notifications reste disponible.
        </p>
      ) : state === "denied" ? (
        <p className="text-sm text-muted-foreground font-body">
          Notifications refusées pour cet appareil. Activez-les dans Réglages → Notifications → Vrac Québec.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground font-body mb-3">
            {state === "subscribed"
              ? "Cet appareil reçoit les alertes du CRM, même application fermée."
              : "Recevez les leads, relances et paiements directement sur votre écran verrouillé."}
          </p>
          <div className="flex flex-wrap gap-2">
            {state === "subscribed" ? (
              <>
                <button onClick={test} disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold disabled:opacity-60">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer un test
                </button>
                <button onClick={deactivate} disabled={busy}
                  className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-display font-semibold">
                  Désactiver sur cet appareil
                </button>
              </>
            ) : (
              <button onClick={activate} disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />} Activer les notifications
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
    <section className="mb-5 rounded-2xl border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="font-display font-bold text-sm mb-2">Catégories suivies</h3>
        <div className="space-y-1.5">
          {CATEGORIES.map((c) => (
            <div key={c} className="flex items-center justify-between gap-3 text-sm font-body">
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
        <h3 className="font-display font-bold text-sm mb-2">Délais de déclenchement</h3>
        <div className="space-y-2">
          {DELAY_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 text-sm font-body">
              <span>{f.label}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number" min={1} max={720}
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
