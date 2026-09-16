// ============================================================
// CRM-01 — Paramètres plateforme Vrac Québec (administration globale).
// Distinct du back office de l'entreprise sélectionnée (/admin/jsc).
// Aucun paiement réel, aucun abonnement réel, aucune communication.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, Check, CircleSlash, ExternalLink, Layers,
  Loader2, Plug, RefreshCw, Save, Settings2, Tags, Users, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import UniversalNav from "@/components/UniversalNav";
import { isFeatureEnabled, type FeatureFlag, FEATURE_FLAGS } from "@/lib/flags";
import {
  fetchPlans, savePlan, fetchSectors, createSector, setSectorActive,
  fetchCompanies, fetchCompanySectors, toggleCompanySector,
  fetchSubscriptions, fetchPlatformCounters, fetchChangeLog, fetchBillingEvents,
  type Sector, type Company, type PlatformCounters,
} from "@/lib/platform/api";
import { resyncSubscription } from "@/lib/platform/subscription";
import {
  featureMatrix, formatBusinessDateTime, formatPrice, intervalLabel,
  planCompleteness, subscriptionMetrics, type PlatformPlan, type PlatformSubscription,
} from "@/lib/platform/plans";

type TabId = "general" | "entreprises" | "secteurs" | "forfaits" | "notifications" | "integrations";

const TABS: { id: TabId; label: string; Icon: typeof Settings2 }[] = [
  { id: "general", label: "Général", Icon: Settings2 },
  { id: "entreprises", label: "Entreprises et accès", Icon: Building2 },
  { id: "secteurs", label: "Secteurs et services", Icon: Tags },
  { id: "forfaits", label: "Forfaits et abonnements", Icon: Wallet },
  { id: "notifications", label: "Notifications", Icon: Users },
  { id: "integrations", label: "Intégrations", Icon: Plug },
];

const card = "rounded-xl border border-border bg-card p-4";

