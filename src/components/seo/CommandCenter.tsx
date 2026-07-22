import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, TrendingUp, TrendingDown, ExternalLink, AlertTriangle,
  CheckCircle2, AlertCircle, Sparkles, FileText, MapPin, Package,
  Wrench, Eye, Phone, MessageCircle, Send, RefreshCw, Search,
} from "lucide-react";
import StrategicReport from "@/components/seo/StrategicReport";
import CoverageOverview from "@/components/seo/CoverageOverview";
import WaveRunner from "@/components/seo/WaveRunner";
import PipelineControlCenter from "@/components/seo/PipelineControlCenter";
import { useSeoStats } from "@/lib/seo/useSeoStats";

type PageRow = {
  id: string; slug: string; title: string; status: string;
  seo_score: number | null; qa_last_score: number | null;
  google_index_status: string | null; needs_refresh: boolean;
  last_generated_at: string | null; created_at: string; view_count: number;
  internal_link_count: number; word_count: number;
  meta_title: string | null; meta_description: string | null;
  city_slug: string; material_slug: string | null; service_slug: string | null;
};

type GscRow = { page_id: string; impressions: number; clicks: number; ctr: number; position: number };
type EventRow = { page_slug: string; event_type: string };

type Health = "green" | "yellow" | "red";

