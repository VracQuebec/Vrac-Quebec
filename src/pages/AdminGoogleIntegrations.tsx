import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, RefreshCw, Loader2, ExternalLink,
  Search, Gauge, BarChart3, Building2, Tag, Megaphone, ShoppingBag, LineChart,
} from "lucide-react";

type SyncState = {
  lastSyncAt: string | null;
  count: number;
  error: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  return d.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminGoogleIntegrations() {
  const { isReady: authReady, user } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const navigate = useNavigate();

  const [gsc, setGsc] = useState<SyncState>({ lastSyncAt: null, count: 0, error: null });
  const [psi, setPsi] = useState<SyncState>({ lastSyncAt: null, count: 0, error: null });
  const [ga4, setGa4] = useState<SyncState>({ lastSyncAt: null, count: 0, error: null });
  const [syncing, setSyncing] = useState<"gsc" | "psi" | "ga4" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authReady && !user) navigate("/login");
    if (authReady && user && !roleLoading && !isAdmin) navigate("/");
  }, [authReady, user, isAdmin, roleLoading, navigate]);

  const loadStatus = async () => {
    setLoading(true);
    const [gscRes, psiRes, gaRes] = await Promise.all([
      supabase.from("seo_gsc_metrics").select("fetched_at", { count: "exact", head: false })
        .order("fetched_at", { ascending: false }).limit(1),
      supabase.from("seo_pagespeed_snapshots").select("fetched_at", { count: "exact", head: false })
        .order("fetched_at", { ascending: false }).limit(1),
      supabase.from("ga4_page_metrics").select("fetched_at", { count: "exact", head: false })
        .order("fetched_at", { ascending: false }).limit(1),
    ]);
    setGsc({
      lastSyncAt: gscRes.data?.[0]?.fetched_at ?? null,
      count: gscRes.count ?? 0,
      error: gscRes.error?.message ?? null,
    });
    setPsi({
      lastSyncAt: psiRes.data?.[0]?.fetched_at ?? null,
      count: psiRes.count ?? 0,
      error: psiRes.error?.message ?? null,
    });
    setGa4({
      lastSyncAt: gaRes.data?.[0]?.fetched_at ?? null,
      count: gaRes.count ?? 0,
      error: gaRes.error?.message ?? null,
    });
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) loadStatus(); }, [isAdmin]);

  const runSync = async (which: "gsc" | "psi" | "ga4") => {
    setSyncing(which);
    try {
      const fn = which === "gsc" ? "seo-gsc-sync" : which === "psi" ? "seo-pagespeed" : "ga4-sync";
      const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { ok?: boolean; error?: string; upserts?: number; measured?: number; page_upserts?: number; hint?: string }>(fn, {});
      if (error) throw new Error((error as Error).message || "Erreur de synchronisation");
      if (data?.error) throw new Error(data.hint ? `${data.error}\n${data.hint}` : data.error);
      toast.success(which === "gsc"
        ? `Search Console synchronisé (${data?.upserts ?? 0} enregistrements).`
        : which === "psi"
          ? `PageSpeed mesuré (${data?.measured ?? 0} URLs).`
          : `Google Analytics synchronisé (${data?.page_upserts ?? 0} pages).`);
      await loadStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSyncing(null);
    }
  };

  if (!isAdmin) return null;

  const active: Array<{ id: "gsc" | "psi" | "ga4"; title: string; desc: string; icon: typeof Search; state: SyncState; schedule: string }> = [
    {
      id: "gsc",
      title: "Google Search Console",
      desc: "Impressions, clics, CTR, position, requêtes, indexation — propriété sc-domain:vracquebec.ca.",
      icon: Search,
      state: gsc,
      schedule: "Automatique tous les jours à 05h15",
    },
    {
      id: "ga4",
      title: "Google Analytics 4",
      desc: "Utilisateurs, sessions, pages vues, taux d'engagement, conversions, sources — propriété GA4 546980703 (G-T6HYZVY8E0).",
      icon: LineChart,
      state: ga4,
      schedule: "Automatique tous les jours à 05h30",
    },
    {
      id: "psi",
      title: "Core Web Vitals (PageSpeed Insights)",
      desc: "LCP, CLS, INP, TTFB, score de performance mobile — API publique Google (aucune clé requise).",
      icon: Gauge,
      state: psi,
      schedule: "Automatique tous les jours à 05h45",
    },
  ];

  const notAvailable = [
    { title: "Google Business Profile", icon: Building2, why: "Pas de connecteur Lovable. OAuth custom requis (Google My Business API)." },
    { title: "Google Tag Manager", icon: Tag, why: "Se configure côté conteneur GTM. Ajout d'un ID GTM au site possible sur demande." },
    { title: "Google Ads", icon: Megaphone, why: "Pas de connecteur Lovable. OAuth + developer token requis." },
    { title: "Merchant Center", icon: ShoppingBag, why: "Pas pertinent (Vrac Québec n'est pas un e-commerce)." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/admin/seo" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> SEO
          </Link>
          <h1 className="text-lg font-display font-bold text-foreground">Intégrations Google</h1>
          <button onClick={loadStatus} disabled={loading}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs font-semibold disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Actualiser le statut
          </button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-8 max-w-4xl">
        <section>
          <h2 className="text-sm uppercase tracking-wider font-display font-bold text-muted-foreground mb-3">Connectées</h2>
          <div className="space-y-3">
            {active.map((c) => {
              const Icon = c.icon;
              const ok = !c.state.error && c.state.count > 0;
              return (
                <div key={c.id} className="bg-card border border-border rounded-lg p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${ok ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-foreground">{c.title}</h3>
                        {ok
                          ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary"><CheckCircle2 className="w-3 h-3" /> Actif</span>
                          : c.state.lastSyncAt
                            ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600">En attente</span>
                            : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"><XCircle className="w-3 h-3" /> Aucune donnée</span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{c.desc}</p>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="text-muted-foreground">Dernière synchro</div>
                          <div className="font-semibold text-foreground">{formatDate(c.state.lastSyncAt)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Enregistrements</div>
                          <div className="font-semibold text-foreground">{c.state.count.toLocaleString("fr-CA")}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Planification</div>
                          <div className="font-semibold text-foreground">{c.schedule}</div>
                        </div>
                      </div>
                      {c.state.error && (
                        <div className="mt-3 text-xs text-destructive bg-destructive/10 rounded p-2">{c.state.error}</div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => runSync(c.id)} disabled={syncing !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                          {syncing === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Synchroniser maintenant
                        </button>
                        {c.id === "gsc" && (
                          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs font-semibold">
                            <ExternalLink className="w-3.5 h-3.5" /> Ouvrir GSC
                          </a>
                        )}
                        {c.id === "ga4" && (
                          <a href="https://analytics.google.com/analytics/web/#/p546980703/reports/intelligenthome" target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs font-semibold">
                            <ExternalLink className="w-3.5 h-3.5" /> Ouvrir GA4
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wider font-display font-bold text-muted-foreground mb-3">Non branchées</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {notAvailable.map((n) => {
              const Icon = n.icon;
              return (
                <div key={n.title} className="bg-card border border-dashed border-border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm text-foreground">{n.title}</div>
                      <p className="text-xs text-muted-foreground mt-1">{n.why}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Les jetons OAuth et clés API sont stockés chiffrés côté Lovable. La reconnexion se fait via <b>Paramètres du projet → Intégrations</b>.
          </p>
        </section>
      </div>
    </div>
  );
}