import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";
import {
  ArrowLeft, LayoutDashboard, MapPin, Package, Wrench, Sparkles, Lightbulb,
  Loader2, Plus, Trash2, Play, Pause, RotateCcw, Save, ExternalLink, Gauge, RefreshCw,
  FileText, Zap, ListChecks, Search as SearchIcon, TrendingUp, Download, Building2,
} from "lucide-react";
import PriorityStars, { priorityLabel } from "@/components/seo/PriorityStars";
import CoverageMatrix from "@/components/seo/CoverageMatrix";
import TerritorialCoverage from "@/components/seo/TerritorialCoverage";
import PublicationDashboard from "@/components/seo/PublicationDashboard";
import SeoIntelligence from "@/components/seo/SeoIntelligence";
import GbpDashboard from "@/components/seo/GbpDashboard";
import ConversionsTable from "@/components/seo/ConversionsTable";
import CommandCenter from "@/components/seo/CommandCenter";
import CopilotDashboard from "@/components/seo/CopilotDashboard";
import ImproveDialog from "@/components/seo/ImproveDialog";
import OptimizeDialog from "@/components/seo/OptimizeDialog";
import BulkOptimizationPanel from "@/components/seo/BulkOptimizationPanel";
import PageHistoryDialog from "@/components/seo/PageHistoryDialog";
import OptimizationEngine from "@/components/seo/OptimizationEngine";
import RecommendationCard, { type Reco } from "@/components/seo/RecommendationCard";
import HealthScoreGauge from "@/components/seo/HealthScoreGauge";
import GoalCard, { type Goal } from "@/components/seo/GoalCard";
import QaReportBadge from "@/components/seo/QaReportBadge";
import TabBoundary from "@/components/seo/TabBoundary";

type Tab = "copilot" | "dashboard" | "assistant" | "production" | "optimizer" | "goals" | "competitors" | "pages" | "publication" | "intelligence" | "coverage" | "territory" | "conversions" | "cities" | "materials" | "uses" | "services" | "generator" | "suggestions" | "analytics" | "gsc" | "gbp" | "blog";

type City = {
  id: string; slug: string; name: string; region: string;
  latitude: number | null; longitude: number | null; population: number | null;
  intro: string | null; neighbors: string[]; active: boolean; sort_order: number;
};
type Material = {
  id: string; slug: string; name: string; short_name: string; description: string;
  keywords: string[]; use_cases: string[]; delivery_unit: string; related_materials: string[];
  active: boolean; sort_order: number;
};
type Use = {
  id: string; slug: string; material_slug: string; name: string; description: string;
  active: boolean; sort_order: number;
};
type Service = { id: string; slug: string; name: string; short_name: string | null; description: string; keywords: string[]; active: boolean; sort_order: number };
type Page = { id: string; slug: string; city_slug: string; material_slug: string | null; service_slug: string | null; title: string; status: string; last_generated_at: string | null; created_at: string; view_count: number; seo_score?: number | null; word_count?: number | null; internal_link_count?: number | null; needs_refresh?: boolean;
  proc_status?: string | null; proc_kind?: string | null; proc_started_at?: string | null; proc_finished_at?: string | null; proc_error?: string | null; proc_result?: Record<string, unknown> | null };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