export default function CommandCenter() {
  const [loading, setLoading] = useState(true);
  const { stats, error: statsError, reload: reloadStats } = useSeoStats();
  const [pages, setPages] = useState<PageRow[]>([]);
  const [gsc, setGsc] = useState<Map<string, GscRow>>(new Map());
  const [events, setEvents] = useState<Map<string, { view: number; phone: number; whatsapp: number; submission: number; cta: number }>>(new Map());
  const [transportReqCount, setTransportReqCount] = useState(0);
  const [cities, setCities] = useState<{ slug: string; name: string }[]>([]);
  const [materials, setMaterials] = useState<{ slug: string; name: string }[]>([]);
  const [services, setServices] = useState<{ slug: string; name: string }[]>([]);
  const [blogPosts, setBlogPosts] = useState<{ id: string; title: string; slug: string; status: string; published_at: string | null; updated_at: string }[]>([]);
  const [brokenLinks, setBrokenLinks] = useState(0);

  async function loadAll() {
    setLoading(true);
    const since30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const [pagesRes, gscRes, eventsRes, trRes, citiesRes, matsRes, svcRes, blogRes, brokenRes] = await Promise.all([
      supabase.from("seo_pages").select("id,slug,title,status,seo_score,qa_last_score,google_index_status,needs_refresh,last_generated_at,created_at,view_count,internal_link_count,word_count,meta_title,meta_description,city_slug,material_slug,service_slug").limit(5000),
      supabase.from("seo_gsc_metrics").select("page_id,impressions,clicks,ctr,position").eq("period", "28d"),
      supabase.from("seo_page_events").select("page_slug,event_type").gte("occurred_at", since30).limit(50000),
      supabase.from("transport_requests").select("id", { count: "exact", head: true }).gte("created_at", since30),
      supabase.from("seo_cities").select("slug,name").eq("active", true),
      supabase.from("seo_materials").select("slug,name").eq("active", true),
      supabase.from("seo_services").select("slug,name").eq("active", true),
      supabase.from("blog_posts").select("id,title,slug,status,published_at,updated_at").order("updated_at", { ascending: false }).limit(20),
      supabase.from("seo_broken_links").select("id", { count: "exact", head: true }),
    ]);
    setPages((pagesRes.data ?? []) as PageRow[]);
    const gMap = new Map<string, GscRow>();
    for (const g of (gscRes.data ?? []) as GscRow[]) gMap.set(g.page_id, g);
    setGsc(gMap);
    const eMap = new Map<string, { view: number; phone: number; whatsapp: number; submission: number; cta: number }>();
    for (const e of (eventsRes.data ?? []) as EventRow[]) {
      const cur = eMap.get(e.page_slug) ?? { view: 0, phone: 0, whatsapp: 0, submission: 0, cta: 0 };
      if (e.event_type === "view") cur.view++;
      else if (e.event_type === "phone_click") cur.phone++;
      else if (e.event_type === "whatsapp_click") cur.whatsapp++;
      else if (e.event_type === "submission") cur.submission++;
      else if (e.event_type === "cta_click") cur.cta++;
      eMap.set(e.page_slug, cur);
    }
    setEvents(eMap);
    setTransportReqCount(trRes.count ?? 0);
    setCities((citiesRes.data ?? []) as { slug: string; name: string }[]);
    setMaterials((matsRes.data ?? []) as { slug: string; name: string }[]);
    setServices((svcRes.data ?? []) as { slug: string; name: string }[]);
    setBlogPosts((blogRes.data ?? []) as typeof blogPosts);
    setBrokenLinks(brokenRes.count ?? 0);
    setLoading(false);
  }

  useEffect(() => { void loadAll(); }, []);

  const overview = useMemo(() => {
    const total = pages.length;
    const published = pages.filter((p) => p.status === "published").length;
    const drafts = pages.filter((p) => p.status === "draft").length;
    const rejected = pages.filter((p) => p.status === "rejected").length;
    const indexed = pages.filter((p) => p.google_index_status === "indexed").length;
    const notIndexed = pages.filter((p) => p.status === "published" && p.google_index_status && p.google_index_status !== "indexed").length;
    const seoAvg = avg(pages.map((p) => p.seo_score).filter((n): n is number => typeof n === "number"));
    const qaAvg = avg(pages.map((p) => p.qa_last_score).filter((n): n is number => typeof n === "number"));
    const lastGen = maxDate(pages.map((p) => p.last_generated_at));
    const lastIdx = maxDate(pages.map((p) => (p as unknown as { google_last_checked_at: string | null }).google_last_checked_at ?? null));
    return { total, published, drafts, rejected, indexed, notIndexed, seoAvg, qaAvg, lastGen, lastIdx };
  }, [pages]);

  const performance = useMemo(() => {
    const rows = pages.map((p) => {
      const g = gsc.get(p.id);
      const ev = events.get(p.slug) ?? { view: 0, phone: 0, whatsapp: 0, submission: 0, cta: 0 };
      const conversions = ev.phone + ev.whatsapp + ev.submission;
      const score = (g?.clicks ?? 0) * 3 + conversions * 5 + ev.view;
      return { page: p, gsc: g, ev, conversions, score };
    });
    const top = [...rows].filter((r) => r.page.status === "published").sort((a, b) => b.score - a.score).slice(0, 10);
    const worst = [...rows]
      .filter((r) => r.page.status === "published" && (r.gsc?.impressions ?? 0) > 20)
      .sort((a, b) => (a.gsc?.ctr ?? 0) - (b.gsc?.ctr ?? 0))
      .slice(0, 10);
    return { top, worst };
  }, [pages, gsc, events]);

  const opportunities = useMemo(() => {
    const usedCities = new Set(pages.map((p) => p.city_slug));
    const usedMaterials = new Set(pages.filter((p) => p.material_slug).map((p) => p.material_slug as string));
    const usedServices = new Set(pages.filter((p) => p.service_slug).map((p) => p.service_slug as string));
    const missingCities = cities.filter((c) => !usedCities.has(c.slug));
    const missingMaterials = materials.filter((m) => !usedMaterials.has(m.slug));
    const missingServices = services.filter((s) => !usedServices.has(s.slug));
    const totalCombos = cities.length * materials.length;
    const existingCombos = new Set(pages.filter((p) => p.material_slug).map((p) => `${p.city_slug}|${p.material_slug}`));
    const missingCombos = Math.max(0, totalCombos - existingCombos.size);
    const cutoff = Date.now() - 60 * 86400 * 1000;
    const toRefresh = pages.filter((p) => p.status === "published" && (p.needs_refresh || (p.last_generated_at && new Date(p.last_generated_at).getTime() < cutoff))).slice(0, 10);
    const positionDrops = pages
      .map((p) => ({ p, g: gsc.get(p.id) }))
      .filter((r) => r.g && r.g.position > 15 && r.g.impressions > 30)
      .sort((a, b) => (b.g!.impressions - a.g!.impressions))
      .slice(0, 10);
    return { missingCities, missingMaterials, missingServices, missingCombos, toRefresh, positionDrops };
  }, [pages, cities, materials, services, gsc]);

  const health = useMemo(() => {
    const published = pages.filter((p) => p.status === "published");
    const linkAvg = avg(published.map((p) => p.internal_link_count));
    const linksHealth: Health = linkAvg >= 5 ? "green" : linkAvg >= 2 ? "yellow" : "red";
    const missingMeta = published.filter((p) => !p.meta_title || !p.meta_description || (p.meta_description?.length ?? 0) < 80).length;
    const metaHealth: Health = missingMeta === 0 ? "green" : missingMeta / Math.max(1, published.length) < 0.1 ? "yellow" : "red";
    // duplicate meta_title detection
    const titles = new Map<string, number>();
    for (const p of published) if (p.meta_title) titles.set(p.meta_title, (titles.get(p.meta_title) ?? 0) + 1);
    const dupes = [...titles.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
    const dupHealth: Health = dupes === 0 ? "green" : dupes < 5 ? "yellow" : "red";
    const orphans = published.filter((p) => p.internal_link_count === 0).length;
    const orphanHealth: Health = orphans === 0 ? "green" : orphans < 5 ? "yellow" : "red";
    const notIndexed = overview.notIndexed;
    const idxHealth: Health = notIndexed === 0 ? "green" : notIndexed < 5 ? "yellow" : "red";
    const brokenHealth: Health = brokenLinks === 0 ? "green" : brokenLinks < 5 ? "yellow" : "red";
    return [
      { label: "Maillage interne", state: linksHealth, detail: `${linkAvg.toFixed(1)} liens / page en moyenne` },
      { label: "Métadonnées", state: metaHealth, detail: `${missingMeta} pages sans meta complète` },
      { label: "Contenu dupliqué", state: dupHealth, detail: `${dupes} titres partagés` },
      { label: "Pages orphelines", state: orphanHealth, detail: `${orphans} pages sans lien entrant` },
      { label: "Pages non indexées", state: idxHealth, detail: `${notIndexed} publiées non indexées` },
      { label: "Search Console — liens cassés", state: brokenHealth, detail: `${brokenLinks} liens à corriger` },
    ];
  }, [pages, overview, brokenLinks]);

  const contentCenter = useMemo(() => {
    const recent = [...pages].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 8);
    const drafts = pages.filter((p) => p.status === "draft").slice(0, 8);
    const toUpdate = opportunities.toRefresh.slice(0, 8);
    const recentBlog = blogPosts.filter((b) => b.status === "published").slice(0, 6);
    const blogDrafts = blogPosts.filter((b) => b.status === "draft").slice(0, 6);
    return { recent, drafts, toUpdate, recentBlog, blogDrafts };
  }, [pages, opportunities, blogPosts]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" /> Chargement du centre de pilotage…</div>;
  }

  const totalEvents = [...events.values()].reduce(
    (a, e) => ({ view: a.view + e.view, phone: a.phone + e.phone, whatsapp: a.whatsapp + e.whatsapp, submission: a.submission + e.submission }),
    { view: 0, phone: 0, whatsapp: 0, submission: 0 },
  );
  const totalGsc = [...gsc.values()].reduce((a, g) => ({ impressions: a.impressions + g.impressions, clicks: a.clicks + g.clicks }), { impressions: 0, clicks: 0 });

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-foreground">Centre de pilotage SEO</h1>
          <p className="text-sm text-muted-foreground font-body mt-1">Vue stratégique en temps réel — où nous en sommes, ce qui fonctionne, ce qui doit être amélioré.</p>
        </div>
        <button onClick={loadAll} className="inline-flex items-center gap-2 text-xs font-display font-semibold px-3 py-1.5 rounded-md border border-border hover:border-primary hover:text-primary">
          <RefreshCw className="w-3.5 h-3.5" /> Actualiser
        </button>
      </header>

      <StrategicReport />

      <PipelineControlCenter />

      <WaveRunner />

      {stats && (
        <section>
          <SectionTitle>Source unique — chiffres consolidés</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Pages totales" value={stats.pages_total} />
            <Stat label="Publiées" value={stats.pages_published} tone="good" />
            <Stat label="Brouillons" value={stats.pages_draft} />
            <Stat label="À corriger" value={stats.pages_needs_fix} tone={stats.pages_needs_fix > 0 ? "warn" : "good"} />
            <Stat label="Villes couvertes" value={`${stats.cities_covered}/${stats.cities_total} (${stats.coverage_cities_pct}%)`} />
            <Stat label="Matériaux couverts" value={`${stats.materials_covered}/${stats.materials_total} (${stats.coverage_materials_pct}%)`} />
            <Stat label="Services couverts" value={`${stats.services_covered}/${stats.services_total} (${stats.coverage_services_pct}%)`} />
            <Stat label="Combinaisons" value={`${stats.combinations_created}/${stats.combinations_possible} (${stats.coverage_combinations_pct}%)`} />
            <Stat label="Score SEO moyen" value={stats.seo_avg ? `${stats.seo_avg}/100` : "—"} />
            <Stat label="Score QA moyen" value={stats.qa_avg ? `${stats.qa_avg}/100` : "—"} />
            <Stat label="Impressions GSC" value={stats.gsc_impressions.toLocaleString("fr-CA")} />
            <Stat label="Clics GSC" value={stats.gsc_clicks.toLocaleString("fr-CA")} />
          </div>
        </section>
      )}
      {statsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          Statistiques indisponibles — {statsError}
          <button onClick={() => void reloadStats()} className="ml-2 underline">Réessayer</button>
        </div>
      )}

      <section>
        <SectionTitle>Couverture territoriale</SectionTitle>
        <CoverageOverview />
      </section>

      {/* Vue d'ensemble */}
      <section>
        <SectionTitle>Vue d'ensemble</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Total pages" value={overview.total} />
          <Stat label="Publiées" value={overview.published} tone="good" />
          <Stat label="Brouillons" value={overview.drafts} />
          <Stat label="Rejetées" value={overview.rejected} tone={overview.rejected > 0 ? "warn" : undefined} />
          <Stat label="Score SEO moyen" value={overview.seoAvg ? `${Math.round(overview.seoAvg)}/100` : "—"} />
          <Stat label="Indexées Google" value={overview.indexed} tone="good" />
          <Stat label="Non indexées" value={overview.notIndexed} tone={overview.notIndexed > 0 ? "warn" : "good"} />
          <Stat label="Score qualité (QA)" value={overview.qaAvg ? `${Math.round(overview.qaAvg)}/100` : "—"} />
          <Stat label="Dernière génération" value={fmtRel(overview.lastGen)} />
          <Stat label="Dernière indexation" value={fmtRel(overview.lastIdx)} />
        </div>
      </section>

      {/* Santé SEO */}
      <section>
        <SectionTitle>Santé SEO</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {health.map((h) => <HealthCard key={h.label} label={h.label} state={h.state} detail={h.detail} />)}
        </div>
      </section>

      {/* Performance */}
      <section>
        <SectionTitle>Performances (30 derniers jours)</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <Stat label="Impressions" value={totalGsc.impressions.toLocaleString("fr-CA")} />
          <Stat label="Clics Google" value={totalGsc.clicks.toLocaleString("fr-CA")} />
          <Stat label="Vues site" value={totalEvents.view.toLocaleString("fr-CA")} />
          <Stat label="Appels ☎" value={totalEvents.phone.toLocaleString("fr-CA")} />
          <Stat label="WhatsApp" value={totalEvents.whatsapp.toLocaleString("fr-CA")} />
          <Stat label="Demandes" value={(totalEvents.submission + transportReqCount).toLocaleString("fr-CA")} tone="good" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PerformanceList title="🏆 Top 10 pages performantes" rows={performance.top} kind="top" />
          <PerformanceList title="📉 Top 10 pages à améliorer" rows={performance.worst} kind="worst" />
        </div>
      </section>

      {/* Opportunités */}
      <section>
        <SectionTitle>Opportunités SEO</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <OppList
            title="Matériaux sans page"
            icon={Package}
            items={opportunities.missingMaterials.map((m) => ({ label: m.name, href: `/admin/seo?tab=generator&material=${m.slug}` }))}
            emptyText="Tous les matériaux ont au moins une page."
          />
          <OppList
            title="Villes sans page"
            icon={MapPin}
            items={opportunities.missingCities.map((c) => ({ label: c.name, href: `/admin/seo?tab=generator&city=${c.slug}` }))}
            emptyText="Toutes les villes actives sont couvertes."
          />
          <OppList
            title="Services sans page"
            icon={Wrench}
            items={opportunities.missingServices.map((s) => ({ label: s.name, href: `/admin/seo?tab=generator&service=${s.slug}` }))}
            emptyText="Tous les services sont couverts."
          />
          <OppList
            title="Nouvelles combinaisons possibles"
            icon={Sparkles}
            items={opportunities.missingCombos > 0 ? [{ label: `${opportunities.missingCombos} combinaisons ville × matériau à générer`, href: "/admin/seo?tab=coverage" }] : []}
            emptyText="Matrice de couverture complète."
          />
          <OppList
            title="Pages à mettre à jour"
            icon={RefreshCw}
            items={opportunities.toRefresh.map((p) => ({ label: p.title, href: `/${p.slug}` }))}
            emptyText="Toutes les pages sont récentes."
          />
          <OppList
            title="Pages loin du top 10 (positions > 15)"
            icon={TrendingDown}
            items={opportunities.positionDrops.map((r) => ({ label: `${r.p.title} — pos. ${r.g!.position.toFixed(1)}`, href: `/${r.p.slug}` }))}
            emptyText="Aucune chute significative détectée."
          />
        </div>
      </section>

      {/* Centre de contenu */}
      <section>
        <SectionTitle>Centre de contenu</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MiniList title="Dernières pages créées" icon={FileText} rows={contentCenter.recent.map((p) => ({ id: p.id, label: p.title, sub: fmtRel(p.created_at), href: `/${p.slug}` }))} />
          <MiniList title="Derniers articles de blogue" icon={FileText} rows={contentCenter.recentBlog.map((b) => ({ id: b.id, label: b.title, sub: fmtRel(b.published_at ?? b.updated_at), href: `/blog/${b.slug}` }))} />
          <MiniList title="Brouillons SEO en attente" icon={AlertCircle} rows={contentCenter.drafts.map((p) => ({ id: p.id, label: p.title, sub: `Score ${p.seo_score ?? "—"}`, href: `/admin/seo?tab=pages` }))} />
          <MiniList title="Contenu à mettre à jour" icon={RefreshCw} rows={contentCenter.toUpdate.map((p) => ({ id: p.id, label: p.title, sub: `Générée ${fmtRel(p.last_generated_at)}`, href: `/${p.slug}` }))} />
        </div>
      </section>
    </div>
  );
}

