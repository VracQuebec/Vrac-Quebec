// ============================================================
// PARAMÈTRES — CRM VRAC QUÉBEC
// ------------------------------------------------------------
// Interface de gestion du système de notifications DÉJÀ EN PLACE :
// catégories, délais de rappel, notifications Push iPhone et
// appareils enregistrés. Cette page ne crée aucune notification,
// n'en supprime aucune et ne touche à aucune donnée métier.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft, Bell, BellRing, ChevronDown, Loader2, LogOut, Send,
  Settings, Shield, Smartphone, User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { toast } from "@/hooks/use-toast";
import {
  CATEGORY_ICONS, CATEGORY_LABELS, fetchSettings, formatWhen, saveSettings,
  type NotifCategory, type NotificationSettings,
} from "@/lib/notifications/api";
import {
  currentEndpoint, deviceName, disablePush, enablePush, getPushState, isIos, isStandalone,
  listDevices, sendTestPush, setDeviceEnabled, updatePushCategories,
  type PushDevice, type PushState,
} from "@/lib/notifications/push";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as NotifCategory[];

const DELAY_FIELDS: { key: string; label: string; suffix: string }[] = [
  { key: "lead_untreated_hours", label: "Lead resté non traité", suffix: "h" },
  { key: "quote_followup_days", label: "Relance de soumission", suffix: "j" },
  { key: "payment_overdue_days", label: "Paiement en retard", suffix: "j" },
  { key: "delivery_reminder_hours", label: "Rappel de livraison", suffix: "h avant" },
];

export default function AdminSettings() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const allowed = isReady && !!user && isAdmin;

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  if (!isReady || roleLoading || !allowed) {
    return <FullPageState title="Paramètres" message="Vérification des permissions…" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Paramètres | CRM Vrac Québec</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <nav
        className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="container mx-auto px-3 sm:px-6 h-12 flex items-center justify-between gap-2 max-w-3xl">
          <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> CRM
          </Link>
          <h1 className="font-display font-bold text-base inline-flex items-center gap-1.5">
            <Settings className="w-4 h-4 text-primary" /> Paramètres
          </h1>
          <Link to="/admin/notifications" className="text-[11px] font-display font-semibold text-primary">
            Notifications
          </Link>
        </div>
      </nav>

      <main className="container mx-auto px-3 sm:px-6 py-3 max-w-3xl space-y-2 pb-16">
        <NotificationsCard />
        <PushCard />
        <AccountCard email={user?.email ?? null} />
        <SecurityCard />
        <PreferencesCard />
      </main>
    </div>
  );
}

/* ---------------- Carte repliable compacte ---------------- */

