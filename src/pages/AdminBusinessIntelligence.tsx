import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, TrendingUp, TrendingDown, Loader2, MapPin, Package, Truck, BookOpen, Users, Calendar, RefreshCw, AlertTriangle, Target } from "lucide-react";
import { toast } from "sonner";

type Range = "today" | "7d" | "30d" | "12m";

const RANGE_LABELS: Record<Range, string> = {
  today: "Aujourd'hui",
  "7d": "7 jours",
  "30d": "30 jours",
  "12m": "12 mois",
};

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function rangeStart(r: Range) {
  if (r === "today") return startOfToday();
  if (r === "7d") return daysAgo(7);
  if (r === "30d") return daysAgo(30);
  return daysAgo(365);
}

function prevRangeStart(r: Range) {
  if (r === "today") return daysAgo(1);
  if (r === "7d") return daysAgo(14);
  if (r === "30d") return daysAgo(60);
  return daysAgo(730);
}

function pct(cur: number, prev: number) {
  if (!prev) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);
}

interface Kpi {
  label: string;
  value: string | number;
  delta?: number;
  icon: React.ElementType;
  hint?: string;
}

export default function AdminBusinessIntelligence() {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<any>(null);
  const [brief, setBrief] = useState<string>("");
  const [briefLoading, setBriefLoading] = useState(false);

  useEffect(() => {
    void load();
     
  }, [range]);

  async function load() {
    setLoading(true);
    try {
      const start = rangeStart(range);
      const prevStart = prevRangeStart(range);

      const [subsCur, subsPrev, subsToday, subsWeek, subsMonth, tripsCur, tripsPrev, trReqCur, trReqPrev, calEvents, seoEventsCur, seoEventsPrev, seoPages, gsc] = await Promise.all([
        supabase.from("submissions").select("id,created_at,city,materials,request_type,status,tonnage,quantity,assigned_entrepreneur,dompe_number,priority").gte("created_at", start),
        supabase.from("submissions").select("id,created_at,status,assigned_entrepreneur").gte("created_at", prevStart).lt("created_at", start),
        supabase.from("submissions").select("id", { count: "exact", head: true }).gte("created_at", startOfToday()),
        supabase.from("submissions").select("id", { count: "exact", head: true }).gte("created_at", startOfWeek()),
        supabase.from("submissions").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth()),
        supabase.from("lead_trips").select("id,total_with_tax,total_price,delivery_date,material,payment_status,created_at").gte("created_at", start),
        supabase.from("lead_trips").select("id,total_with_tax,total_price,created_at").gte("created_at", prevStart).lt("created_at", start),
        supabase.from("transport_requests").select("id,status,created_at,site_city,material_type,estimated_trips,desired_date,dump_submission_id,dump_name").gte("created_at", start),
        supabase.from("transport_requests").select("id,status,created_at").gte("created_at", prevStart).lt("created_at", start),
        supabase.from("calendar_events").select("id,start_at,status,dompe_number,material_type,client_name,trips_planned").gte("start_at", daysAgo(1)).lte("start_at", daysAgo(-14)),
        supabase.from("seo_page_events").select("id,event_type,page_slug,occurred_at").gte("occurred_at", start),
        supabase.from("seo_page_events").select("id,event_type,page_slug,occurred_at").gte("occurred_at", prevStart).lt("occurred_at", start),
        supabase.from("seo_pages").select("id,slug,title,status,city_slug,material_slug,service_slug,view_count").eq("status", "published"),
        supabase.from("seo_gsc_metrics").select("page_id,clicks,impressions,ctr,position,period").eq("period", "28d"),
      ]);

      const subs = subsCur.data ?? [];
      const subsP = subsPrev.data ?? [];
      const trips = tripsCur.data ?? [];
      const tripsP = tripsPrev.data ?? [];
      const trReq = trReqCur.data ?? [];
      const trReqP = trReqPrev.data ?? [];
      const events = calEvents.data ?? [];
      const seoEv = seoEventsCur.data ?? [];
      const seoEvP = seoEventsPrev.data ?? [];
      const pages = seoPages.data ?? [];
      const gscRows = gsc.data ?? [];

      // Aggregations
      const byCity = agg(subs, (s) => (s.city || "Inconnu").trim());
      const byMaterial = agg(subs, (s) => (Array.isArray(s.materials) && s.materials[0]) || "Non spécifié");
      const byDompe = agg(trips, (t) => t.material || "Autre");
      const byRequestType = agg(subs, (s) => s.request_type || "Autre");

      // SEO pages -> conversions (events keyed by slug)
      const submissionsBySlug = new Map<string, number>();
      seoEv.filter((e: any) => e.event_type === "submission").forEach((e: any) => {
        if (!e.page_slug) return;
        submissionsBySlug.set(e.page_slug, (submissionsBySlug.get(e.page_slug) ?? 0) + 1);
      });
      const submissionsByPage = new Map<string, number>();
      pages.forEach((p: any) => {
        const c = submissionsBySlug.get(p.slug) ?? 0;
        if (c > 0) submissionsByPage.set(p.id, c);
      });
      const topSeoPages = pages
        .map((p) => ({ ...p, conversions: submissionsByPage.get(p.id) ?? 0 }))
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 10);

      // Top dompes used (transport requests + calendar events)
      const dumpUse = new Map<string, { name: string; count: number }>();
      trReq.forEach((r) => {
        if (!r.dump_submission_id) return;
        const cur = dumpUse.get(r.dump_submission_id) ?? { name: r.dump_name || r.dump_submission_id, count: 0 };
        cur.count += 1;
        dumpUse.set(r.dump_submission_id, cur);
      });
      const topDompes = Array.from(dumpUse.entries())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Revenue
      const revenue = trips.reduce((s, t) => s + Number(t.total_with_tax || t.total_price || 0), 0);
      const revenuePrev = tripsP.reduce((s, t) => s + Number(t.total_with_tax || t.total_price || 0), 0);

      // Assigned / conversion
      const assigned = subs.filter((s) => s.assigned_entrepreneur).length;
      const assignedPrev = subsP.filter((s) => s.assigned_entrepreneur).length;
      const conversionRate = subs.length ? Math.round((assigned / subs.length) * 100) : 0;

      // Transport JSC board
      const trStatus = {
        pending: trReq.filter((r) => ["nouvelle", "en_attente", "pending"].includes((r.status || "").toLowerCase())).length,
        urgent: trReq.filter((r) => (r.status || "").toLowerCase() === "urgent").length,
        scheduledToday: events.filter((e) => (e.start_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
        inProgress: events.filter((e) => (e.status || "").toLowerCase() === "en_cours").length,
        done: events.filter((e) => ["terminé", "termine", "completed"].includes((e.status || "").toLowerCase())).length,
        cancelled: events.filter((e) => ["annulé", "annule", "cancelled"].includes((e.status || "").toLowerCase())).length,
      };

      // Under-served sectors: cities with high demand but no assigned entrepreneur or no dompe
      const demandByCity = new Map<string, { total: number; assigned: number; hasDump: number }>();
      subs.forEach((s) => {
        const c = (s.city || "").trim();
        if (!c) return;
        const cur = demandByCity.get(c) ?? { total: 0, assigned: 0, hasDump: 0 };
        cur.total += 1;
        if (s.assigned_entrepreneur) cur.assigned += 1;
        if (s.dompe_number) cur.hasDump += 1;
        demandByCity.set(c, cur);
      });
      const underserved = Array.from(demandByCity.entries())
        .map(([city, v]) => ({ city, ...v, gap: v.total - v.assigned }))
        .filter((c) => c.total >= 2 && c.assigned / Math.max(1, c.total) < 0.4)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 10);

      // SEO opportunities: pages with impressions but few conversions
      const opportunities = pages
        .map((p) => {
          const g = gscRows.find((x) => x.page_id === p.id);
          const conv = submissionsByPage.get(p.id) ?? 0;
          return { ...p, impressions: g?.impressions ?? 0, clicks: g?.clicks ?? 0, position: g?.position ?? null, conv };
        })
        .filter((p) => p.impressions >= 50 && p.conv === 0)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10);

      // Materials missing city coverage: cities with many submissions and no SEO page for their most requested material
      const missingSeo: { city: string; material: string; demand: number }[] = [];
      const citySlugFromName = (c: string) => c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      demandByCity.forEach((v, city) => {
        if (v.total < 2) return;
        const cSlug = citySlugFromName(city);
        const citySubs = subs.filter((s) => (s.city || "").trim() === city);
        const matCount = new Map<string, number>();
        citySubs.forEach((s) => (s.materials || []).forEach((m: string) => matCount.set(m, (matCount.get(m) ?? 0) + 1)));
        const top = Array.from(matCount.entries()).sort((a, b) => b[1] - a[1])[0];
        if (!top) return;
        const mSlug = citySlugFromName(top[0]);
        const exists = pages.some((p) => p.city_slug === cSlug && p.material_slug === mSlug);
        if (!exists) missingSeo.push({ city, material: top[0], demand: v.total });
      });
      missingSeo.sort((a, b) => b.demand - a.demand);

      setData({
        range,
        counts: {
          today: subsToday.count ?? 0,
          week: subsWeek.count ?? 0,
          month: subsMonth.count ?? 0,
          rangeSubs: subs.length,
          rangeSubsPrev: subsP.length,
          trReq: trReq.length,
          trReqPrev: trReqP.length,
          revenue,
          revenuePrev,
          assigned,
          assignedPrev,
          conversionRate,
          eventsDone: trStatus.done,
        },
        byCity: topN(byCity, 10),
        byMaterial: topN(byMaterial, 10),
        byDompe: topN(byDompe, 10),
        byRequestType: topN(byRequestType, 10),
        topSeoPages,
        topDompes,
        trStatus,
        underserved,
        opportunities,
        missingSeo: missingSeo.slice(0, 10),
        seoConversions: seoEv.filter((e) => e.event_type === "submission").length,
        seoConversionsPrev: seoEvP.filter((e) => e.event_type === "submission").length,
        seoCtaClicks: seoEv.filter((e) => e.event_type === "cta_click").length,
      });
    } catch (e: any) {
      console.error(e);
      toast.error("Erreur de chargement des données BI");
    } finally {
      setLoading(false);
    }
  }

  async function generateBrief() {
    if (!data) return;
    setBriefLoading(true);
    setBrief("");
    try {
      const metrics = {
        periode: RANGE_LABELS[range],
        demandes: { periode: data.counts.rangeSubs, precedent: data.counts.rangeSubsPrev, aujourdhui: data.counts.today, semaine: data.counts.week, mois: data.counts.month },
        transport: { demandes: data.counts.trReq, precedent: data.counts.trReqPrev, statut: data.trStatus },
        revenus: { periode: data.counts.revenue, precedent: data.counts.revenuePrev },
        conversion_pct: data.counts.conversionRate,
        top_villes: data.byCity.slice(0, 5),
        top_materiaux: data.byMaterial.slice(0, 5),
        top_dompes: data.topDompes.slice(0, 5),
        seo: {
          conversions: data.seoConversions,
          conversions_precedent: data.seoConversionsPrev,
          cta_clicks: data.seoCtaClicks,
          top_pages: data.topSeoPages.slice(0, 5).map((p: any) => ({ titre: p.title, conversions: p.conversions })),
          opportunites: data.opportunities.slice(0, 5).map((p: any) => ({ titre: p.title, impressions: p.impressions, position: p.position })),
        },
        secteurs_sous_exploites: data.underserved.slice(0, 5),
        combinaisons_manquantes: data.missingSeo.slice(0, 5),
      };
      const { data: res, error } = await invokeWithFreshSession("bi-daily-brief", { metrics });
      if (error) throw error;
      setBrief((res as any)?.brief || "");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Impossible de générer le briefing");
    } finally {
      setBriefLoading(false);
    }
  }

  const kpis: Kpi[] = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Nouvelles demandes aujourd'hui", value: data.counts.today, icon: TrendingUp },
      { label: "Cette semaine", value: data.counts.week, icon: Calendar },
      { label: "Ce mois-ci", value: data.counts.month, icon: Calendar },
      { label: `Demandes (${RANGE_LABELS[range]})`, value: data.counts.rangeSubs, delta: pct(data.counts.rangeSubs, data.counts.rangeSubsPrev), icon: TrendingUp },
      { label: "Demandes transport", value: data.counts.trReq, delta: pct(data.counts.trReq, data.counts.trReqPrev), icon: Truck },
      { label: "Demandes d'accès terminées", value: data.trStatus.done, icon: Truck },
      { label: "Assignées à un entrepreneur", value: data.counts.assigned, delta: pct(data.counts.assigned, data.counts.assignedPrev), icon: Users },
      { label: "Taux de conversion", value: `${data.counts.conversionRate}%`, icon: Target, hint: "Demandes assignées / demandes reçues" },
      { label: "Revenus facturés", value: fmtCurrency(data.counts.revenue), delta: pct(data.counts.revenue, data.counts.revenuePrev), icon: Package },
      { label: "Conversions SEO", value: data.seoConversions, delta: pct(data.seoConversions, data.seoConversionsPrev), icon: MapPin, hint: "Formulaires envoyés depuis une page SEO" },
    ];
  }, [data, range]);

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/admin" className="flex items-center gap-2 text-sm font-display font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Retour au CRM
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Actualiser
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 sm:px-6 py-6 space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">Business Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-1">Centre de pilotage — chaque chiffre pour prendre de meilleures décisions.</p>
          </div>
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-display font-semibold rounded-md transition-colors ${range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </header>

        {loading && !data && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement des indicateurs…
          </div>
        )}

        {data && (
          <>
            {/* KPIs */}
            <section>
              <h2 className="text-lg font-display font-bold mb-3">Vue d'ensemble</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {kpis.map((k) => (
                  <Card key={k.label} className="p-4">
                    <div className="flex items-start justify-between">
                      <k.icon className="w-4 h-4 text-primary" />
                      {typeof k.delta === "number" && (
                        <Badge variant={k.delta >= 0 ? "default" : "destructive"} className="text-[10px]">
                          {k.delta >= 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />} {k.delta >= 0 ? "+" : ""}{k.delta}%
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 text-2xl font-display font-bold">{k.value}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{k.label}</div>
                    {k.hint && <div className="text-[10px] text-muted-foreground/70 mt-1 italic">{k.hint}</div>}
                  </Card>
                ))}
              </div>
            </section>

            {/* AI Brief */}
            <section>
              <Card className="p-5 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-display font-bold">Copilote de direction</h2>
                  </div>
                  <Button size="sm" onClick={generateBrief} disabled={briefLoading}>
                    {briefLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                    {brief ? "Regénérer" : "Générer le briefing"}
                  </Button>
                </div>
                {!brief && !briefLoading && (
                  <p className="text-sm text-muted-foreground">Un résumé stratégique de la période, généré à partir de vos données réelles. Clique sur « Générer le briefing » pour l'obtenir.</p>
                )}
                {briefLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                    <Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…
                  </div>
                )}
                {brief && (
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap font-body text-foreground/90">{brief}</div>
                )}
              </Card>
            </section>

            {/* Transport JSC */}
            <section>
              <h2 className="text-lg font-display font-bold mb-3">Tableau de bord Transport JSC</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatusCard label="En attente" value={data.trStatus.pending} />
                <StatusCard label="Urgentes" value={data.trStatus.urgent} tone="urgent" />
                <StatusCard label="Planifiées aujourd'hui" value={data.trStatus.scheduledToday} />
                <StatusCard label="En cours" value={data.trStatus.inProgress} />
                <StatusCard label="Terminés" value={data.trStatus.done} tone="ok" />
                <StatusCard label="Annulés" value={data.trStatus.cancelled} tone="warn" />
              </div>
              <div className="mt-3">
                <Link to="/admin/calendrier" className="text-xs text-primary hover:underline">Ouvrir le calendrier interactif →</Link>
              </div>
            </section>

            {/* Performance Top 10 */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TopList title="Top villes (demandes)" icon={MapPin} rows={data.byCity} unit="demandes" />
              <TopList title="Top matériaux demandés" icon={Package} rows={data.byMaterial} unit="demandes" />
              <TopList title="Types de requêtes" icon={Truck} rows={data.byRequestType} unit="demandes" />
              <TopList title="Top dompes utilisées" icon={Package} rows={data.topDompes.map((d: any) => ({ label: d.name, value: d.count }))} unit="transports" />
              <TopList
                title="Top pages SEO (conversions)"
                icon={BookOpen}
                rows={data.topSeoPages.map((p: any) => ({ label: p.title || p.slug, value: p.conversions }))}
                unit="demandes"
              />
              <TopList
                title="Matériaux facturés (revenus)"
                icon={Package}
                rows={data.byDompe}
                unit="voyages"
              />
            </section>

            {/* Opportunities */}
            <section>
              <h2 className="text-lg font-display font-bold mb-3">Opportunités</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <h3 className="font-display font-semibold text-sm">Secteurs sous-exploités</h3>
                  </div>
                  {data.underserved.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun secteur avec un fort déficit détecté.</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.underserved.map((c: any) => (
                        <li key={c.city} className="flex justify-between items-center text-sm">
                          <span>{c.city}</span>
                          <span className="text-xs text-muted-foreground">{c.assigned}/{c.total} assignées</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2">Recruter un partenaire dans ces secteurs augmenterait la couverture.</p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-primary" />
                    <h3 className="font-display font-semibold text-sm">Pages SEO à activer</h3>
                  </div>
                  {data.opportunities.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune opportunité GSC détectée pour l'instant.</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.opportunities.slice(0, 6).map((p: any) => (
                        <li key={p.id} className="text-sm">
                          <div className="truncate font-medium">{p.title || p.slug}</div>
                          <div className="text-[11px] text-muted-foreground">{p.impressions} impressions · pos {p.position ? p.position.toFixed(1) : "-"}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link to="/admin/seo" className="text-[11px] text-primary hover:underline mt-2 inline-block">Optimiser dans le SEO Manager →</Link>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-primary" />
                    <h3 className="font-display font-semibold text-sm">Combinaisons ville × matériau manquantes</h3>
                  </div>
                  {data.missingSeo.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Toutes les combinaisons demandées sont couvertes.</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.missingSeo.map((m: any, i: number) => (
                        <li key={i} className="flex justify-between items-center text-sm">
                          <span>{m.material} · {m.city}</span>
                          <span className="text-xs text-muted-foreground">{m.demand} demandes</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2">Créer une page SEO dédiée capterait cette demande organique.</p>
                </Card>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function agg<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = key(r);
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return m;
}
function topN(m: Map<string, number>, n: number) {
  return Array.from(m.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, n);
}

function TopList({ title, rows, unit, icon: Icon }: { title: string; rows: { label: string; value: number }[]; unit: string; icon: React.ElementType }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune donnée sur la période.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="text-sm">
              <div className="flex justify-between gap-2 mb-1">
                <span className="truncate">{r.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">{r.value} {unit}</span>
              </div>
              <div className="h-1.5 rounded bg-secondary overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: number; tone?: "urgent" | "ok" | "warn" }) {
  const cls = tone === "urgent" ? "text-red-600" : tone === "ok" ? "text-primary" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <Card className="p-4">
      <div className={`text-2xl font-display font-bold ${cls}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}