/* ---------- helpers ---------- */

function avg(nums: number[]): number { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; }
function maxDate(dates: (string | null)[]): string | null {
  let m: string | null = null;
  for (const d of dates) if (d && (!m || d > m)) m = d;
  return m;
}
function fmtRel(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-display font-bold text-foreground mb-3">{children}</h2>;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "warn" }) {
  const cls = tone === "good" ? "text-primary" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground font-display uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-display font-extrabold tabular-nums mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

function HealthCard({ label, state, detail }: { label: string; state: Health; detail: string }) {
  const cfg = {
    green: { dot: "bg-primary", text: "text-primary", Icon: CheckCircle2, tag: "Excellent" },
    yellow: { dot: "bg-amber-500", text: "text-amber-500", Icon: AlertTriangle, tag: "À surveiller" },
    red: { dot: "bg-red-500", text: "text-red-500", Icon: AlertCircle, tag: "Action requise" },
  }[state];
  const Icon = cfg.Icon;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display font-semibold text-foreground text-sm">{label}</div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-display font-semibold ${cfg.text}`}>
          <Icon className="w-3.5 h-3.5" /> {cfg.tag}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
        <span className="text-xs text-muted-foreground font-body">{detail}</span>
      </div>
    </div>
  );
}

type PerfRow = {
  page: PageRow;
  gsc: GscRow | undefined;
  ev: { view: number; phone: number; whatsapp: number; submission: number; cta: number };
  conversions: number;
};