export default function AdminSeoManager() {
  const { isReady: authReady, user } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [remountKey, setRemountKey] = useState(0);

  useEffect(() => {
    if (authReady && !user) navigate("/login");
    if (authReady && user && !roleLoading && !isAdmin) navigate("/");
  }, [authReady, user, isAdmin, roleLoading, navigate]);

  const tabGroups: Array<{ title: string; tabs: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> }> = [
    {
      title: "Pilotage",
      tabs: [
        { id: "copilot", label: "Copilote IA", icon: Sparkles },
        { id: "dashboard", label: "Centre de pilotage", icon: LayoutDashboard },
        { id: "production", label: "File de production", icon: Play },
        { id: "optimizer", label: "Moteur d'optimisation", icon: Zap },
      ],
    },
    {
      title: "Pages & performance",
      tabs: [
        { id: "pages", label: "Pages", icon: ListChecks },
        { id: "publication", label: "Publication", icon: FileText },
        { id: "intelligence", label: "SEO Intelligence", icon: Sparkles },
        { id: "analytics", label: "Analyse SEO", icon: Gauge },
        { id: "gsc", label: "Search Console", icon: TrendingUp },
        { id: "conversions", label: "Conversions", icon: TrendingUp },
        { id: "gbp", label: "Google Business", icon: Building2 },
      ],
    },
    {
      title: "Couverture & objectifs",
      tabs: [
        { id: "territory", label: "Territoire", icon: MapPin },
        { id: "coverage", label: "Couverture", icon: LayoutDashboard },
        { id: "goals", label: "Objectifs", icon: TrendingUp },
        { id: "competitors", label: "Concurrents", icon: SearchIcon },
      ],
    },
    {
      title: "Intelligence",
      tabs: [
        { id: "assistant", label: "Assistant IA", icon: Sparkles },
        { id: "suggestions", label: "Suggestions", icon: Lightbulb },
      ],
    },
    {
      title: "Contenu & référentiels",
      tabs: [
        { id: "generator", label: "Générateur", icon: Sparkles },
        { id: "blog", label: "Blogue", icon: FileText },
        { id: "cities", label: "Villes", icon: MapPin },
        { id: "materials", label: "Matériaux", icon: Package },
        { id: "uses", label: "Usages", icon: Wrench },
        { id: "services", label: "Services", icon: Wrench },
      ],
    },
  ];

  const allTabs = useMemo(() => tabGroups.flatMap((g) => g.tabs), [tabGroups]);
  const requested = searchParams.get("tab") as Tab | null;
  const tab: Tab = allTabs.some((t) => t.id === requested) ? (requested as Tab) : "copilot";
  const currentLabel = allTabs.find((t) => t.id === tab)?.label ?? "SEO";

  const setTab = useCallback(
    (id: Tab) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      }, { replace: false });
    },
    [setSearchParams],
  );

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky-below-nav z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> CRM
          </Link>
          <h1 className="text-lg font-display font-bold text-foreground">SEO</h1>
          <Link
            to="/admin/ai-economy"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold"
            title="Consommation IA, cache et mode Économie maximale"
          >
            <Zap className="w-3.5 h-3.5" /> Économie IA
          </Link>
          <Link
            to="/admin/integrations-google"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs font-semibold"
            title="Statut des intégrations Google (Search Console, PageSpeed)"
          >
            <TrendingUp className="w-3.5 h-3.5" /> Intégrations Google
          </Link>
        </div>
      </header>
      <div className="container mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
        <nav
          aria-label="Sections SEO"
          className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-hidden md:sticky md:top-[4.5rem] md:max-h-[calc(100vh-6rem)] md:overflow-y-auto md:overscroll-contain md:pr-1 [-webkit-overflow-scrolling:touch]"
        >
          {tabGroups.map((group) => (
            <div key={group.title} className="md:mb-3 flex md:block gap-1">
              <div className="hidden md:block text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground/70 px-3 pt-1 pb-1">
                {group.title}
              </div>
              {group.tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-display font-semibold whitespace-nowrap ${
                    tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                  }`}>
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className="min-w-0">
          <TabBoundary key={`${tab}-${remountKey}`} label={currentLabel} onRetry={() => setRemountKey((k) => k + 1)}>
            {tab === "copilot" && <CopilotDashboard />}
            {tab === "dashboard" && <CommandCenter />}
            {tab === "assistant" && <AssistantTab />}
            {tab === "production" && <ProductionTab />}
            {tab === "optimizer" && <OptimizationEngine />}
            {tab === "goals" && <GoalsTab />}
            {tab === "competitors" && <CompetitorsTab />}
            {tab === "pages" && <PagesTab />}
            {tab === "publication" && <PublicationDashboard />}
            {tab === "intelligence" && <SeoIntelligence />}
            {tab === "coverage" && <CoverageMatrix />}
            {tab === "territory" && <TerritorialCoverage />}
            {tab === "conversions" && <ConversionsTable />}
            {tab === "cities" && <CitiesTab />}
            {tab === "materials" && <MaterialsTab />}
            {tab === "uses" && <UsesTab />}
            {tab === "services" && <ServicesTab />}
            {tab === "generator" && <GeneratorTab />}
            {tab === "analytics" && <AnalyticsTab />}
            {tab === "gsc" && <GscTab />}
            {tab === "gbp" && <GbpDashboard />}
            {tab === "suggestions" && <SuggestionsTab />}
            {tab === "blog" && <BlogTab />}
          </TabBoundary>
        </main>
      </div>
    </div>
  );
}

/* =========================================================================
 * DASHBOARD
 * ========================================================================= */
function Dashboard() {
  const [stats, setStats] = useState<{ total: number; published: number; drafts: number; today: number } | null>(null);
  const [top, setTop] = useState<Page[]>([]);
  const [stale, setStale] = useState<Page[]>([]);

  useEffect(() => {
    (async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const [{ count: total }, { count: published }, { count: drafts }, { count: today }] = await Promise.all([
        supabase.from("seo_pages").select("*", { count: "exact", head: true }),
        supabase.from("seo_pages").select("*", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("seo_pages").select("*", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("seo_pages").select("*", { count: "exact", head: true }).gte("created_at", start.toISOString()),
      ]);
      setStats({ total: total ?? 0, published: published ?? 0, drafts: drafts ?? 0, today: today ?? 0 });
      const { data: topRows } = await supabase.from("seo_pages").select("*").order("view_count", { ascending: false }).limit(10);
      setTop((topRows ?? []) as unknown as Page[]);
      const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
      const { data: staleRows } = await supabase.from("seo_pages").select("*").lt("last_generated_at", cutoff).order("last_generated_at", { ascending: true }).limit(10);
      setStale((staleRows ?? []) as unknown as Page[]);
    })();
  }, []);

  if (!stats) return <Spinner />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Publiées" value={stats.published} />
        <StatCard label="Brouillons" value={stats.drafts} />
        <StatCard label="Aujourd'hui" value={stats.today} />
      </div>
      <PageList title="Pages les plus consultées" rows={top} emptyText="Aucune donnée de vues." />
      <PageList title="Pages à optimiser (> 90 jours)" rows={stale} emptyText="Toutes les pages sont récentes." />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground font-body">{label}</div>
      <div className="text-2xl font-display font-bold text-foreground mt-1">{value}</div>
    </div>
  );
}

function PageList({ title, rows, emptyText }: { title: string; rows: Page[]; emptyText: string }) {
  return (
    <div>
      <h2 className="font-display font-bold text-foreground mb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground">{r.view_count} vues</span>
                <Link to={`/${r.slug}`} target="_blank" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Voir
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================================
 * CITIES / MATERIALS / SERVICES — simple lists with toggle + delete
 * ========================================================================= */
type CityMeta = {
  slug: string; in_registry: boolean; requests: number;
  pages_total: number; pages_published: number; page_state: "published" | "draft" | "none";
  served: boolean;
};

type GeneratorSignal = { slug: string; name: string; requests: number; availability?: string };
type GeneratorCity = City & {
  request_count: number; pages_total: number; pages_published: number; pages_draft: number; pages_review: number;
  status: "existing" | "to_create" | "draft" | "needs_review" | "no_opportunity";
  services: GeneratorSignal[]; materials: GeneratorSignal[];
};

function CitiesTab() {
  const [rows, setRows] = useState<City[]>([]);
  const [meta, setMeta] = useState<Record<string, CityMeta>>({});
  const [counts, setCounts] = useState<{ territories_total: number; missing_in_seo: number }>({ territories_total: 0, missing_in_seo: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState<City | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "none" | "published" | "registry" | "legacy">("all");

  const load = async () => {
    setLoading(true);
    const [citiesRes, metaRes] = await Promise.all([
      supabase.from("seo_cities").select("*").order("name"),
      supabase.rpc("seo_manager_cities" as never),
    ]);
    setRows((citiesRes.data ?? []) as City[]);
    const payload = (metaRes.data ?? null) as { cities?: CityMeta[]; territories_total?: number; missing_in_seo?: number } | null;
    const map: Record<string, CityMeta> = {};
    for (const c of payload?.cities ?? []) map[c.slug] = c;
    setMeta(map);
    setCounts({ territories_total: payload?.territories_total ?? 0, missing_in_seo: payload?.missing_in_seo ?? 0 });
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.rpc("seo_sync_cities_from_territories" as never);
    setSyncing(false);
    if (error) return toast.error(error.message);
    const r = (data ?? {}) as { inserted?: number; linked?: number };
    toast.success(`Synchronisation CRM → SEO : ${r.inserted ?? 0} ville(s) ajoutée(s), ${r.linked ?? 0} rattachée(s)`);
    load();
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      const m = meta[r.slug];
      if (filter === "none" && (m?.pages_total ?? 0) > 0) return false;
      if (filter === "published" && (m?.pages_published ?? 0) === 0) return false;
      if (filter === "registry" && !m?.in_registry) return false;
      if (filter === "legacy" && m?.in_registry) return false;
      if (!t) return true;
      return r.name.toLowerCase().includes(t) || r.slug.toLowerCase().includes(t) || (r.region || "").toLowerCase().includes(t);
    });
  }, [rows, meta, q, filter]);

  const save = async (form: City) => {
    if (!form.name.trim()) return toast.error("Nom requis");
    const slug = (form.slug.trim() || slugify(form.name));
    const { id: _id, ...rest } = form;
    void _id;
    const payload = { ...rest, slug };
    const { error } = form.id
      ? await supabase.from("seo_cities").update(payload).eq("id", form.id)
      : await supabase.from("seo_cities").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Ville mise à jour" : "Ville créée");
    setEditing(null); load();
  };

  const FILTERS: Array<{ k: typeof filter; label: string }> = [
    { k: "all", label: `Toutes (${rows.length})` },
    { k: "registry", label: "Dans le registre CRM" },
    { k: "legacy", label: "Hors registre (historique)" },
    { k: "none", label: "Sans page SEO" },
    { k: "published", label: "Avec page publiée" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>Source de vérité : <strong className="text-foreground">registre territorial du CRM</strong></span>
        <span>Municipalités actives au CRM : <strong className="text-foreground">{counts.territories_total}</strong></span>
        <span>Villes disponibles au SEO : <strong className="text-foreground">{rows.length}</strong></span>
        <span className={counts.missing_in_seo > 0 ? "text-destructive" : ""}>Manquantes : <strong>{counts.missing_in_seo}</strong></span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="flex-1 min-w-[180px] max-w-md px-3 py-2 rounded-md border border-border bg-card text-sm" />
        <button onClick={sync} disabled={syncing}
          className="px-3 py-2 rounded-md border border-border text-sm font-display font-semibold disabled:opacity-60">
          {syncing ? "Synchronisation..." : "Synchroniser avec le CRM"}
        </button>
        <button onClick={load} className="px-3 py-2 rounded-md border border-border text-sm">Actualiser</button>
        <button
          onClick={() => setEditing({ id: "", slug: "", name: "", region: "", latitude: null, longitude: null, population: null, intro: "", neighbors: [], active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${filter === f.k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {filtered.map((r) => {
            const m = meta[r.slug];
            const pageLabel = !m || m.page_state === "none" ? "Page SEO non créée"
              : m.page_state === "draft" ? `${m.pages_total} page(s) brouillon`
              : `${m.pages_published} page(s) publiée(s)`;
            return (
              <li key={r.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-body text-foreground truncate flex items-center gap-2">
                    {r.name}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${m?.in_registry ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {m?.in_registry ? "CRM" : "Historique"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {r.region} · /{r.slug} · {pageLabel}{m?.requests ? ` · ${m.requests} demande(s)` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${!m || m.page_state === "none" ? "bg-amber-500/15 text-amber-700" : "bg-green-500/15 text-green-700"}`}>
                    {!m || m.page_state === "none" ? "Sans page" : `${m.pages_total}`}
                  </span>
                  <button onClick={async () => { await supabase.from("seo_cities").update({ active: !r.active }).eq("id", r.id); load(); }}
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {r.active ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">Modifier</button>
                  <button onClick={async () => { if (confirm(`Supprimer ${r.name} ?`)) { await supabase.from("seo_cities").delete().eq("id", r.id); load(); } }}
                    className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">Aucune ville.</li>}
        </ul>
      )}
      {editing && <CityEditor initial={editing} allCities={rows} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function CityEditor({ initial, allCities, onClose, onSave }: {
  initial: City; allCities: City[]; onClose: () => void; onSave: (c: City) => void;
}) {
  const [form, setForm] = useState<City>(initial);
  return (
    <Modal title={initial.id ? `Modifier ${initial.name}` : "Nouvelle ville"} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v, slug: form.slug || slugify(v) })} />
          <LabeledInput label="Slug" mono value={form.slug} onChange={(v) => setForm({ ...form, slug: slugify(v) })} />
          <LabeledInput label="Région" value={form.region} onChange={(v) => setForm({ ...form, region: v })} />
          <LabeledInput label="Population" type="number" value={form.population?.toString() ?? ""} onChange={(v) => setForm({ ...form, population: v ? Number(v) : null })} />
          <LabeledInput label="Latitude" type="number" value={form.latitude?.toString() ?? ""} onChange={(v) => setForm({ ...form, latitude: v ? Number(v) : null })} />
          <LabeledInput label="Longitude" type="number" value={form.longitude?.toString() ?? ""} onChange={(v) => setForm({ ...form, longitude: v ? Number(v) : null })} />
        </div>
        <LabeledTextarea label="Introduction" value={form.intro ?? ""} onChange={(v) => setForm({ ...form, intro: v })} />
        <div>
          <div className="text-xs font-display font-semibold text-muted-foreground mb-1">Villes voisines</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-40 overflow-y-auto p-2 rounded border border-border">
            {allCities.filter((c) => c.slug !== form.slug).map((c) => (
              <label key={c.slug} className="flex items-center gap-1.5 text-xs font-body">
                <input type="checkbox" checked={form.neighbors.includes(c.slug)}
                  onChange={(e) => setForm({ ...form, neighbors: e.target.checked ? [...form.neighbors, c.slug] : form.neighbors.filter((s) => s !== c.slug) })} />
                {c.name}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Ordre" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Active</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
          <button onClick={() => onSave(form)} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MaterialsTab() {
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Material | null>(null);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("seo_materials").select("*").order("sort_order");
    setRows((data ?? []) as Material[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const save = async (form: Material) => {
    if (!form.name.trim()) return toast.error("Nom requis");
    const slug = form.slug.trim() || slugify(form.name);
    const { id: _id, ...rest } = form;
    void _id;
    const payload = { ...rest, slug, short_name: form.short_name || form.name };
    const { error } = form.id
      ? await supabase.from("seo_materials").update(payload).eq("id", form.id)
      : await supabase.from("seo_materials").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Matériau mis à jour" : "Matériau créé");
    setEditing(null); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg">Matériaux</h2>
        <button
          onClick={() => setEditing({ id: "", slug: "", name: "", short_name: "", keywords: [], use_cases: [], delivery_unit: "tonne", related_materials: [], description: "", active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug} · {r.delivery_unit}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from("seo_materials").update({ active: !r.active }).eq("id", r.id); load(); }}
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">Modifier</button>
                <button onClick={async () => { if (confirm(`Supprimer ${r.name} ?`)) { await supabase.from("seo_materials").delete().eq("id", r.id); load(); } }}
                  className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <MaterialEditor initial={editing} allMaterials={rows} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function MaterialEditor({ initial, allMaterials, onClose, onSave }: {
  initial: Material; allMaterials: Material[]; onClose: () => void; onSave: (m: Material) => void;
}) {
  const [form, setForm] = useState<Material>(initial);
  return (
    <Modal title={initial.id ? `Modifier ${initial.name}` : "Nouveau matériau"} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Nom complet" value={form.name} onChange={(v) => setForm({ ...form, name: v, slug: form.slug || slugify(v) })} />
          <LabeledInput label="Nom court" value={form.short_name} onChange={(v) => setForm({ ...form, short_name: v })} />
          <LabeledInput label="Slug" mono value={form.slug} onChange={(v) => setForm({ ...form, slug: slugify(v) })} />
          <label className="block">
            <span className="text-xs font-display font-semibold text-muted-foreground">Unité de livraison</span>
            <select value={form.delivery_unit} onChange={(e) => setForm({ ...form, delivery_unit: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm">
              <option value="tonne">tonne</option>
              <option value="verge cube">verge cube</option>
            </select>
          </label>
        </div>
        <LabeledTextarea label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
        <LabeledTextarea label="Mots-clés (un par ligne)" value={form.keywords.join("\n")} onChange={(v) => setForm({ ...form, keywords: v.split("\n").map((s) => s.trim()).filter(Boolean) })} />
        <LabeledTextarea label="Utilisations courantes (une par ligne)" value={form.use_cases.join("\n")} onChange={(v) => setForm({ ...form, use_cases: v.split("\n").map((s) => s.trim()).filter(Boolean) })} />
        <div>
          <div className="text-xs font-display font-semibold text-muted-foreground mb-1">Matériaux similaires</div>
          <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto p-2 rounded border border-border">
            {allMaterials.filter((m) => m.slug !== form.slug).map((m) => (
              <label key={m.slug} className="flex items-center gap-1.5 text-xs font-body">
                <input type="checkbox" checked={form.related_materials.includes(m.slug)}
                  onChange={(e) => setForm({ ...form, related_materials: e.target.checked ? [...form.related_materials, m.slug] : form.related_materials.filter((s) => s !== m.slug) })} />
                {m.name}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Ordre" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Actif</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
          <button onClick={() => onSave(form)} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================================
 * USAGES — pages "par utilisation" (ex: terre-pour-gazon)
 * ========================================================================= */
function UsesTab() {
  const [rows, setRows] = useState<Use[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Use | null>(null);
  const load = async () => {
    setLoading(true);
    const [u, m] = await Promise.all([
      supabase.from("seo_material_uses").select("*").order("sort_order"),
      supabase.from("seo_materials").select("*").order("sort_order"),
    ]);
    setRows((u.data ?? []) as Use[]);
    setMaterials((m.data ?? []) as Material[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const save = async (row: Use) => {
    if (!row.name.trim()) return toast.error("Nom requis");
    if (!row.material_slug) return toast.error("Matériau requis");
    const slug = row.slug.trim() || slugify(row.name);
    const { id: _id, ...rest } = row;
    void _id;
    const payload = { ...rest, slug };
    const { error } = row.id
      ? await supabase.from("seo_material_uses").update(payload).eq("id", row.id)
      : await supabase.from("seo_material_uses").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Enregistré");
    setEditing(null); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg">Usages</h2>
          <p className="text-xs text-muted-foreground font-body">Pages ciblées comme <code>terre-pour-gazon</code>, <code>gravier-pour-entree</code>, etc.</p>
        </div>
        <button
          onClick={() => setEditing({ id: "", slug: "", material_slug: materials[0]?.slug ?? "", name: "", description: "", active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug} · {r.material_slug}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from("seo_material_uses").update({ active: !r.active }).eq("id", r.id); load(); }}
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">Modifier</button>
                <button onClick={async () => { if (confirm("Supprimer ?")) { await supabase.from("seo_material_uses").delete().eq("id", r.id); load(); } }}
                  className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">Aucun usage. Créez-en pour ouvrir des pages par utilisation (ex: terre-pour-gazon).</li>}
        </ul>
      )}
      {editing && (
        <Modal title={editing.id ? "Modifier l'usage" : "Nouvel usage"} onClose={() => setEditing(null)}>
          <div className="space-y-3 text-sm">
            <LabeledInput label="Nom (ex : Terre pour gazon)" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v, slug: editing.slug || slugify(v) })} />
            <LabeledInput label="Slug" mono value={editing.slug} onChange={(v) => setEditing({ ...editing, slug: slugify(v) })} />
            <label className="block">
              <span className="text-xs font-display font-semibold text-muted-foreground">Matériau associé</span>
              <select value={editing.material_slug} onChange={(e) => setEditing({ ...editing, material_slug: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm">
                {materials.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
              </select>
            </label>
            <LabeledTextarea label="Description SEO courte" value={editing.description} onChange={(v) => setEditing({ ...editing, description: v })} />
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Ordre" type="number" value={String(editing.sort_order)} onChange={(v) => setEditing({ ...editing, sort_order: Number(v) || 0 })} />
              <label className="flex items-center gap-2 mt-6">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                <span>Actif</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
              <button onClick={() => save(editing)} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ServicesTab() {
  const [rows, setRows] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("seo_services").select("*").order("sort_order");
    setRows((data ?? []) as Service[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    const payload = {
      slug: editing.slug || slugify(editing.name),
      name: editing.name,
      short_name: editing.short_name,
      description: editing.description,
      keywords: editing.keywords,
      active: editing.active,
      sort_order: editing.sort_order,
    };
    const { error } = editing.id
      ? await supabase.from("seo_services").update(payload).eq("id", editing.id)
      : await supabase.from("seo_services").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Enregistré");
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg">Services</h2>
        <button onClick={() => setEditing({ id: "", slug: "", name: "", short_name: "", description: "", keywords: [], active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from("seo_services").update({ active: !r.active }).eq("id", r.id); load(); }}
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">Modifier</button>
                <button onClick={async () => { if (confirm(`Supprimer ${r.name} ?`)) { await supabase.from("seo_services").delete().eq("id", r.id); load(); } }}
                  className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">Aucun service.</li>}
        </ul>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? `Modifier ${editing.name}` : "Nouveau service"}>
          <div className="space-y-3 text-sm">
            <LabeledInput label="Nom" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v, slug: editing.slug || slugify(v) })} />
            <LabeledInput label="Slug" mono value={editing.slug} onChange={(v) => setEditing({ ...editing, slug: slugify(v) })} />
            <LabeledInput label="Nom court" value={editing.short_name ?? ""} onChange={(v) => setEditing({ ...editing, short_name: v })} />
            <LabeledTextarea label="Description" value={editing.description} onChange={(v) => setEditing({ ...editing, description: v })} />
            <LabeledInput label="Mots-clés (séparés par virgule)" value={editing.keywords.join(", ")} onChange={(v) => setEditing({ ...editing, keywords: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Ordre" type="number" value={String(editing.sort_order)} onChange={(v) => setEditing({ ...editing, sort_order: Number(v) || 0 })} />
              <label className="flex items-center gap-2 mt-6">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                <span>Actif</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
              <button onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SimpleAdminList({ title, rows, loading, onToggle, onDelete, extra }: {
  title: string;
  rows: Array<{ id: string; name: string; sub: string; active: boolean }>;
  loading: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg">{title}</h2>
        {extra}
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{r.sub}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => onToggle(r.id)} className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => onDelete(r.id)} className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================================
 * GENERATOR
 * ========================================================================= */
type Combo = { city: City; material?: Material; service?: Service };

function buildSlug(c: Combo) {
  const parts = [c.service?.slug, c.material?.slug, c.city.slug].filter(Boolean) as string[];
  return parts.join("-");
}

function GeneratorTab() {
  const [cities, setCities] = useState<GeneratorCity[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [existingPages, setExistingPages] = useState<Map<string, { slug: string; status: string }>>(new Map());
  const [selCities, setSelCities] = useState<Set<string>>(new Set());
  const [selMaterials, setSelMaterials] = useState<Set<string>>(new Set());
  const [selServices, setSelServices] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [cityQuery, setCityQuery] = useState("");
  const [selectedUsage, setSelectedUsage] = useState("");
  const [catalogCounts, setCatalogCounts] = useState({ crm: 0, generable: 0, historical: 0 });

  const load = useCallback(async () => {
      const [catalog, m, s, p] = await Promise.all([
        supabase.rpc("seo_generator_catalog" as never),
        supabase.from("seo_materials").select("id,slug,name,short_name,description,active,sort_order").eq("active", true).order("sort_order"),
        supabase.from("seo_services").select("*").eq("active", true).order("sort_order"),
        supabase.from("seo_pages").select("slug,city_slug,material_slug,service_slug,status"),
      ]);
      if (catalog.error) throw catalog.error;
      const payload = catalog.data as unknown as { cities: GeneratorCity[]; crm_active: number; generable: number; historical_retained: number };
      setCities(payload.cities ?? []);
      setCatalogCounts({ crm: payload.crm_active ?? 0, generable: payload.generable ?? 0, historical: payload.historical_retained ?? 0 });
      setMaterials((m.data ?? []) as Material[]);
      setServices((s.data ?? []) as Service[]);
      const index = new Map<string, { slug: string; status: string }>();
      for (const row of p.data ?? []) index.set(`${row.city_slug}|${row.material_slug ?? ""}|${row.service_slug ?? ""}`, { slug: row.slug, status: row.status });
      setExistingPages(index);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const combos: Combo[] = useMemo(() => {
    const out: Combo[] = [];
    const selC = cities.filter((c) => selCities.has(c.id));
    const selM = materials.filter((m) => selMaterials.has(m.id));
    const selS = services.filter((s) => selServices.has(s.id));
    if (selC.length === 0) return out;
    if (selM.length === 0 && selS.length === 0) return out;
    for (const city of selC) {
      if (selS.length === 0) {
        for (const material of selM) out.push({ city, material });
      } else if (selM.length === 0) {
        for (const service of selS) out.push({ city, service });
      } else {
        for (const service of selS) for (const material of selM) out.push({ city, service, material });
      }
    }
    return out;
  }, [cities, materials, services, selCities, selMaterials, selServices]);

  const comboKey = (c: Combo) => `${c.city.slug}|${c.material?.slug ?? ""}|${c.service?.slug ?? ""}`;
  const isRelevant = (combo: Combo) => {
    const city = combo.city as GeneratorCity;
    if (city.request_count <= 0) return false;
    const materialOk = !combo.material || city.materials.some((signal) => signal.slug === combo.material?.slug);
    const serviceOk = !combo.service || city.services.some((signal) => signal.slug === combo.service?.slug);
    return materialOk && serviceOk;
  };
  const missingCombos = combos.filter((c) => !existingPages.has(comboKey(c)));
  const toCreate = missingCombos.filter(isRelevant);
  const rejected = missingCombos.filter((c) => !isRelevant(c));
  const existingCount = combos.filter((c) => existingPages.has(comboKey(c))).length;
  const draftCount = combos.filter((c) => existingPages.get(comboKey(c))?.status === "draft").length;
  const reviewCount = combos.filter((c) => ["needs_review", "rejected"].includes(existingPages.get(comboKey(c))?.status ?? "")).length;

  const run = async () => {
    if (toCreate.length === 0) return;
    if (!window.confirm(`Créer ${toCreate.length} brouillon(s) non indexable(s)? Aucune page ne sera publiée.`)) return;
    setRunning(true);
    setPaused(false);
    setProgress({ done: 0, total: toCreate.length, errors: 0 });
    setLog([]);
    let done = 0, errors = 0;
    for (const c of toCreate) {
      // Poll pause flag between iterations
      // eslint-disable-next-line no-await-in-loop
      while ((window as unknown as { __seoPaused?: boolean }).__seoPaused) await new Promise((r) => setTimeout(r, 500));
      const slug = buildSlug(c);
      try {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { created?: boolean; skipped?: boolean; error?: string }>("seo-generate-page", {
          city: { slug: c.city.slug, name: c.city.name, region: c.city.region },
          material: c.material ? { slug: c.material.slug, name: c.material.name, short_name: c.material.short_name, description: c.material.description } : undefined,
          service: c.service ? { slug: c.service.slug, name: c.service.name, description: c.service.description } : undefined,
          usage: selectedUsage || undefined,
          publish: false,
          allow_ai: true,
        });
        if (error) throw error;
        setExistingPages((pages) => new Map(pages).set(comboKey(c), { slug, status: "draft" }));
        setLog((l) => [`${data?.skipped ? "⏭️" : "✅"} ${slug}`, ...l].slice(0, 40));
      } catch (e) {
        errors += 1;
        setLog((l) => [`❌ ${slug} — ${(e as Error).message}`, ...l].slice(0, 40));
      }
      done += 1;
      setProgress({ done, total: toCreate.length, errors });
    }
    setRunning(false);
    toast.success(`Génération terminée : ${done - errors} brouillon(s), ${errors} erreur(s). Aucune publication.`);
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    (window as unknown as { __seoPaused?: boolean }).__seoPaused = next;
  };

  const toggleAll = (list: Array<{ id: string }>, sel: Set<string>, setSel: (s: Set<string>) => void) => {
    if (sel.size === list.length) setSel(new Set());
    else setSel(new Set(list.map((r) => r.id)));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center gap-3 text-sm">
        <strong>Registre CRM</strong>
        <span>{catalogCounts.crm} municipalités actives</span>
        <span>{catalogCounts.generable} générables</span>
        <span>{catalogCounts.historical} historiques conservées</span>
        <button onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 text-primary"><RefreshCw className="w-4 h-4" /> Actualiser</button>
      </div>
      <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder="Rechercher une municipalité…" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GeneratorCityPicker cities={cities.filter((c) => !cityQuery || `${c.name} ${c.slug}`.toLowerCase().includes(cityQuery.toLowerCase()))} selected={selCities} onChange={setSelCities} />
        <PickerColumn title="Matériaux" items={materials} selected={selMaterials} onChange={setSelMaterials} onToggleAll={() => toggleAll(materials, selMaterials, setSelMaterials)} />
        <PickerColumn title="Services" items={services} selected={selServices} onChange={setSelServices} onToggleAll={() => toggleAll(services, selServices, setSelServices)} />
      </div>

      <label className="block rounded-lg border border-border bg-card p-3 text-sm">
        <span className="font-semibold">Usage ciblé (facultatif)</span>
        <select value={selectedUsage} onChange={(e) => setSelectedUsage(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2">
          <option value="">Aucun usage précis</option>
          {materials.filter((m) => selMaterials.has(m.id)).flatMap((m) => (m.use_cases ?? []).map((usage) => <option key={`${m.id}-${usage}`} value={usage}>{m.name} — {usage}</option>))}
        </select>
      </label>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Metric label="Combinaisons" value={combos.length} />
          <Metric label="À créer" value={toCreate.length} />
          <Metric label="Déjà existantes" value={existingCount} />
          <Metric label="Brouillons" value={draftCount} />
          <Metric label="À réviser" value={reviewCount} />
          <Metric label="Sans opportunité" value={rejected.length} />
        </div>
        {rejected.length > 0 && <p className="text-xs text-muted-foreground">{rejected.length} combinaison(s) exclue(s) de ce lot : aucun signal CRM correspondant au service ou matériau choisi.</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={run} disabled={running || toCreate.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Génération en cours..." : `Créer ${toCreate.length} brouillon(s)`}
          </button>
          <button onClick={togglePause} disabled={!running} className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border text-sm disabled:opacity-50">
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} {paused ? "Reprendre" : "Pause"}
          </button>
        </div>
        {progress.total > 0 && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              {progress.done} / {progress.total} · {progress.errors} erreur(s)
            </div>
          </div>
        )}
        {log.length > 0 && (
          <div className="rounded-md bg-muted/40 p-3 max-h-48 overflow-auto text-xs font-mono space-y-0.5">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

const GENERATOR_STATUS: Record<GeneratorCity["status"], string> = {
  existing: "Page existante", to_create: "Page à créer", draft: "Brouillon",
  needs_review: "À réviser", no_opportunity: "Aucune opportunité SEO identifiée",
};

function GeneratorCityPicker({ cities, selected, onChange }: { cities: GeneratorCity[]; selected: Set<string>; onChange: (value: Set<string>) => void }) {
  return <div className="rounded-lg border border-border bg-card p-3">
    <div className="mb-2 flex items-center justify-between"><h3 className="font-display font-bold text-sm">Municipalités CRM</h3><span className="text-xs text-muted-foreground">{cities.length}</span></div>
    <div className="max-h-64 overflow-y-auto space-y-1">
      {cities.map((city) => <label key={city.id} className="flex items-start gap-2 rounded px-1.5 py-1.5 hover:bg-secondary cursor-pointer">
        <input type="checkbox" checked={selected.has(city.id)} onChange={(e) => { const next = new Set(selected); e.target.checked ? next.add(city.id) : next.delete(city.id); onChange(next); }} />
        <span className="min-w-0"><span className="block truncate text-sm">{city.name}</span><span className="block text-xs text-muted-foreground">{GENERATOR_STATUS[city.status]} · {city.request_count} demande(s){city.services.length ? ` · ${city.services.map((s) => s.name).join(", ")}` : ""}</span></span>
      </label>)}
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-display font-bold text-foreground">{value}</div>
    </div>
  );
}

function QuickPackButton({
  cities, materials, onApply,
}: {
  cities: City[]; materials: Material[]; onApply: (cityIds: string[], materialIds: string[]) => void;
}) {
  // Selects Québec, Lévis, their neighbours + all active materials in one click.
  const trigger = () => {
    const anchors = cities.filter((c) => ["Québec", "Lévis"].includes(c.region) || ["quebec", "levis"].includes(c.slug));
    const neighborSlugs = new Set<string>();
    anchors.forEach((a) => (a.neighbors ?? []).forEach((s) => neighborSlugs.add(s)));
    const pack = cities.filter((c) => anchors.some((a) => a.id === c.id) || neighborSlugs.has(c.slug));
    if (pack.length === 0) { toast.error("Aucune ville trouvée pour Québec/Lévis. Ajoute-les dans l'onglet Villes."); return; }
    onApply(pack.map((c) => c.id), materials.map((m) => m.id));
    toast.success(`Pack Québec/Lévis : ${pack.length} ville(s) × ${materials.length} matériau(x)`);
  };
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-display font-bold text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> Pack Québec / Lévis
        </h3>
        <p className="text-xs text-muted-foreground font-body mt-1">
          Sélectionne automatiquement Québec, Lévis, leurs arrondissements et municipalités voisines × tous les matériaux actifs. Les combinaisons déjà générées seront ignorées.
        </p>
      </div>
      <button onClick={trigger} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold shadow hover:opacity-90">
        <Zap className="w-4 h-4" /> Charger le pack
      </button>
    </div>
  );
}

function PickerColumn({ title, items, selected, onChange, onToggleAll }: {
  title: string;
  items: Array<{ id: string; name: string; slug: string }>;
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-bold text-sm">{title}</h3>
        <button onClick={onToggleAll} className="text-xs text-primary hover:underline">
          {selected.size === items.length ? "Tout désélectionner" : "Tout sélectionner"}
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {items.map((it) => (
          <label key={it.id} className="flex items-center gap-2 text-sm hover:bg-secondary rounded px-1.5 py-1 cursor-pointer">
            <input type="checkbox" checked={selected.has(it.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(it.id); else next.delete(it.id);
                onChange(next);
              }} />
            <span className="font-body truncate">{it.name}</span>
          </label>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground p-2">Aucun élément actif.</p>}
      </div>
    </div>
  );
}

/* =========================================================================
 * SUGGESTIONS
 * ========================================================================= */
function SuggestionsTab() {
  const [suggestions, setSuggestions] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [catalog, m, s, p] = await Promise.all([
      supabase.rpc("seo_generator_catalog" as never),
      supabase.from("seo_materials").select("id,slug,name,short_name,description,active,sort_order").eq("active", true).order("sort_order").limit(20),
      supabase.from("seo_services").select("*").eq("active", true).order("sort_order").limit(20),
      supabase.from("seo_pages").select("city_slug,material_slug,service_slug"),
    ]);
    const payload = catalog.data as unknown as { cities?: GeneratorCity[] };
    const cityRows = payload?.cities ?? [];
    const materialRows = (m.data ?? []) as Material[];
    const serviceRows = (s.data ?? []) as Service[];
    const existing = new Set((p.data ?? []).map((r) => `${r.city_slug}|${r.material_slug ?? ""}|${r.service_slug ?? ""}`));
    const out: Combo[] = [];
    for (const city of cityRows) {
      for (const signal of city.materials) {
        const material = materialRows.find((item) => item.slug === signal.slug);
        if (material && !existing.has(`${city.slug}|${material.slug}|`)) out.push({ city, material });
      }
      for (const signal of city.services) {
        const service = serviceRows.find((item) => item.slug === signal.slug);
        if (service && !existing.has(`${city.slug}||${service.slug}`)) out.push({ city, service });
      }
    }
    setSuggestions(out.slice(0, 100));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createOne = async (c: Combo) => {
    const slug = buildSlug(c);
    setCreating(slug);
    try {
      const { error } = await invokeWithFreshSession("seo-generate-page", {
        city: { slug: c.city.slug, name: c.city.name, region: c.city.region },
        material: c.material ? { slug: c.material.slug, name: c.material.name, short_name: c.material.short_name, description: c.material.description } : undefined,
        service: c.service ? { slug: c.service.slug, name: c.service.name, description: c.service.description } : undefined,
        allow_ai: true,
        publish: false,
      });
      if (error) throw error;
      toast.success(`Brouillon non indexable créé : /${slug}`);
      setSuggestions((list) => list.filter((x) => buildSlug(x) !== slug));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(null);
    }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg">Opportunités appuyées par le CRM</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <RotateCcw className="w-4 h-4" /> Actualiser
        </button>
      </div>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune opportunité SEO identifiée à partir des demandes actuelles.</p>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {suggestions.map((c) => {
            const slug = buildSlug(c);
            const label = [c.material?.name, "à", c.city.name].filter(Boolean).join(" ");
            return (
              <li key={slug} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-body text-foreground truncate">{label}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">/{slug}</div>
                </div>
                <button onClick={() => createOne(c)} disabled={creating === slug}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold disabled:opacity-50">
                  {creating === slug ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Créer
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* =========================================================================
 * UI helpers
 * ========================================================================= */
function Spinner() {
  return <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, mono, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-display font-semibold text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm ${mono ? "font-mono" : ""}`} />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-display font-semibold text-muted-foreground">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
        className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
    </label>
  );
}

/* =========================================================================
 * ANALYTICS TAB — SEO score, structure, refresh queue
 * ========================================================================= */
const PAGE_COLS = "id, slug, city_slug, material_slug, service_slug, title, status, last_generated_at, created_at, view_count, seo_score, word_count, internal_link_count, needs_refresh, proc_status, proc_kind, proc_started_at, proc_finished_at, proc_error, proc_result";
const STALE_MS = 15 * 60 * 1000;

/** A row is really busy only if its own proc_status is "running" and not stale. */
function isRunning(p: Page) {
  if (p.proc_status !== "running") return false;
  const started = p.proc_started_at ? new Date(p.proc_started_at).getTime() : 0;
  return !started || Date.now() - started < STALE_MS;
}

function AnalyticsTab() {
  const [rows, setRows] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "needs_refresh" | "low_score">("all");

  const patchRow = useCallback((id: string, patch: Partial<Page>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("seo_pages").select(PAGE_COLS).order("seo_score", { ascending: true, nullsFirst: true }).limit(500);
    if (filter === "needs_refresh") q = q.eq("needs_refresh", true);
    if (filter === "low_score") q = q.lt("seo_score", 70);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as Page[]);
    setLoading(false);
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  /** Re-sync only the rows currently marked running (never resets the others). */
  const runningIds = rows.filter(isRunning).map((r) => r.id).join(",");
  useEffect(() => {
    if (!runningIds) return;
    const ids = runningIds.split(",");
    const t = setInterval(async () => {
      const { data } = await supabase.from("seo_pages").select(PAGE_COLS).in("id", ids);
      for (const row of (data ?? []) as unknown as Page[]) patchRow(row.id, row);
    }, 6000);
    return () => clearInterval(t);
  }, [runningIds, patchRow]);

  const refreshRow = useCallback(async (id: string) => {
    const { data } = await supabase.from("seo_pages").select(PAGE_COLS).eq("id", id).maybeSingle();
    if (data) patchRow(id, data as unknown as Page);
  }, [patchRow]);

  const [optimizeTarget, setOptimizeTarget] = useState<Page | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Page | null>(null);

  const markStart = async (page: Page, kind: "analyze" | "regenerate") => {
    const startedAt = new Date().toISOString();
    patchRow(page.id, { proc_status: "running", proc_kind: kind, proc_started_at: startedAt, proc_error: null });
    const { error } = await supabase.from("seo_pages")
      .update({ proc_status: "running", proc_kind: kind, proc_started_at: startedAt, proc_finished_at: null, proc_error: null })
      .eq("id", page.id);
    if (error) throw new Error(`Impossible d'enregistrer l'état: ${error.message}`);
  };

  const markFinish = async (page: Page, patch: Record<string, unknown>) => {
    const full = { ...patch, proc_finished_at: new Date().toISOString() };
    await supabase.from("seo_pages").update(full).eq("id", page.id);
    await refreshRow(page.id);
  };

  /** Analyse QA d'UNE page — persistée immédiatement en base. */
  const analyze = async (page: Page) => {
    if (isRunning(page)) return;
    try {
      await markStart(page, "analyze");
      const res = await invokeWithFreshSession<Record<string, unknown>, { ok?: boolean; score?: number; blockers?: string[]; warnings?: string[] }>(
        "seo-qa-check", { page_id: page.id, enforce_draft: false },
      );
      if (res.error) throw new Error(res.error.message);
      const score = Number(res.data?.score ?? 0);
      const blockers = res.data?.blockers ?? [];
      await markFinish(page, {
        proc_status: "done",
        proc_error: null,
        proc_result: { kind: "analyze", score, blockers, warnings: res.data?.warnings ?? [] },
        seo_score: score,
        last_analyzed_at: new Date().toISOString(),
        needs_refresh: blockers.length > 0 || score < 65,
        refresh_reason: blockers.length ? `qa:${blockers.slice(0, 3).join(",")}` : null,
      });
      toast.success(`Analyse terminée — score ${score}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur d'analyse";
      await supabase.from("seo_pages").update({ proc_status: "error", proc_error: msg, proc_finished_at: new Date().toISOString() }).eq("id", page.id);
      await refreshRow(page.id);
      toast.error(msg);
    }
  };

  /**
   * Optimisation réelle d'UNE page : analyse → correction ciblée → recalcul du score.
   * Le déroulé et les résultats (avant/après) sont pilotés par OptimizeDialog.
   */
  const openOptimize = (page: Page) => {
    if (isRunning(page)) return;
    setOptimizeTarget(page);
  };


  const stats = useMemo(() => {
    const scored = rows.filter((r) => typeof r.seo_score === "number");
    const avg = scored.length ? Math.round(scored.reduce((s, r) => s + (r.seo_score ?? 0), 0) / scored.length) : 0;
    const excellent = rows.filter((r) => (r.seo_score ?? 0) >= 85).length;
    const good = rows.filter((r) => (r.seo_score ?? 0) >= 65 && (r.seo_score ?? 0) < 85).length;
    const weak = rows.filter((r) => typeof r.seo_score === "number" && r.seo_score < 65).length;
    const refresh = rows.filter((r) => r.needs_refresh).length;
    return { avg, excellent, good, weak, refresh };
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* Centre de contrôle massif : analyse, optimisation et rafraîchissement par lots */}
      <BulkOptimizationPanel onProgress={() => { void load(); }} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Score moyen (échantillon)" value={stats.avg} />
        <StatCard label="Excellent (85+)" value={stats.excellent} />
        <StatCard label="Bon (65-84)" value={stats.good} />
        <StatCard label="À améliorer" value={stats.weak} />
        <StatCard label="À rafraîchir" value={stats.refresh} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "needs_refresh", "low_score"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-display font-semibold ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}>
            {f === "all" ? "Toutes" : f === "needs_refresh" ? "À rafraîchir" : "Score faible"}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune page.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Page</th>
                <th className="text-center p-3">Score</th>
                <th className="text-center p-3">Mots</th>
                <th className="text-center p-3">Liens int.</th>
                <th className="text-center p-3">Statut</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const busy = isRunning(r);
                return (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="p-3 min-w-0">
                    <div className="font-body text-foreground truncate max-w-[420px]">{r.title}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
                    {r.proc_status === "error" && r.proc_error && (
                      <div className="text-[11px] text-destructive truncate max-w-[420px]" title={r.proc_error}>{r.proc_error}</div>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <ScoreBadge score={r.seo_score} />
                  </td>
                  <td className="p-3 text-center text-foreground">{r.word_count ?? "—"}</td>
                  <td className="p-3 text-center text-foreground">{r.internal_link_count ?? "—"}</td>
                  <td className="p-3 text-center">
                    {busy ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-display font-semibold">
                        <Loader2 className="w-3 h-3 animate-spin" /> En cours{r.proc_kind === "regenerate" ? " (régénération)" : ""}
                      </span>
                    ) : r.proc_status === "error" ? (
                      <button type="button" onClick={() => analyze(r)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-display font-semibold hover:bg-destructive/25">
                        <RotateCcw className="w-3 h-3" /> Erreur — Réessayer
                      </button>
                    ) : r.needs_refresh ? (
                      <button type="button" onClick={() => analyze(r)} title="Analyser cette page maintenant"
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-display font-semibold hover:bg-amber-500/25">
                        <RefreshCw className="w-3 h-3" /> À rafraîchir
                      </button>
                    ) : (
                      <button type="button" onClick={() => analyze(r)} title="Analyser cette page"
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-display font-semibold hover:bg-secondary/70">
                        <RefreshCw className="w-3 h-3" /> {r.proc_status === "done" ? "Terminé" : "À jour"}
                      </button>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end items-center gap-2">
                      <Link to={`/${r.slug}`} target="_blank" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> Voir
                      </Link>
                      <button type="button" onClick={() => setHistoryTarget(r)}
                        title="Voir l'historique des optimisations de cette page"
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border font-display font-semibold hover:bg-secondary">
                        <RotateCcw className="w-3 h-3" /> Historique
                      </button>
                      <button type="button" onClick={() => openOptimize(r)} disabled={busy}
                        title="Analyser, corriger les critères en échec et recalculer le score réel"
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 disabled:opacity-50">
                        {busy && r.proc_kind === "regenerate" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Optimiser
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {optimizeTarget && (
        <OptimizeDialog
          pageId={optimizeTarget.id}
          pageTitle={optimizeTarget.title}
          onClose={() => setOptimizeTarget(null)}
          onFinished={() => { void refreshRow(optimizeTarget.id); }}
        />
      )}

      {historyTarget && (
        <PageHistoryDialog
          pageId={historyTarget.id}
          pageTitle={historyTarget.title}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const color = score >= 85 ? "bg-primary/20 text-primary" : score >= 65 ? "bg-amber-500/15 text-amber-600" : "bg-destructive/15 text-destructive";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-display font-bold ${color}`}>{score}/100</span>;
}

/* =========================================================================
 * BLOG TAB — articles connected to SEO Manager entities
 * ========================================================================= */
type BlogRow = {
  id: string; slug: string; title: string; status: string; published_at: string | null;
  related_city_slugs: string[]; related_material_slugs: string[]; related_service_slugs: string[];
};
function BlogTab() {
  const [rows, setRows] = useState<BlogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("blog_posts")
      .select("id, slug, title, status, published_at, related_city_slugs, related_material_slugs, related_service_slugs")
      .order("updated_at", { ascending: false })
      .limit(200);
    setRows(((data ?? []) as unknown) as BlogRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    const isLinked = (r: BlogRow) =>
      (r.related_city_slugs?.length ?? 0) + (r.related_material_slugs?.length ?? 0) + (r.related_service_slugs?.length ?? 0) > 0;
    return rows.filter((r) => (filter === "linked" ? isLinked(r) : !isLinked(r)));
  }, [rows, filter]);

  const stats = useMemo(() => {
    const linked = rows.filter((r) => (r.related_city_slugs?.length ?? 0) + (r.related_material_slugs?.length ?? 0) + (r.related_service_slugs?.length ?? 0) > 0).length;
    return { total: rows.length, linked, unlinked: rows.length - linked };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Articles" value={stats.total} />
        <StatCard label="Reliés au SEO" value={stats.linked} />
        <StatCard label="Non reliés" value={stats.unlinked} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["all", "linked", "unlinked"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-display font-semibold ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}>
              {f === "all" ? "Tous" : f === "linked" ? "Reliés" : "Non reliés"}
            </button>
          ))}
        </div>
        <Link to="/admin/blogue" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-display font-semibold">
          <ExternalLink className="w-3.5 h-3.5" /> Ouvrir le CMS blogue
        </Link>
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun article.</p>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {filtered.map((r) => {
            const totalLinks = (r.related_city_slugs?.length ?? 0) + (r.related_material_slugs?.length ?? 0) + (r.related_service_slugs?.length ?? 0);
            return (
              <li key={r.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-body text-foreground truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    /blog/{r.slug} · {r.status}
                    {totalLinks > 0 && (
                      <> · <span className="text-primary">{r.related_city_slugs?.length ?? 0}v {r.related_material_slugs?.length ?? 0}m {r.related_service_slugs?.length ?? 0}s</span></>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/admin/blogue/editer/${r.id}`} className="text-xs text-primary hover:underline">Rattacher</Link>
                  <Link to={`/blog/${r.slug}`} target="_blank" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> Voir
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
/* =========================================================================
 * PAGES TAB — dashboard-style table with score, priority, Google status, actions
 * ========================================================================= */
type PageRow = Page & {
  meta_title?: string | null;
  google_index_status?: string | null;
  google_last_checked_at?: string | null;
  priority: number;
  priority_locked: boolean;
  updated_at: string | null;
  related_articles_count?: number;
};

function PagesTab() {
  const [rows, setRows] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [scoreFilter, setScoreFilter] = useState<"all" | "good" | "avg" | "low">("all");
  const [priorityFilter, setPriorityFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "indexed" | "unknown">("all");
  const [sortKey, setSortKey] = useState<"priority" | "score" | "words" | "updated" | "internal" | "articles">("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [improveTarget, setImproveTarget] = useState<{ id: string; title: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("seo_pages")
      .select("id, slug, city_slug, material_slug, service_slug, title, meta_title, status, last_generated_at, created_at, updated_at, view_count, seo_score, word_count, internal_link_count, needs_refresh, priority, priority_locked, google_index_status, google_last_checked_at")
      .order("priority", { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);

    const list = ((data ?? []) as unknown) as PageRow[];

    // Count related blog posts for each combo (best-effort, small extra query)
    if (list.length > 0) {
      const citySlugs = Array.from(new Set(list.map((r) => r.city_slug).filter(Boolean)));
      const matSlugs = Array.from(new Set(list.map((r) => r.material_slug).filter(Boolean) as string[]));
      const { data: posts } = await supabase
        .from("blog_posts")
        .select("related_city_slugs, related_material_slugs, related_service_slugs")
        .eq("status", "published")
        .or(
          [
            citySlugs.length ? `related_city_slugs.ov.{${citySlugs.join(",")}}` : "",
            matSlugs.length ? `related_material_slugs.ov.{${matSlugs.join(",")}}` : "",
          ].filter(Boolean).join(",") || "id.eq.00000000-0000-0000-0000-000000000000"
        );
      for (const r of list) {
        r.related_articles_count = (posts ?? []).filter((p) => {
          const cities = (p.related_city_slugs ?? []) as string[];
          const mats = (p.related_material_slugs ?? []) as string[];
          const svcs = (p.related_service_slugs ?? []) as string[];
          const cityMatch = r.city_slug && cities.includes(r.city_slug);
          const matMatch = r.material_slug && mats.includes(r.material_slug);
          const svcMatch = r.service_slug && svcs.includes(r.service_slug);
          return cityMatch || matMatch || svcMatch;
        }).length;
      }
    }

    setRows(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = rows;
    if (t) list = list.filter((r) => r.title.toLowerCase().includes(t) || r.slug.toLowerCase().includes(t));
    if (scoreFilter !== "all") {
      list = list.filter((r) => {
        const s = r.seo_score ?? 0;
        return scoreFilter === "good" ? s >= 85 : scoreFilter === "avg" ? s >= 65 && s < 85 : s < 65;
      });
    }
    if (priorityFilter !== "all") list = list.filter((r) => r.priority === priorityFilter);
    if (statusFilter !== "all") {
      list = list.filter((r) => (statusFilter === "indexed" ? r.google_index_status === "indexed" : (r.google_index_status ?? "unknown") !== "indexed"));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const key = sortKey;
    return [...list].sort((a, b) => {
      const av =
        key === "priority" ? a.priority :
        key === "score" ? (a.seo_score ?? 0) :
        key === "words" ? (a.word_count ?? 0) :
        key === "internal" ? (a.internal_link_count ?? 0) :
        key === "articles" ? (a.related_articles_count ?? 0) :
        new Date(a.updated_at ?? a.created_at).getTime();
      const bv =
        key === "priority" ? b.priority :
        key === "score" ? (b.seo_score ?? 0) :
        key === "words" ? (b.word_count ?? 0) :
        key === "internal" ? (b.internal_link_count ?? 0) :
        key === "articles" ? (b.related_articles_count ?? 0) :
        new Date(b.updated_at ?? b.created_at).getTime();
      return (av - bv) * dir;
    });
  }, [rows, q, scoreFilter, priorityFilter, statusFilter, sortKey, sortDir]);

  const setPriority = async (row: PageRow, value: number, locked: boolean) => {
    const { error } = await supabase.from("seo_pages").update({ priority: value, priority_locked: locked }).eq("id", row.id);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, priority: value, priority_locked: locked } : r)));
  };

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher titre ou slug…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card font-body text-sm" />
        </div>
        <select value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value as typeof scoreFilter)} className="px-2 py-2 rounded-lg border border-border bg-card text-sm font-body">
          <option value="all">Score : tous</option>
          <option value="good">Excellent (85+)</option>
          <option value="avg">Bon (65-84)</option>
          <option value="low">À améliorer (&lt;65)</option>
        </select>
        <select value={priorityFilter === "all" ? "all" : String(priorityFilter)} onChange={(e) => setPriorityFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className="px-2 py-2 rounded-lg border border-border bg-card text-sm font-body">
          <option value="all">Priorité : toutes</option>
          {[5,4,3,2,1].map((p) => <option key={p} value={p}>{"★".repeat(p)} {priorityLabel(p)}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="px-2 py-2 rounded-lg border border-border bg-card text-sm font-body">
          <option value="all">Google : tous</option>
          <option value="indexed">Indexées</option>
          <option value="unknown">Non indexées</option>
        </select>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold hover:opacity-90">
          <RefreshCw className="w-3.5 h-3.5" /> Actualiser
        </button>
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune page.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Page</th>
                <SortableTh label="Priorité" active={sortKey === "priority"} dir={sortDir} onClick={() => toggleSort("priority")} />
                <SortableTh label="Score" active={sortKey === "score"} dir={sortDir} onClick={() => toggleSort("score")} />
                <SortableTh label="Mots" active={sortKey === "words"} dir={sortDir} onClick={() => toggleSort("words")} />
                <th className="text-left px-3 py-2 font-semibold">Google</th>
                <SortableTh label="Liens int." active={sortKey === "internal"} dir={sortDir} onClick={() => toggleSort("internal")} />
                <SortableTh label="Articles" active={sortKey === "articles"} dir={sortDir} onClick={() => toggleSort("articles")} />
                <th className="text-left px-3 py-2 font-semibold">Créée</th>
                <SortableTh label="MAJ" active={sortKey === "updated"} dir={sortDir} onClick={() => toggleSort("updated")} />
                <th className="text-right px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 max-w-[260px]">
                    <Link to={`/${r.slug}`} target="_blank" className="font-body text-foreground hover:text-primary line-clamp-1">{r.title}</Link>
                    <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <PriorityStars value={r.priority} locked={r.priority_locked} editable onChange={(v, l) => setPriority(r, v, l)} />
                  </td>
                  <td className="px-3 py-2"><ScoreBadge score={r.seo_score ?? null} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{r.word_count ?? "—"}</td>
                  <td className="px-3 py-2"><GoogleStatusBadge status={r.google_index_status} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{r.internal_link_count ?? 0}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.related_articles_count ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("fr-CA")}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{r.updated_at ? new Date(r.updated_at).toLocaleDateString("fr-CA") : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setImproveTarget({ id: r.id, title: r.title })}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary text-primary-foreground font-display font-semibold hover:opacity-90"
                        title="Améliorer avec l'IA"
                      >
                        <Sparkles className="w-3 h-3" /> Améliorer
                      </button>
                      <Link to={`/${r.slug}`} target="_blank" className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Voir la page">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {improveTarget && (
        <ImproveDialog
          pageId={improveTarget.id}
          pageTitle={improveTarget.title}
          onClose={() => setImproveTarget(null)}
          onApplied={load}
        />
      )}
    </div>
  );
}

function SortableTh({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th className="text-left px-3 py-2 font-semibold">
      <button onClick={onClick} className={`inline-flex items-center gap-1 ${active ? "text-foreground" : ""}`}>
        {label}{active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function GoogleStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Non connecté</span>;
  const map: Record<string, { label: string; cls: string }> = {
    indexed: { label: "Indexée", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
    pending: { label: "En cours", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    unknown: { label: "Inconnue", cls: "bg-muted text-muted-foreground" },
    not_indexed: { label: "Non indexée", cls: "bg-destructive/15 text-destructive" },
  };
  const s = map[status] ?? map.unknown;
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-display font-semibold ${s.cls}`}>{s.label}</span>;
}

/* =========================================================================
 * SEARCH CONSOLE TAB — connect, sync, top pages/queries, quick wins
 * ========================================================================= */
type GscRow = {
  page_id: string; period: string;
  clicks: number; impressions: number; ctr: number; position: number;
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
  seo_pages: { slug: string; title: string } | null;
};

function GscTab() {
  const [rows, setRows] = useState<GscRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState<"7d" | "28d" | "90d">("28d");
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("seo_gsc_metrics")
      .select("page_id, period, clicks, impressions, ctr, position, top_queries, fetched_at, seo_pages:page_id (slug, title)")
      .eq("period", period)
      .order("impressions", { ascending: false })
      .limit(500);
    setRows(((data ?? []) as unknown) as GscRow[]);
    const first = data?.[0] as { fetched_at?: string } | undefined;
    if (first?.fetched_at) setLastFetched(first.fetched_at);
    setLoading(false);
  };
  useEffect(() => { load(); }, [period]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await invokeWithFreshSession("seo-gsc-sync", {});
      if (error) throw new Error(error.message);
      const d = data as { error?: string; ok?: boolean; upserts?: number };
      if (d?.error) throw new Error(d.error);
      toast.success(`Synchronisation terminée (${d.upserts ?? 0} mises à jour)`);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      if (msg.includes("Domaine non vérifié")) {
        toast.error("Domaine vracquebec.ca non vérifié dans Google Search Console. Vérifiez la propriété d'abord.");
      } else if (msg.includes("Connecteur")) {
        toast.error("Google Search Console non connecté. Connectez le connecteur dans Paramètres > Connecteurs.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSyncing(false);
    }
  };

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        clicks: acc.clicks + (r.clicks || 0),
        impressions: acc.impressions + (r.impressions || 0),
        positionSum: acc.positionSum + (r.position || 0) * (r.impressions || 0),
      }),
      { clicks: 0, impressions: 0, positionSum: 0 },
    );
  }, [rows]);
  const avgPosition = totals.impressions > 0 ? totals.positionSum / totals.impressions : 0;
  const avgCtr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;

  const quickWins = useMemo(
    () => rows.filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= 10).slice(0, 10),
    [rows],
  );
  const topPages = useMemo(() => rows.filter((r) => r.clicks > 0).slice(0, 10), [rows]);
  const topQueries = useMemo(() => {
    const map = new Map<string, { clicks: number; impressions: number; position: number }>();
    for (const r of rows) {
      for (const q of r.top_queries ?? []) {
        const cur = map.get(q.query) ?? { clicks: 0, impressions: 0, position: 0 };
        map.set(q.query, { clicks: cur.clicks + (q.clicks || 0), impressions: cur.impressions + (q.impressions || 0), position: q.position });
      }
    }
    return Array.from(map.entries()).map(([query, m]) => ({ query, ...m })).sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-extrabold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Google Search Console
          </h2>
          <p className="text-xs text-muted-foreground font-body mt-1">
            Synchronisez les clics, impressions, CTR et positions de toutes vos pages SEO. Nécessite que le connecteur <strong>Google Search Console</strong> soit relié et que le domaine <code className="text-primary">vracquebec.ca</code> soit vérifié.
            {lastFetched && <> · Dernière synchro : {new Date(lastFetched).toLocaleString("fr-CA")}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="px-2 py-2 rounded-lg border border-border bg-card text-sm font-body">
            <option value="7d">7 jours</option>
            <option value="28d">28 jours</option>
            <option value="90d">90 jours</option>
          </select>
          <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold shadow hover:opacity-90 disabled:opacity-60">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? "Synchronisation…" : "Synchroniser"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Clics" value={totals.clicks} />
        <StatCard label="Impressions" value={totals.impressions} />
        <StatCard label="CTR moyen" value={`${(avgCtr * 100).toFixed(2)} %` as unknown as number} />
        <StatCard label="Position moy." value={avgPosition ? Number(avgPosition.toFixed(1)) : 0} />
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm font-body">
          Aucune donnée pour cette période. Cliquez sur <strong>Synchroniser</strong> pour importer.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelList title="Pages les plus performantes" emptyText="Aucun clic sur cette période.">
            {topPages.map((r) => (
              <li key={r.page_id} className="flex items-center justify-between gap-3 py-2 px-3 border-b border-border last:border-0">
                <Link to={`/${r.seo_pages?.slug ?? ""}`} target="_blank" className="font-body text-foreground hover:text-primary truncate max-w-[260px]">{r.seo_pages?.title ?? r.page_id}</Link>
                <div className="text-xs text-muted-foreground shrink-0 flex gap-3">
                  <span><strong>{r.clicks}</strong> clics</span>
                  <span>{r.impressions} imp.</span>
                  <span>#{r.position.toFixed(1)}</span>
                </div>
              </li>
            ))}
          </PanelList>

          <PanelList title="Quick wins (position 8-20)" emptyText="Aucune page à optimiser en priorité.">
            {quickWins.map((r) => (
              <li key={r.page_id} className="flex items-center justify-between gap-3 py-2 px-3 border-b border-border last:border-0">
                <Link to={`/${r.seo_pages?.slug ?? ""}`} target="_blank" className="font-body text-foreground hover:text-primary truncate max-w-[260px]">{r.seo_pages?.title ?? r.page_id}</Link>
                <div className="text-xs text-muted-foreground shrink-0 flex gap-3">
                  <span>#{r.position.toFixed(1)}</span>
                  <span>{r.impressions} imp.</span>
                </div>
              </li>
            ))}
          </PanelList>

          <PanelList title="Top requêtes" emptyText="Aucune requête indexée pour l'instant.">
            {topQueries.map((q, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 px-3 border-b border-border last:border-0">
                <span className="font-body text-foreground truncate max-w-[260px]">{q.query}</span>
                <div className="text-xs text-muted-foreground shrink-0 flex gap-3">
                  <span><strong>{q.clicks}</strong> clics</span>
                  <span>{q.impressions} imp.</span>
                  <span>#{q.position.toFixed(1)}</span>
                </div>
              </li>
            ))}
          </PanelList>
        </div>
      )}
    </div>
  );
}

function PanelList({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const empty = !arr || arr.length === 0 || arr.every((c) => !c);
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-3 py-2 border-b border-border font-display font-bold text-sm text-foreground">{title}</div>
      {empty ? <p className="p-4 text-xs text-muted-foreground">{emptyText}</p> : <ul>{children}</ul>}
    </div>
  );
}

/* =========================================================================
 * ASSISTANT IA — recommandations priorisées
 * ========================================================================= */
function AssistantTab() {
  const [recos, setRecos] = useState<Reco[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [pages, setPages] = useState<Record<string, { slug: string; title: string }>>({});
  const [improveTarget, setImproveTarget] = useState<{ id: string; title: string; slug: string } | null>(null);

  async function load() {
    setLoading(true);
    const [{ data }, { data: pageRows }] = await Promise.all([
      supabase.from("seo_recommendations").select("*").eq("status", "open").order("priority", { ascending: false }).order("impact_estimate", { ascending: false }).limit(200),
      supabase.from("seo_pages").select("id,slug,title"),
    ]);
    setRecos((data ?? []) as Reco[]);
    const map: Record<string, { slug: string; title: string }> = {};
    for (const p of pageRows ?? []) map[p.id] = { slug: p.slug, title: p.title };
    setPages(map);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function scan() {
    setScanning(true);
    try {
      // Analyse complète : orchestre scan + linkcheck + suggestions + rapport.
      const { error } = await invokeWithFreshSession("seo-strategic-report", {});
      if (error) throw error;
      toast.success("Analyse complète terminée — rapport stratégique généré");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setScanning(false); }
  }

  async function apply(reco: Reco) {
    // Route selon action_type
    if (reco.action_type === "improve" && reco.page_id) {
      const p = pages[reco.page_id];
      if (p) { setImproveTarget({ id: reco.page_id, slug: p.slug, title: p.title }); return; }
    }
    if (reco.action_type === "create" && reco.payload) {
      toast.info("Ouvre l'onglet Générateur pour créer cette combinaison.");
    }
    if (reco.action_type === "update_meta" && reco.page_id) {
      const p = pages[reco.page_id];
      if (p) { setImproveTarget({ id: reco.page_id, slug: p.slug, title: p.title }); return; }
    }
    await supabase.from("seo_recommendations").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", reco.id);
    toast.success("Marquée comme traitée");
    await load();
  }

  async function dismiss(reco: Reco) {
    await supabase.from("seo_recommendations").update({ status: "dismissed" }).eq("id", reco.id);
    await load();
  }

  const filtered = filter === "all" ? recos : recos.filter((r) => r.reco_type === filter);
  const top10 = [...recos].sort((a, b) => (b.impact_estimate / b.effort_estimate) - (a.impact_estimate / a.effort_estimate)).slice(0, 10);
  const types = Array.from(new Set(recos.map((r) => r.reco_type)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Assistant SEO IA</h2>
          <p className="text-sm text-muted-foreground">Recommandations concrètes générées à partir de vos pages, du blogue et de Google Search Console.</p>
        </div>
        <button type="button" onClick={scan} disabled={scanning}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-display font-semibold text-sm flex items-center gap-2 disabled:opacity-60">
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Analyser maintenant
        </button>
      </div>

      {recos.length > 0 && (
        <section>
          <h3 className="text-sm font-display font-bold uppercase tracking-wide text-muted-foreground mb-3">Top 10 actions les plus rentables</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {top10.map((r) => (
              <RecommendationCard key={r.id} reco={r} onApply={apply} onDismiss={dismiss}
                onOpen={(rr) => rr.entity_slug && window.open(`/${rr.entity_slug}`, "_blank")} />
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter("all")}
          className={`text-xs px-2.5 py-1 rounded-full border ${filter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
          Toutes ({recos.length})
        </button>
        {types.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`text-xs px-2.5 py-1 rounded-full border ${filter === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            {t} ({recos.filter((r) => r.reco_type === t).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Aucune recommandation. Cliquez sur « Analyser maintenant » pour lancer un scan.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <RecommendationCard key={r.id} reco={r} onApply={apply} onDismiss={dismiss}
              onOpen={(rr) => rr.entity_slug && window.open(`/${rr.entity_slug}`, "_blank")} />
          ))}
        </div>
      )}

      {improveTarget && (
        <ImproveDialog pageId={improveTarget.id} pageTitle={improveTarget.title}
          onClose={() => setImproveTarget(null)}
          onApplied={() => { setImproveTarget(null); void load(); }} />
      )}
    </div>
  );
}

/* =========================================================================
 * OBJECTIFS SEO
 * ========================================================================= */
function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("seo_goals").select("*").order("active", { ascending: false }).order("created_at", { ascending: true });
    setGoals((data ?? []) as Goal[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const { error } = await invokeWithFreshSession("seo-goals-refresh", {});
      if (error) throw error;
      toast.success("Objectifs recalculés");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setRefreshing(false); }
  }

  async function save() {
    if (!editing || !editing.label || !editing.metric_type || editing.target_value == null) return;
    const payload = {
      label: editing.label, metric_type: editing.metric_type,
      target_value: editing.target_value, keyword: editing.keyword ?? null,
      deadline: editing.deadline ?? null, active: editing.active ?? true,
    };
    if (editing.id) await supabase.from("seo_goals").update(payload).eq("id", editing.id);
    else await supabase.from("seo_goals").insert(payload);
    setEditing(null);
    await load();
  }

  async function del(id: string) {
    if (!confirm("Supprimer cet objectif ?")) return;
    await supabase.from("seo_goals").delete().eq("id", id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Objectifs SEO</h2>
          <p className="text-sm text-muted-foreground">Suivi automatique de vos indicateurs clés.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refresh} disabled={refreshing}
            className="border border-border px-3 py-2 rounded text-sm font-display flex items-center gap-2 disabled:opacity-60">
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Recalculer
          </button>
          <button type="button" onClick={() => setEditing({ label: "", metric_type: "indexed_pages", target_value: 100, active: true })}
            className="bg-primary text-primary-foreground px-3 py-2 rounded text-sm font-display font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouvel objectif
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g}
              onEdit={() => setEditing(g)}
              onDelete={() => void del(g.id)} />
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full space-y-3">
            <h3 className="font-display font-bold text-lg">{editing.id ? "Éditer" : "Nouvel"} objectif</h3>
            <input className="w-full border border-border rounded px-3 py-2 text-sm bg-background" placeholder="Nom (ex: 500 pages indexées)"
              value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            <select className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
              value={editing.metric_type ?? "indexed_pages"} onChange={(e) => setEditing({ ...editing, metric_type: e.target.value })}>
              <option value="indexed_pages">Pages indexées</option>
              <option value="total_pages">Pages publiées</option>
              <option value="organic_clicks_month">Clics organiques / mois</option>
              <option value="avg_ctr">CTR moyen (0.05 = 5%)</option>
              <option value="avg_seo_score">Score SEO moyen</option>
              <option value="submissions_month">Soumissions / mois</option>
              <option value="keyword_rank">Position d'un mot-clé</option>
            </select>
            <input type="number" step="0.01" className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
              placeholder="Cible" value={editing.target_value ?? 0}
              onChange={(e) => setEditing({ ...editing, target_value: Number(e.target.value) })} />
            {editing.metric_type === "keyword_rank" && (
              <input className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
                placeholder="Mot-clé cible" value={editing.keyword ?? ""}
                onChange={(e) => setEditing({ ...editing, keyword: e.target.value })} />
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button className="text-sm px-3 py-1.5 rounded border border-border" onClick={() => setEditing(null)}>Annuler</button>
              <button className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground font-display font-semibold" onClick={save}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * CONCURRENTS
 * ========================================================================= */
type Competitor = { id: string; domain: string; label: string | null; active: boolean; last_crawled_at: string | null; pages_count: number };
function CompetitorsTab() {
  const [comps, setComps] = useState<Competitor[]>([]);
  const [gaps, setGaps] = useState<Array<{ city_slug: string; material_slug: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [crawling, setCrawling] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: cpRows }, { data: ourPages }] = await Promise.all([
      supabase.from("seo_competitors").select("*").order("created_at", { ascending: true }),
      supabase.from("seo_competitor_pages").select("city_slug,material_slug").not("city_slug", "is", null).not("material_slug", "is", null),
      supabase.from("seo_pages").select("city_slug,material_slug"),
    ]);
    setComps((c ?? []) as Competitor[]);
    const our = new Set((ourPages ?? []).map((p) => `${p.city_slug}|${p.material_slug ?? ""}`));
    const gapMap = new Map<string, number>();
    for (const r of cpRows ?? []) {
      const key = `${r.city_slug}|${r.material_slug}`;
      if (!our.has(key)) gapMap.set(key, (gapMap.get(key) ?? 0) + 1);
    }
    setGaps([...gapMap.entries()].map(([k, count]) => {
      const [city_slug, material_slug] = k.split("|");
      return { city_slug, material_slug, count };
    }).sort((a, b) => b.count - a.count).slice(0, 30));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function addCompetitor() {
    if (!newDomain.trim()) return;
    if (comps.length >= 5) { toast.error("Maximum 5 concurrents."); return; }
    const domain = newDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    const { error } = await supabase.from("seo_competitors").insert({ domain, label: domain });
    if (error) toast.error(error.message);
    else { setNewDomain(""); await load(); }
  }

  async function crawl(id: string) {
    setCrawling(id);
    try {
      const { error } = await invokeWithFreshSession("seo-competitor-crawl", { competitor_id: id });
      if (error) throw error;
      toast.success("Crawl terminé");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setCrawling(null); }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce concurrent et toutes ses pages ?")) return;
    await supabase.from("seo_competitors").delete().eq("id", id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Analyse concurrents</h2>
        <p className="text-sm text-muted-foreground">Ajoutez jusqu'à 5 domaines concurrents. L'IA analyse leurs pages et repère les combinaisons ville × matériau que vous n'avez pas.</p>
      </div>

      <div className="flex items-center gap-2">
        <input className="flex-1 border border-border rounded px-3 py-2 text-sm bg-background"
          placeholder="concurrent.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
        <button onClick={addCompetitor} disabled={comps.length >= 5}
          className="bg-primary text-primary-foreground px-3 py-2 rounded text-sm font-display font-semibold flex items-center gap-1 disabled:opacity-50">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr><th className="p-2 text-left">Domaine</th><th className="p-2 text-right">Pages</th><th className="p-2 text-left">Dernier crawl</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{c.domain}</td>
                  <td className="p-2 text-right">{c.pages_count}</td>
                  <td className="p-2 text-xs text-muted-foreground">{c.last_crawled_at ? new Date(c.last_crawled_at).toLocaleDateString("fr-CA") : "—"}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button onClick={() => crawl(c.id)} disabled={crawling === c.id}
                      className="text-xs border border-border rounded px-2 py-1 mr-1 hover:bg-secondary">
                      {crawling === c.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Crawler"}
                    </button>
                    <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">Supprimer</button>
                  </td>
                </tr>
              ))}
              {comps.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-xs text-muted-foreground">Aucun concurrent ajouté.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <section>
          <h3 className="text-sm font-display font-bold uppercase tracking-wide text-muted-foreground mb-3">Écarts détectés — combinaisons chez les concurrents qui vous manquent</h3>
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                <tr><th className="p-2 text-left">Ville</th><th className="p-2 text-left">Matériau</th><th className="p-2 text-right">Concurrents</th></tr>
              </thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={`${g.city_slug}-${g.material_slug}`} className="border-t border-border">
                    <td className="p-2">{g.city_slug}</td>
                    <td className="p-2">{g.material_slug}</td>
                    <td className="p-2 text-right font-display font-bold">{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* =========================================================================
 * PRODUCTION QUEUE — 4 priority queues + wave runner + QA gating
 * ========================================================================= */
type QueueItem = {
  key: string;
  priority: 1 | 2 | 3 | 4;
  label: string;
  sub: string;
  city?: { slug: string; name: string; region: string };
  material?: { slug: string; name: string; short_name?: string; description?: string };
  service?: { slug: string; name: string; description?: string };
  existing?: { id: string; slug: string; status: string; qa_last_score: number | null; qa_last_checked_at: string | null; qa_blockers: string[] | null };
  score: number;
};

function ProductionTab() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterP, setFilterP] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [waveSize, setWaveSize] = useState(25);
  const [threshold, setThreshold] = useState(90);
  const [running, setRunning] = useState(false);
  const [pauseFlag, setPauseFlag] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: "" });
  const [log, setLog] = useState<Array<{ ts: number; msg: string; tone: "info" | "ok" | "warn" | "err" }>>([]);

  const pushLog = (msg: string, tone: "info" | "ok" | "warn" | "err" = "info") =>
    setLog((l) => [{ ts: Date.now(), msg, tone }, ...l].slice(0, 200));

  type WaveEntry = {
    label: string; priority: 1 | 2 | 3 | 4;
    ok: boolean; score?: number;
    blockers: string[]; warnings: string[]; keywords: string[];
    slug?: string; error?: string;
    status: "published" | "draft" | "rejected";
  };
  const [waveEntries, setWaveEntries] = useState<WaveEntry[]>([]);
  const [avgSecPerItem, setAvgSecPerItem] = useState<number>(35);
  const [showReport, setShowReport] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: mats }, { data: svcs }, catalog, { data: pgs }] = await Promise.all([
      supabase.from("seo_materials").select("slug, name, short_name, description, sort_order").eq("active", true).order("sort_order"),
      supabase.from("seo_services").select("slug, name, description, sort_order").eq("active", true).order("sort_order"),
      supabase.rpc("seo_generator_catalog" as never),
      supabase.from("seo_pages").select("id, slug, city_slug, material_slug, service_slug, status, qa_last_score, qa_last_checked_at, qa_blockers"),
    ]);
    const cts = ((catalog.data as unknown as { cities?: GeneratorCity[] })?.cities ?? []).sort((a, b) => (b.request_count - a.request_count) || a.name.localeCompare(b.name));
    const pageIndex = new Map<string, QueueItem["existing"]>();
    for (const p of pgs ?? []) {
      const k = [p.service_slug ?? "", p.material_slug ?? "", p.city_slug ?? ""].join("|");
      pageIndex.set(k, { id: p.id, slug: p.slug, status: p.status, qa_last_score: p.qa_last_score, qa_last_checked_at: p.qa_last_checked_at, qa_blockers: p.qa_blockers });
    }
    const queue: QueueItem[] = [];
    // P1 — Matériaux (page dédiée : material seul, sans ville). Pour Vrac Québec on couvre par la ville « quebec » comme hub.
    // Ici on prend material × ville hub (Québec) pour créer une page vitrine du matériau.
    const hub = (cts ?? []).find((c) => c.slug === "quebec") ?? (cts ?? [])[0];
    for (const m of mats ?? []) {
      const key = ["", m.slug, hub?.slug ?? ""].join("|");
      queue.push({
        key: `p1:${m.slug}`,
        priority: 1,
        label: `Matériau — ${m.name}`,
        sub: `Page hub matériau (${hub?.name ?? "—"})`,
        material: { slug: m.slug, name: m.name, short_name: m.short_name, description: m.description },
        city: hub ? { slug: hub.slug, name: hub.name, region: hub.region } : undefined,
        existing: pageIndex.get(key),
        score: 100 - (m.sort_order ?? 0),
      });
    }
    // P2 — Services
    for (const s of svcs ?? []) {
      const key = [s.slug, "", hub?.slug ?? ""].join("|");
      queue.push({
        key: `p2:${s.slug}`,
        priority: 2,
        label: `Service — ${s.name}`,
        sub: `Page hub service (${hub?.name ?? "—"})`,
        service: { slug: s.slug, name: s.name, description: s.description },
        city: hub ? { slug: hub.slug, name: hub.name, region: hub.region } : undefined,
        existing: pageIndex.get(key),
        score: 90 - (s.sort_order ?? 0),
      });
    }
    // P3 — Villes / secteurs (une page par ville, sans matériau ni service → hub local)
    for (const c of cts.filter((city) => city.request_count > 0)) {
      const key = ["", "", c.slug].join("|");
      queue.push({
        key: `p3:${c.slug}`,
        priority: 3,
        label: `Ville — ${c.name}`,
        sub: `${c.region}${c.population ? ` — ${c.population.toLocaleString("fr-CA")} hab.` : ""}`,
        city: { slug: c.slug, name: c.name, region: c.region },
        existing: pageIndex.get(key),
        score: Math.min(80, Math.round(((c.population ?? 0) / 3000))),
      });
    }
    // P4 — Combinaisons matériau × ville (top villes × tous matériaux)
    const topCities = cts;
    for (const c of topCities) {
      for (const signal of c.materials) {
        const m = (mats ?? []).find((item) => item.slug === signal.slug);
        if (!m) continue;
        const key = ["", m.slug, c.slug].join("|");
        queue.push({
          key: `p4:${m.slug}:${c.slug}`,
          priority: 4,
          label: `${m.name} — ${c.name}`,
          sub: "Combinaison matériau × ville",
          material: { slug: m.slug, name: m.name, short_name: m.short_name, description: m.description },
          city: { slug: c.slug, name: c.name, region: c.region },
          existing: pageIndex.get(key),
          score: Math.min(60, Math.round(((c.population ?? 0) / 5000))) + (10 - (m.sort_order ?? 0)),
        });
      }
    }
    setItems(queue);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const list = filterP === 0 ? items : items.filter((i) => i.priority === filterP);
    return [...list].sort((a, b) => {
      // Missing/draft first, then by score desc, then priority asc.
      const aDone = a.existing?.status === "published" && (a.existing.qa_last_score ?? 0) >= 90;
      const bDone = b.existing?.status === "published" && (b.existing.qa_last_score ?? 0) >= 90;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.score - a.score;
    });
  }, [items, filterP]);

  async function generateOne(it: QueueItem, thr: number): Promise<{ ok: boolean; score?: number; blockers?: string[]; warnings?: string[]; slug?: string; error?: string }> {
    const body: Record<string, unknown> = { force: false, publish: false, allow_ai: true };
    if (it.city) body.city = it.city;
    if (it.material) body.material = it.material;
    if (it.service) body.service = it.service;
    const gen = await invokeWithFreshSession<Record<string, unknown>, { page?: { id: string; slug?: string }; error?: string }>("seo-generate-page", body);
    if (gen.error || !gen.data?.page?.id) return { ok: false, error: gen.error?.message || gen.data?.error || "Erreur génération" };
    const pageId = gen.data.page.id;
    const qa = await invokeWithFreshSession<{ page_id: string; threshold: number; enforce_draft: boolean }, { score?: number; blockers?: string[]; warnings?: string[]; error?: string }>("seo-qa-check", { page_id: pageId, threshold: thr, enforce_draft: true });
    if (qa.error) return { ok: false, error: qa.error.message };
    return { ok: true, score: qa.data?.score, blockers: qa.data?.blockers, warnings: qa.data?.warnings, slug: gen.data.page.slug };
  }

  async function runWave(source: "filtered" | "missing", size: number, thr: number) {
    if (running) return;
    const sourcePool = source === "missing" ? filtered.filter((i) => !i.existing) : filtered;
    const pool = sourcePool.slice(0, size);
    if (pool.length === 0) return;
    if (!window.confirm(`Créer et vérifier ${pool.length} brouillon(s) non indexable(s)? Aucune publication et aucun écrasement.`)) return;
    setPauseFlag(false);
    setRunning(true);
    setLog([]);
    setWaveEntries([]);
    setShowReport(false);
    setProgress({ done: 0, total: pool.length, current: "" });
    pushLog(`Démarrage vague : ${pool.length} pages, seuil QA ${thr}.`, "info");
    for (let i = 0; i < pool.length; i++) {
      if (pauseFlag) { pushLog("Pause demandée.", "warn"); break; }
      const it = pool[i];
      setProgress({ done: i, total: pool.length, current: it.label });
      const t0 = Date.now();
      const res = await generateOne(it, thr);
      const dt = (Date.now() - t0) / 1000;
      setAvgSecPerItem((prev) => (i === 0 ? dt : prev * 0.7 + dt * 0.3));
      const keywords = [it.material?.name, it.service?.name, it.city?.name].filter(Boolean) as string[];
      const status: WaveEntry["status"] = !res.ok ? "rejected" : "draft";
      setWaveEntries((prev) => [...prev, {
        label: it.label, priority: it.priority, ok: res.ok, score: res.score,
        blockers: res.blockers ?? [], warnings: res.warnings ?? [], keywords,
        slug: res.slug, error: res.error, status,
      }]);
      if (!res.ok) {
        pushLog(`❌ ${it.label} — ${res.error}`, "err");
        // brief backoff on 429/402-style errors
        await new Promise((r) => setTimeout(r, 3000));
      } else if ((res.blockers?.length ?? 0) > 0) {
        pushLog(`⚠️ ${it.label} — score ${res.score}, gardée en brouillon (${res.blockers!.length} bloqueur(s))`, "warn");
      } else {
        pushLog(`✅ ${it.label} — score ${res.score} (brouillon non indexable)`, "ok");
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    setProgress((p) => ({ ...p, done: p.total, current: "" }));
    setRunning(false);
    setShowReport(true);
    await load();
    toast.success("Vague terminée.");
  }

  const waveStats = useMemo(() => {
    const s = { published: 0, draft: 0, rejected: 0, total: waveEntries.length, avgScore: 0 };
    let sum = 0, n = 0;
    for (const e of waveEntries) {
      s[e.status]++;
      if (typeof e.score === "number") { sum += e.score; n++; }
    }
    s.avgScore = n ? Math.round(sum / n) : 0;
    return s;
  }, [waveEntries]);

  const etaSec = running && progress.total > 0
    ? Math.max(0, Math.round((progress.total - progress.done) * avgSecPerItem))
    : 0;

  function downloadReport() {
    const rows = [
      ["priorite","page","statut","score","bloqueurs","avertissements","mots_cles","slug","erreur"],
      ...waveEntries.map((e) => [
        `P${e.priority}`, e.label, e.status, String(e.score ?? ""),
        e.blockers.join(" | "), e.warnings.join(" | "), e.keywords.join(" | "),
        e.slug ?? "", e.error ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rapport-vague-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const counts = useMemo(() => {
    const c = { p1: 0, p2: 0, p3: 0, p4: 0, missing: 0, ready: 0, draft: 0 };
    for (const it of items) {
      c[`p${it.priority}` as "p1" | "p2" | "p3" | "p4"]++;
      if (!it.existing) c.missing++;
      else if (it.existing.status === "published" && (it.existing.qa_last_score ?? 0) >= 90) c.ready++;
      else c.draft++;
    }
    return c;
  }, [items]);

  if (loading) return <div className="text-sm text-muted-foreground p-6"><Spinner /> Chargement de la file…</div>;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-display font-bold text-foreground">File de production</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Génération progressive avec contrôle qualité automatique (unicité, structure, maillage, Schema.org, FAQ, CTA). Les pages qui n'atteignent pas le seuil restent en brouillon.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Metric label="P1 Matériaux" value={counts.p1} />
        <Metric label="P2 Services" value={counts.p2} />
        <Metric label="P3 Villes" value={counts.p3} />
        <Metric label="P4 Combinaisons" value={counts.p4} />
        <Metric label="Publiées OK" value={counts.ready} />
        <Metric label="À produire" value={counts.missing} />
      </section>

      <section className="border border-border rounded-lg p-4 bg-card space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Priorité</label>
            <select value={filterP} onChange={(e) => setFilterP(Number(e.target.value) as 0 | 1 | 2 | 3 | 4)} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
              <option value={0}>Toutes</option>
              <option value={1}>P1 — Matériaux</option>
              <option value={2}>P2 — Services</option>
              <option value={3}>P3 — Villes</option>
              <option value={4}>P4 — Combinaisons</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Taille de vague</label>
            <input type="number" min={1} max={100} value={waveSize} onChange={(e) => setWaveSize(Number(e.target.value) || 1)} className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Seuil QA</label>
            <input type="number" min={50} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 90)} className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button disabled={running} onClick={() => runWave("missing", waveSize, threshold)} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50">
              <Play className="w-4 h-4" /> Générer les {waveSize} prochaines manquantes
            </button>
            <button disabled={running} onClick={() => runWave("filtered", waveSize, threshold)} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50">
              <RotateCcw className="w-4 h-4" /> Regénérer les {waveSize} affichées
            </button>
            {running && (
              <button onClick={() => setPauseFlag(true)} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-semibold">
                <Pause className="w-4 h-4" /> Pause
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground w-full">Vagues préconfigurées :</span>
          <button disabled={running} onClick={() => { setWaveSize(25); setThreshold(90); runWave("missing", 25, 90); }} className="text-xs rounded-md border border-border px-2 py-1 hover:bg-secondary">S1 — 25 pages</button>
          <button disabled={running} onClick={() => { setWaveSize(40); setThreshold(88); runWave("missing", 40, 88); }} className="text-xs rounded-md border border-border px-2 py-1 hover:bg-secondary">S2 — 40 pages</button>
          <button disabled={running} onClick={() => { setWaveSize(30); setThreshold(85); runWave("missing", 30, 85); }} className="text-xs rounded-md border border-border px-2 py-1 hover:bg-secondary">S3 — 30 combos</button>
        </div>
        {(running || progress.total > 0) && (
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{progress.current || (running ? "…" : "Terminé")}</span>
              <span>
                {progress.done} / {progress.total}
                {etaSec > 0 && ` • ~${Math.floor(etaSec / 60)}m ${etaSec % 60}s restants`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </section>

      {waveEntries.length > 0 && (
        <section className="border border-border rounded-lg p-4 bg-card space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-display font-bold">Tableau de bord de la vague</h3>
            <div className="flex gap-2">
              <button onClick={() => setShowReport((v) => !v)} className="text-xs rounded-md border border-border px-2 py-1 hover:bg-secondary inline-flex items-center gap-1">
                <FileText className="w-3 h-3" /> {showReport ? "Masquer" : "Voir"} le rapport
              </button>
              <button onClick={downloadReport} className="text-xs rounded-md border border-border px-2 py-1 hover:bg-secondary inline-flex items-center gap-1">
                <Download className="w-3 h-3" /> CSV
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Metric label="Prévues" value={progress.total || waveStats.total} />
            <Metric label="Publiées" value={waveStats.published} />
            <Metric label="Brouillons" value={waveStats.draft} />
            <Metric label="Rejetées" value={waveStats.rejected} />
            <Metric label="Score moyen" value={waveStats.avgScore || "—"} />
          </div>
          {showReport && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">
                Rapport de vague — à valider avant de lancer la vague suivante. Les pages en brouillon nécessitent une révision selon les bloqueurs listés.
              </p>
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {waveEntries.map((e, i) => (
                  <div key={i} className="text-xs border border-border rounded-md p-2 bg-background">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-semibold text-foreground">
                        <span className="font-mono text-muted-foreground mr-2">P{e.priority}</span>
                        {e.label}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={
                          e.status === "published" ? "text-primary font-semibold" :
                          e.status === "draft" ? "text-amber-600 font-semibold" :
                          "text-red-500 font-semibold"
                        }>
                          {e.status === "published" ? "✅ publiée" : e.status === "draft" ? "⚠️ brouillon" : "❌ rejetée"}
                          {typeof e.score === "number" && ` — ${e.score}/100`}
                        </span>
                        {e.slug && <Link to={`/${e.slug}`} target="_blank" className="text-muted-foreground hover:text-foreground"><ExternalLink className="w-3 h-3" /></Link>}
                      </div>
                    </div>
                    {e.keywords.length > 0 && (
                      <div className="mt-1 text-muted-foreground">
                        <span className="font-semibold">Mots-clés :</span> {e.keywords.join(" · ")}
                      </div>
                    )}
                    {e.blockers.length > 0 && (
                      <div className="mt-1 text-red-600">
                        <span className="font-semibold">À corriger :</span> {e.blockers.join(" ; ")}
                      </div>
                    )}
                    {e.warnings.length > 0 && (
                      <div className="mt-1 text-amber-600">
                        <span className="font-semibold">Avertissements :</span> {e.warnings.join(" ; ")}
                      </div>
                    )}
                    {e.error && (
                      <div className="mt-1 text-red-500">
                        <span className="font-semibold">Erreur :</span> {e.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">P</th>
                <th className="px-3 py-2 text-left">Page</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-left">QA</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((it) => (
                <tr key={it.key} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">P{it.priority}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-foreground">{it.label}</div>
                    <div className="text-xs text-muted-foreground">{it.sub}</div>
                  </td>
                  <td className="px-3 py-2">
                    {!it.existing ? <span className="text-xs text-muted-foreground">à créer</span>
                      : it.existing.status === "published" ? <span className="text-xs text-primary font-semibold">publiée</span>
                      : <span className="text-xs text-amber-600 font-semibold">brouillon</span>}
                  </td>
                  <td className="px-3 py-2">
                    <QaReportBadge score={it.existing?.qa_last_score} blockers={it.existing?.qa_blockers ?? []} checkedAt={it.existing?.qa_last_checked_at} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button disabled={running} onClick={async () => {
                      setRunning(true); setLog([]);
                      setProgress({ done: 0, total: 1, current: it.label });
                      const res = await generateOne(it, threshold);
                      pushLog(res.ok ? `✅ ${it.label} — score ${res.score}` : `❌ ${it.label} — ${res.error}`, res.ok ? "ok" : "err");
                      setProgress({ done: 1, total: 1, current: "" });
                      setRunning(false); await load();
                    }} className="text-xs rounded-md border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50 inline-flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Générer & vérifier
                    </button>
                    {it.existing && (
                      <Link to={`/${it.existing.slug}`} target="_blank" className="ml-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun élément.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
        <aside className="border border-border rounded-lg bg-card p-3 h-fit max-h-[600px] overflow-y-auto">
          <h3 className="text-sm font-display font-bold mb-2">Journal</h3>
          {log.length === 0 ? <p className="text-xs text-muted-foreground">Aucune activité pour le moment.</p> : (
            <ul className="space-y-1 text-xs">
              {log.map((l) => (
                <li key={l.ts} className={
                  l.tone === "ok" ? "text-primary" :
                  l.tone === "warn" ? "text-amber-600" :
                  l.tone === "err" ? "text-red-500" : "text-muted-foreground"
                }>
                  <span className="opacity-60 mr-1">{new Date(l.ts).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  {l.msg}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>
    </div>
  );
}