function Card({
  icon, title, subtitle, defaultOpen = false, children,
}: {
  icon: React.ReactNode; title: string; subtitle?: string;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left min-h-[44px]"
      >
        <span className="shrink-0 text-primary">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-bold text-sm">{title}</span>
          {subtitle && <span className="block text-[11px] text-muted-foreground font-body truncate">{subtitle}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-0 border-t border-border/60">{children}</div>}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 min-h-[40px]">
      <span className="min-w-0">
        <span className="block text-xs font-body text-foreground">{label}</span>
        {hint && <span className="block text-[10px] text-muted-foreground font-body">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-primary" : "bg-secondary border border-border"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const Dot = ({ ok, warn }: { ok?: boolean; warn?: boolean }) => (
  <span className={ok ? "text-primary" : warn ? "text-destructive" : "text-muted-foreground"}>
    {ok ? "🟢" : warn ? "🔴" : "🟠"}
  </span>
);

/* ---------------- 🔔 NOTIFICATIONS ---------------- */

function NotificationsCard() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSettings().then(setSettings).catch(() => setSettings(null)); }, []);

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

  return (
    <Card icon={<Bell className="w-4 h-4" />} title="Notifications" subtitle="Catégories suivies et délais de rappel" defaultOpen>
      {!settings ? (
        <p className="py-2 text-xs text-muted-foreground font-body">Chargement des réglages…</p>
      ) : (
        <div className="space-y-3 pt-1">
          <Row label="Notifications CRM" hint="Désactiver masque les alertes sans rien supprimer">
            <Toggle
              checked={settings.options?.crm_enabled !== false}
              onChange={(v) => persist({ ...settings, options: { ...settings.options, crm_enabled: v } })}
            />
          </Row>

          <div>
            <h3 className="font-display font-bold text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Types de notifications
            </h3>
            <div className="space-y-0.5">
              {CATEGORIES.map((c) => (
                <div key={c} className="flex items-center justify-between gap-3 py-1 min-h-[36px]">
                  <span className="text-xs font-body truncate">{CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}</span>
                  <span className="flex items-center gap-3 shrink-0 text-[10px] font-display font-semibold text-muted-foreground">
                    <label className="flex items-center gap-1">
                      CRM
                      <input type="checkbox" className="w-4 h-4 accent-[hsl(var(--primary))]"
                        checked={settings.categories[c] !== false}
                        onChange={() => persist({ ...settings, categories: { ...settings.categories, [c]: settings.categories[c] === false } })} />
                    </label>
                    <label className="flex items-center gap-1">
                      Push
                      <input type="checkbox" className="w-4 h-4 accent-[hsl(var(--primary))]"
                        checked={settings.push_categories[c] !== false}
                        onChange={() => persist({ ...settings, push_categories: { ...settings.push_categories, [c]: settings.push_categories[c] === false } })} />
                    </label>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-display font-bold text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Délais des rappels
            </h3>
            {DELAY_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-3 py-1 text-xs font-body min-h-[36px]">
                <span>{f.label}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number" inputMode="numeric" min={0} max={720}
                    value={Number(settings.delays[f.key] ?? 0)}
                    onChange={(e) => setSettings({ ...settings, delays: { ...settings.delays, [f.key]: Number(e.target.value) } })}
                    onBlur={() => persist(settings)}
                    className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-right"
                  />
                  <span className="text-[10px] text-muted-foreground w-12">{f.suffix}</span>
                </span>
              </label>
            ))}
          </div>

          {saving && <p className="text-[11px] text-muted-foreground font-body">Enregistrement…</p>}
        </div>
      )}
    </Card>
  );
}

/* ---------------- 📱 NOTIFICATIONS PUSH ---------------- */

function PushCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState(await getPushState());
    setEndpoint(await currentEndpoint());
    try { setDevices(await listDevices()); } catch { /* lecture impossible */ }
    try { const s = await fetchSettings(); setPushEnabled(s.options?.push_enabled !== false); } catch { /* défaut */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const thisDevice = devices.find((d) => d.endpoint === endpoint) ?? null;

  const togglePush = async (v: boolean) => {
    setPushEnabled(v);
    try {
      const s = await fetchSettings();
      await saveSettings({ options: { ...s.options, push_enabled: v } });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    }
  };

  const activate = async () => {
    setBusy(true);
    try {
      await enablePush(Object.fromEntries(CATEGORIES.map((c) => [c, true])));
      await refresh();
      toast({ title: "Notifications activées", description: "Cet appareil est maintenant inscrit au Push." });
    } catch (e) {
      toast({ title: "Activation impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const deactivate = async () => {
    setBusy(true);
    try { await disablePush(); await refresh(); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await sendTestPush();
      setLastTestResult(res.sent > 0
        ? `✅ ${res.sent} envoi(s) sur ${res.devices} appareil(s)`
        : `⚠️ Aucun envoi (${res.devices} appareil(s) inscrit(s))`);
      toast({ title: "Test Vrac Québec", description: `${res.sent} notification(s) envoyée(s).` });
      await refresh();
    } catch (e) {
      setLastTestResult(`❌ ${(e as Error).message}`);
      toast({ title: "Test échoué", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const deviceStatus = (() => {
    if (state === "denied") return { label: "Erreur — bloqué", ok: false, warn: true };
    if (thisDevice?.is_enabled && state === "subscribed") return { label: "Actif", ok: true, warn: false };
    if (state === "subscribed") return { label: "En attente", ok: false, warn: false };
    return { label: "Non inscrit", ok: false, warn: false };
  })();

  return (
    <Card
      icon={<Smartphone className="w-4 h-4" />}
      title="Notifications Push"
      subtitle={deviceStatus.ok ? "🟢 Appareil connecté" : "🟠 Appareil non connecté"}
      defaultOpen
    >
      <div className="space-y-3 pt-1">
        <Row label="Notifications Push" hint="Coupe les envois sans supprimer les appareils">
          <Toggle checked={pushEnabled} onChange={(v) => void togglePush(v)} />
        </Row>

        {/* Cet appareil */}
        <div className="rounded-lg border border-border bg-background p-2.5 text-xs font-body space-y-1">
          <p className="font-display font-bold text-[11px] uppercase tracking-wide text-muted-foreground">Cet appareil</p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Nom</span>
            <span>{thisDevice ? deviceName(thisDevice) : deviceName({ label: null, user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "" })}</span></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Statut</span>
            <span><Dot ok={deviceStatus.ok} warn={deviceStatus.warn} /> {deviceStatus.label}</span></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Inscription</span>
            <span>{thisDevice ? formatWhen(thisDevice.created_at) : "—"}</span></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Dernier envoi réussi</span>
            <span>{thisDevice ? formatWhen(thisDevice.last_success_at) : "—"}</span></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Dernier test</span>
            <span>{thisDevice ? formatWhen(thisDevice.last_test_at) : "—"}</span></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Dernière erreur</span>
            <span className={thisDevice?.last_error ? "text-destructive" : ""}>{thisDevice?.last_error ?? "Aucune erreur récente"}</span></p>
          {lastTestResult && <p className="pt-1 border-t border-border/60">{lastTestResult}</p>}
        </div>

        {/* Actions */}
        {state === "needs_install" || (isIos() && !isStandalone()) ? (
          <p className="text-[11px] text-muted-foreground font-body leading-snug">
            Sur iPhone, ouvrez le CRM depuis l'icône installée sur l'écran d'accueil pour pouvoir activer le Push.
          </p>
        ) : state === "unsupported" ? (
          <p className="text-[11px] text-muted-foreground font-body">Ce navigateur ne prend pas en charge les notifications Push.</p>
        ) : state === "denied" ? (
          <p className="text-[11px] text-destructive font-body leading-snug">
            Les notifications sont bloquées sur cet appareil. Autorisez-les dans les réglages de votre iPhone.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {state === "subscribed" ? (
              <>
                <button onClick={test} disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold disabled:opacity-60 min-h-[40px]">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} 🔔 Envoyer une notification test
                </button>
                <button onClick={deactivate} disabled={busy}
                  className="px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-display font-semibold min-h-[40px]">
                  Désactiver cet appareil
                </button>
              </>
            ) : (
              <button onClick={activate} disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold disabled:opacity-60 min-h-[40px]">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />} Activer les notifications
              </button>
            )}
          </div>
        )}

        {/* Mes appareils */}
        {devices.length > 0 && (
          <div>
            <h3 className="font-display font-bold text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Mes appareils</h3>
            <div className="space-y-1">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-xs font-body">
                  <span className="min-w-0">
                    <span className="block font-display font-semibold truncate">
                      📱 {deviceName(d)} {d.endpoint === endpoint && <span className="text-primary">(cet appareil)</span>}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      <Dot ok={d.is_enabled} /> {d.is_enabled ? "Actif" : "Désactivé"} · Dernière activité {formatWhen(d.last_success_at ?? d.updated_at ?? d.created_at)}
                    </span>
                  </span>
                  <Toggle checked={d.is_enabled} onChange={async (v) => {
                    try { await setDeviceEnabled(d.id, v); await refresh(); }
                    catch (e) { toast({ title: "Modification impossible", description: (e as Error).message, variant: "destructive" }); }
                  }} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-secondary/60 p-2.5 text-[11px] font-body text-muted-foreground leading-snug">
          <p className="font-display font-bold text-foreground text-[11px] mb-1">Pour recevoir les notifications sur votre iPhone</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Ouvrez Vrac Québec depuis l'icône installée sur votre écran d'accueil.</li>
            <li>Activez les notifications lorsque l'iPhone le demande.</li>
            <li>Vérifiez qu'elles sont autorisées dans Réglages → Notifications → Vrac Québec.</li>
          </ol>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- 👤 COMPTE ---------------- */

function AccountCard({ email }: { email: string | null }) {
  const navigate = useNavigate();
  return (
    <Card icon={<UserIcon className="w-4 h-4" />} title="Compte" subtitle={email ?? "Administrateur"}>
      <div className="pt-1 text-xs font-body space-y-1">
        <p className="flex justify-between gap-2"><span className="text-muted-foreground">Courriel</span><span className="truncate">{email ?? "—"}</span></p>
        <p className="flex justify-between gap-2"><span className="text-muted-foreground">Statut</span><span>🟢 Administrateur actif</span></p>
        <button
          onClick={async () => { await supabase.auth.signOut(); navigate("/login", { replace: true }); }}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-display font-semibold min-h-[40px]"
        >
          <LogOut className="w-3.5 h-3.5" /> Déconnexion
        </button>
      </div>
    </Card>
  );
}

/* ---------------- 🔐 SÉCURITÉ ---------------- */

function SecurityCard() {
  return (
    <Card icon={<Shield className="w-4 h-4" />} title="Sécurité" subtitle="Mot de passe et sessions">
      <div className="pt-1 text-xs font-body space-y-1.5">
        <Link to="/mot-de-passe-oublie" className="inline-block text-primary font-display font-semibold">
          Réinitialiser le mot de passe →
        </Link>
        <p className="text-muted-foreground">
          La gestion des sessions actives et des appareils connectés sera ajoutée ici. Les appareils Push sont gérés
          dans la section Notifications Push.
        </p>
      </div>
    </Card>
  );
}

/* ---------------- ⚙️ PRÉFÉRENCES ---------------- */

function PreferencesCard() {
  return (
    <Card icon={<Settings className="w-4 h-4" />} title="Préférences" subtitle="Langue et affichage">
      <div className="pt-1 text-xs font-body space-y-1">
        <p className="flex justify-between gap-2"><span className="text-muted-foreground">Langue</span><span>Français (Québec)</span></p>
        <p className="flex justify-between gap-2"><span className="text-muted-foreground">Thème</span><span>Vrac Québec</span></p>
        <p className="text-[10px] text-muted-foreground">D'autres préférences générales seront ajoutées ici.</p>
      </div>
    </Card>
  );
}