function PerformanceList({ title, rows, kind }: { title: string; rows: PerfRow[]; kind: "top" | "worst" }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-display font-bold text-foreground text-sm">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4">Pas encore de données.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={r.page.id} className="p-3 flex items-center gap-3">
              <div className="w-6 text-center text-xs font-display font-bold text-muted-foreground">{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="font-body text-sm text-foreground truncate">{r.page.title}</div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">/{r.page.slug}</div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                {kind === "top" ? (
                  <>
                    <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{r.ev.view}</span>
                    <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{r.ev.phone}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{r.ev.whatsapp}</span>
                    <span className="inline-flex items-center gap-1 text-primary font-display font-bold"><Send className="w-3 h-3" />{r.ev.submission}</span>
                  </>
                ) : (
                  <>
                    <span>Impr. {r.gsc?.impressions ?? 0}</span>
                    <span>CTR {((r.gsc?.ctr ?? 0) * 100).toFixed(1)}%</span>
                    <span>Pos. {(r.gsc?.position ?? 0).toFixed(1)}</span>
                  </>
                )}
                <Link to={`/${r.page.slug}`} target="_blank" className="text-primary hover:underline"><ExternalLink className="w-3 h-3" /></Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OppList({ title, icon: Icon, items, emptyText }: { title: string; icon: React.ComponentType<{ className?: string }>; items: { label: string; href: string }[]; emptyText: string }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-display font-bold text-foreground text-sm inline-flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h3>
        <span className="text-xs text-muted-foreground font-display">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> {emptyText}</p>
      ) : (
        <ul className="divide-y divide-border max-h-64 overflow-y-auto">
          {items.slice(0, 20).map((it, i) => (
            <li key={i} className="p-2.5 text-sm flex items-center justify-between gap-2">
              <span className="font-body text-foreground truncate">{it.label}</span>
              <Link to={it.href} className="text-primary hover:underline text-xs shrink-0 inline-flex items-center gap-1"><Search className="w-3 h-3" /> Ouvrir</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniList({ title, icon: Icon, rows }: { title: string; icon: React.ComponentType<{ className?: string }>; rows: { id: string; label: string; sub: string; href: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-display font-bold text-foreground text-sm inline-flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4">Rien pour le moment.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-sm text-foreground truncate">{r.label}</div>
                <div className="text-[11px] text-muted-foreground">{r.sub}</div>
              </div>
              <Link to={r.href} className="text-primary hover:underline text-xs shrink-0"><ExternalLink className="w-3 h-3 inline" /></Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}