/** Un chiffre indisponible n'est jamais affiché comme 0. */
function Counter({
  label, value, state, to, hint,
}: { label: string; value: number | null; state: "loading" | "error" | "ready"; to?: string; hint?: string }) {
  const body = (
    <>
      <p className="text-2xl font-display font-bold leading-none">
        {state === "loading" ? "…" : state === "error" ? "Erreur" : value === null ? "À configurer" : value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>}
    </>
  );
  const cls = `${card} block text-left ${to ? "hover:border-primary transition-colors" : ""}`;
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default function AdminPlatformSettings() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("section"))?.id ?? "general") as TabId;
  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set("section", id);
    setParams(next, { replace: false });
  };

  const [counters, setCounters] = useState<PlatformCounters | null>(null);
  const [countersState, setCountersState] = useState<"loading" | "error" | "ready">("loading");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [companySectors, setCompanySectors] = useState<string[]>([]);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [subs, setSubs] = useState<PlatformSubscription[]>([]);
  const [log, setLog] = useState<Awaited<ReturnType<typeof fetchChangeLog>>>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof fetchBillingEvents>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSector, setNewSector] = useState("");

  // Forfait en cours d'édition
  const [draft, setDraft] = useState<PlatformPlan | null>(null);
  const [priceInput, setPriceInput] = useState("");

  useEffect(() => {
    if (isReady && !user) navigate("/login", { replace: true });
  }, [isReady, user, navigate]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setCountersState("loading");
    try {
      const [cs, sec, pl, sb, lg, ev] = await Promise.all([
        fetchCompanies(), fetchSectors(), fetchPlans(), fetchSubscriptions(), fetchChangeLog(),
        fetchBillingEvents().catch(() => []),
      ]);
      setCompanies(cs);
      setCompanyId((prev) => prev ?? cs.find((c) => c.is_default)?.id ?? cs[0]?.id ?? null);
      setSectors(sec); setPlans(pl); setSubs(sb); setLog(lg); setEvents(ev);
      const first = pl.find((p) => p.slug === "entrepreneur-pro") ?? pl[0] ?? null;
      setDraft(first);
      setPriceInput(first?.price_cents != null ? String(first.price_cents / 100) : "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
    try {
      setCounters(await fetchPlatformCounters());
      setCountersState("ready");
      setRefreshedAt(new Date());
    } catch {
      setCountersState("error");
    }
  }, []);

  useEffect(() => { if (isAdmin) void loadAll(); }, [isAdmin, loadAll]);

  // Changement d'organisation : on recharge les données rattachées.
  useEffect(() => {
    if (!companyId) { setCompanySectors([]); return; }
    let active = true;
    fetchCompanySectors(companyId)
      .then((ids) => { if (active) setCompanySectors(ids); })
      .catch(() => { if (active) setCompanySectors([]); });
    return () => { active = false; };
  }, [companyId]);

  const metrics = useMemo(() => subscriptionMetrics(subs, plans), [subs, plans]);
  const completeness = useMemo(() => planCompleteness(draft ?? {}), [draft]);
  const matrix = useMemo(
    () => featureMatrix(draft, (key) =>
      key in FEATURE_FLAGS ? isFeatureEnabled(key as FeatureFlag) : true),
    [draft],
  );

  const mapsConnected = Boolean(import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY);

  const savePlanDraft = async (status?: PlatformPlan["status"]) => {
    if (!draft) return;
    const price = priceInput.trim() === "" ? null : Math.round(Number(priceInput) * 100);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      toast.error("Prix invalide.");
      return;
    }
    const next = { ...draft, price_cents: price, status: status ?? draft.status };
    const check = planCompleteness(next);
    if (next.status === "active" && !check.canActivate) {
      toast.error(`Forfait incomplet : ${check.missing.join(", ")}.`);
      return;
    }
    setSaving(true);
    try {
      const saved = await savePlan(next);
      setDraft(saved);
      setPriceInput(saved.price_cents != null ? String(saved.price_cents / 100) : "");
      setPlans((prev) => prev.map((p) => (p.slug === saved.slug ? saved : p)));
      setLog(await fetchChangeLog());
      toast.success("Forfait enregistré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  if (!isReady || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <UniversalNav />
        <div className="mx-auto max-w-lg p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h1 className="font-display text-xl font-bold">Accès réservé</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seule l'administration Vrac Québec peut ouvrir les paramètres de la plateforme.
          </p>
        </div>
      </div>
    );
  }

  const cState = countersState;

  return (
    <div className="min-h-screen bg-background">
      <UniversalNav />
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold sm:text-2xl">Paramètres plateforme</h1>
            <p className="text-sm text-muted-foreground">
              Administration Vrac Québec : organisations, secteurs, forfaits et activité globale.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadAll()}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-display font-semibold"
            >
              <RefreshCw className="h-4 w-4" /> Actualiser
            </button>
            <Link
              to="/admin/jsc"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-display font-semibold text-primary-foreground"
            >
              <Building2 className="h-4 w-4" /> Back office de l'entreprise
            </Link>
          </div>
        </header>

        {/* Onglets défilables sur mobile */}
        <nav className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-display font-semibold ${
                  tab === id ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </nav>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="space-y-6">
            {/* ------------------------------ GÉNÉRAL ------------------------------ */}
            {tab === "general" && (
              <>
                <p className="text-xs text-muted-foreground">
                  Périmètre : toute la plateforme · Période : cumulatif · Fuseau horaire des périodes
                  métier : America/Toronto · Dernière actualisation :{" "}
                  {refreshedAt ? formatBusinessDateTime(refreshedAt) : "—"}
                </p>

                <section className="space-y-2">
                  <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    À traiter
                  </h2>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Counter label="Demandes en attente (Transport JSC)" value={counters?.jscRequestsPending ?? null}
                      state={cState} to="/admin/jsc" hint="jsc_requests · statut « nouvelle »" />
                    <Counter label="Relances échues" value={counters?.followUpsOverdue ?? null}
                      state={cState} to="/admin?tri=suivi_urgent" hint="submissions · next_follow_up_at passé" />
                    <Counter label="Soumissions à suivre" value={counters?.quotesToFollow ?? null}
                      state={cState} to="/admin/jsc" hint="jsc_quotes · statut « envoyée »" />
                    <Counter label="Opérations à planifier" value={counters?.ordersToPlan ?? null}
                      state={cState} to="/admin/jsc" hint="jsc_orders · statut « à planifier »" />
                  </div>
                </section>

                <section className="space-y-2">
                  <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    Activité de la plateforme
                  </h2>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Counter label="Demandes au total" value={counters?.submissionsTotal ?? null} state={cState} to="/admin" hint="submissions" />
                    <Counter label="Demandes de remblai (dompes)" value={counters?.remblai ?? null} state={cState} to="/admin" hint="submissions · type remblai" />
                    <Counter label="Demandes vrac et livraison" value={counters?.vrac ?? null} state={cState} to="/admin" hint="submissions · autres types" />
                    <Counter label="Clients actifs (Transport JSC)" value={counters?.jscClientsActive ?? null} state={cState} to="/admin/jsc" hint="jsc_clients actifs" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Les demandes de la plateforme (submissions) et les dossiers du back office Transport JSC
                    (jsc_*) sont deux périmètres distincts : leurs totaux ne se recoupent pas.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    Revenus (périmètres séparés)
                  </h2>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Counter label="Abonnés payants actifs" value={metrics.payingActive} state="ready" hint="platform_subscriptions actifs hors test" />
                    <div className={card}>
                      <p className="text-2xl font-display font-bold leading-none">
                        {metrics.mrrCents === null ? "À configurer" : formatPrice(metrics.mrrCents)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Revenu mensuel récurrent</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/80">Somme des abonnements actifs (année ÷ 12)</p>
                    </div>
                    <div className={card}>
                      <p className="text-2xl font-display font-bold leading-none">
                        {metrics.nextDueDates[0]
                          ? new Date(metrics.nextDueDates[0].date).toLocaleDateString("fr-CA")
                          : "À configurer"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Prochaine échéance</p>
                    </div>
                    <Counter label="Paiements en échec" value={metrics.failedPayments} state="ready" hint="Aucun paiement réel n'est activé" />
                  </div>
                  <div className={`${card} text-xs text-muted-foreground`}>
                    <p className="mb-1 font-semibold text-foreground">Comment les montants sont calculés</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li><b>Revenus d'abonnement Vrac Québec</b> : montants des abonnements mensuels aux forfaits (platform_subscriptions × platform_plans). Source à configurer, aucun paiement branché.</li>
                      <li><b>Revenus Transport JSC</b> : montants des soumissions acceptées et des factures de l'entreprise (jsc_quotes, jsc_invoices) — visibles dans son back office.</li>
                      <li><b>Encaissements</b> : paiements réellement reçus (payments) — distincts des montants facturés.</li>
                      <li><b>Travaux des partenaires</b> : montants des mandats du réseau (mkt_*) — ne sont pas des revenus Vrac Québec.</li>
                    </ul>
                  </div>
                </section>
              </>
            )}

            {/* -------------------------- ENTREPRISES -------------------------- */}
            {tab === "entreprises" && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm text-muted-foreground">Entreprise sélectionnée</label>
                  <select
                    value={companyId ?? ""}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="divide-y rounded-xl border border-border bg-card">
                  {companies.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {companySectors.length && c.id === companyId
                            ? `${companySectors.length} secteur(s)`
                            : "Secteurs à configurer"}
                        </p>
                      </div>
                      <Link to="/admin/jsc" className="flex items-center gap-1 text-sm font-semibold text-primary">
                        Ouvrir le back office <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Les droits sont vérifiés sur le serveur : changer un identifiant d'entreprise dans l'URL
                  ne donne jamais accès aux données privées d'une autre entreprise. Les demandes partagées
                  de la plateforme restent accessibles selon les règles existantes.
                </p>
              </section>
            )}

            {/* ---------------------------- SECTEURS ---------------------------- */}
            {tab === "secteurs" && (
              <section className="space-y-4">
                <div className={card}>
                  <p className="mb-2 text-sm font-semibold">Ajouter un secteur</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={newSector}
                      onChange={(e) => setNewSector(e.target.value)}
                      placeholder="Ex. Excavation"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
                    />
                    <button
                      disabled={!newSector.trim() || saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const s = await createSector(newSector, null);
                          setSectors((p) => [...p, s].sort((a, b) => a.name.localeCompare(b.name)));
                          setNewSector("");
                          setLog(await fetchChangeLog());
                          toast.success("Secteur créé.");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Création impossible");
                        } finally { setSaving(false); }
                      }}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-display font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>

                {sectors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun secteur défini pour l'instant.</p>
                ) : (
                  <div className="divide-y rounded-xl border border-border bg-card">
                    {sectors.map((s) => {
                      const on = companySectors.includes(s.id);
                      return (
                        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.is_active ? "Actif" : "Inactif"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  await setSectorActive(s.id, !s.is_active);
                                  setSectors((p) => p.map((x) => (x.id === s.id ? { ...x, is_active: !s.is_active } : x)));
                                } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
                              }}
                              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold"
                            >
                              {s.is_active ? "Désactiver" : "Activer"}
                            </button>
                            <button
                              disabled={!companyId}
                              onClick={async () => {
                                if (!companyId) return;
                                try {
                                  await toggleCompanySector(companyId, s.id, !on);
                                  setCompanySectors((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]));
                                } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
                              }}
                              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                                on ? "bg-primary text-primary-foreground" : "border border-border"
                              }`}
                            >
                              {on ? "Retiré de l'entreprise" : "Ajouter à l'entreprise"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Une entreprise peut appartenir à plusieurs secteurs. Le catalogue de services du réseau
                  (catégories de la place de marché) reste géré dans son propre module.
                </p>
              </section>
            )}

            {/* ---------------------------- FORFAITS ---------------------------- */}
            {tab === "forfaits" && draft && (
              <section className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setDraft(p);
                        setPriceInput(p.price_cents != null ? String(p.price_cents / 100) : "");
                      }}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        draft.id === p.id ? "bg-primary text-primary-foreground" : "border border-border bg-secondary"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                {/* CRM-02 — Suivi des abonnements de test (aucune facture déclarée payée sans preuve). */}
                <div className={`${card} space-y-2`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                      Abonnements (suivi)
                    </h3>
                    <button
                      onClick={async () => {
                        try {
                          const r = await resyncSubscription();
                          toast.success(`Resynchronisation : ${r.synced} abonnement(s).`);
                          setSubs(await fetchSubscriptions());
                          setEvents(await fetchBillingEvents());
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Resynchronisation impossible");
                        }
                      }}
                      className="min-h-[44px] rounded-lg border border-border px-3 text-sm inline-flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" /> Resynchroniser
                    </button>
                  </div>
                  {subs.length === 0 && (
                    <p className="text-sm text-muted-foreground">Aucun abonnement enregistré. Les essais ne comptent pas dans les revenus réels.</p>
                  )}
                  <div className="overflow-x-auto">
                    {subs.length > 0 && (
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="py-1">Entreprise</th><th>Environnement</th><th>Version</th>
                            <th>État</th><th>Échéance</th><th>Annulation</th><th>Dernière synchro.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subs.map((s) => (
                            <tr key={s.id} className="border-t border-border">
                              <td className="py-1">{companies.find((c) => c.id === s.company_id)?.name ?? s.company_id}</td>
                              <td>{s.environment ?? "—"}</td>
                              <td>{s.plan_version ?? "—"}</td>
                              <td>{s.status}{s.last_error ? " (erreur)" : ""}</td>
                              <td>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("fr-CA") : "—"}</td>
                              <td>{s.cancel_at_period_end ? "programmée" : "—"}</td>
                              <td>{s.last_synced_at ? new Date(s.last_synced_at).toLocaleString("fr-CA") : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Derniers événements du prestataire : {events.length === 0 ? "aucun" : events.slice(0, 5).map((e) => `${e.event_type} (${e.status})`).join(" · ")}
                  </p>
                </div>


                <div className={`${card} space-y-3`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-muted-foreground">Nom</span>
                      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-muted-foreground">Identifiant stable</span>
                      <input value={draft.slug} readOnly
                        className="h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground" />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted-foreground">Description</span>
                    <textarea value={draft.description ?? ""} rows={3}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background p-2 text-sm" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm">
                      <span className="mb-1 block text-muted-foreground">Prix (CAD, vide = à définir)</span>
                      <input value={priceInput} inputMode="decimal" placeholder="À définir"
                        onChange={(e) => setPriceInput(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-muted-foreground">Facturation</span>
                      <select value={draft.billing_interval}
                        onChange={(e) => setDraft({ ...draft, billing_interval: e.target.value as "month" | "year" })}
                        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                        <option value="month">Mensuelle (par entreprise)</option>
                        <option value="year">Annuelle</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-muted-foreground">Statut</span>
                      <select value={draft.status}
                        onChange={(e) => setDraft({ ...draft, status: e.target.value as PlatformPlan["status"] })}
                        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                        <option value="draft">Brouillon</option>
                        <option value="active" disabled={!completeness.canActivate}>Actif</option>
                        <option value="archived">Archivé</option>
                      </select>
                    </label>
                  </div>

                  <div>
                    <p className="mb-1.5 text-sm text-muted-foreground">Fonctionnalités incluses</p>
                    <div className="flex flex-wrap gap-1.5">
                      {matrix.map((f) => (
                        <button key={f.key}
                          onClick={() => setDraft({
                            ...draft,
                            features: f.included
                              ? draft.features.filter((x) => x !== f.key)
                              : [...draft.features, f.key],
                          })}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            f.included ? "bg-primary text-primary-foreground" : "border border-border bg-secondary"
                          }`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!completeness.canActivate && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Incomplet — manque : {completeness.missing.join(", ")}. Activation impossible.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button disabled={saving} onClick={() => void savePlanDraft("draft")}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-display font-semibold text-primary-foreground disabled:opacity-50">
                      <Save className="h-4 w-4" /> Enregistrer le brouillon
                    </button>
                    <button disabled={saving} onClick={() => void loadAll()}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-display font-semibold">
                      <RefreshCw className="h-4 w-4" /> Recharger
                    </button>
                  </div>
                </div>

                {/* Aperçu de l'offre */}
                <div className={`${card} border-primary/40`}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Aperçu de l'offre</p>
                  <p className="mt-1 font-display text-lg font-bold">{draft.name}</p>
                  <p className="text-sm text-muted-foreground">{draft.description}</p>
                  <p className="mt-2 font-display text-2xl font-bold">
                    {formatPrice(priceInput.trim() === "" ? null : Math.round(Number(priceInput) * 100), draft.currency)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {intervalLabel(draft.billing_interval)} / entreprise
                    </span>
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {matrix.filter((f) => f.included).map((f) => (
                      <li key={f.key} className="flex items-center gap-1.5">
                        <Check className="h-4 w-4 text-primary" /> {f.label}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Matrice */}
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Fonctionnalité</th>
                        <th className="p-2">Disponible</th>
                        <th className="p-2">Activée</th>
                        <th className="p-2">Incluse au forfait</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {matrix.map((f) => (
                        <tr key={f.key}>
                          <td className="p-2">{f.label}</td>
                          {[f.available, f.enabled, f.included].map((v, i) => (
                            <td key={i} className="p-2 text-center">
                              {v ? <Check className="mx-auto h-4 w-4 text-primary" />
                                 : <CircleSlash className="mx-auto h-4 w-4 text-muted-foreground" />}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={`${card} text-xs text-muted-foreground`}>
                  <p className="mb-1 font-semibold text-foreground">Hypothèses commerciales (non appliquées)</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>Accès demandeur gratuit : déposer une demande de remblai reste gratuit, sans limite de matériaux.</li>
                    <li>Option « Gestion » : module payant additionnel à définir ultérieurement.</li>
                    <li>Les droits réels dépendront de l'organisation, du rôle et de l'abonnement, vérifiés sur le serveur.</li>
                  </ul>
                </div>
              </section>
            )}

            {/* -------------------------- NOTIFICATIONS -------------------------- */}
            {tab === "notifications" && (
              <section className="space-y-3">
                <div className={card}>
                  <p className="text-sm font-semibold">Réglages de notifications</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Les préférences, appareils et gabarits existants restent gérés dans leurs pages dédiées.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to="/admin/settings" className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-semibold">
                      Préférences et appareils
                    </Link>
                    <Link to="/admin/notifications" className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-semibold">
                      Centre de notifications
                    </Link>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aucune communication n'est envoyée depuis cette page.
                </p>
              </section>
            )}

            {/* --------------------------- INTÉGRATIONS --------------------------- */}
            {tab === "integrations" && (
              <section className="space-y-3">
                {[
                  { name: "Google Maps", ok: mapsConnected, detail: mapsConnected ? "Clé navigateur détectée." : "Non connectée : distances et géolocalisation indisponibles." },
                  { name: "Paiements d'abonnement", ok: false, detail: "À configurer — aucun fournisseur de paiement n'est branché." },
                ].map((i) => (
                  <div key={i.name} className={`${card} flex flex-wrap items-center justify-between gap-2`}>
                    <div>
                      <p className="text-sm font-semibold">{i.name}</p>
                      <p className="text-xs text-muted-foreground">{i.detail}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      i.ok ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {i.ok ? "Connectée" : "À configurer"}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Aucun formulaire n'est affiché pour une intégration absente; les clés restent côté serveur.
                </p>
              </section>
            )}

            {/* --------------------------- JOURNAL --------------------------- */}
            <section className="space-y-2">
              <h2 className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <Layers className="h-4 w-4" /> Journal des changements
              </h2>
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun changement enregistré.</p>
              ) : (
                <div className="divide-y rounded-xl border border-border bg-card text-sm">
                  {log.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                      <span className="min-w-0 truncate">
                        <b>{l.scope}</b> · {l.action} · {l.entity_table}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {l.actor_email ?? "—"} · {formatBusinessDateTime(new Date(l.created_at))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
