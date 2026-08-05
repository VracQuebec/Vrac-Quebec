import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ExternalLink, Phone, MessageCircle, Send, Eye, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type PageRow = { id: string; slug: string; title: string; status: string };
type Metrics = { impressions: number; clicks: number; position: number; ctr: number };
type EventCounts = { view: number; phone: number; whatsapp: number; submission: number; cta: number };
type Period = 7 | 28 | 90;

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export default function ConversionsTable() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [events, setEvents] = useState<Map<string, EventCounts>>(new Map());
  const [gsc, setGsc] = useState<Map<string, Metrics>>(new Map());
  const [ga4, setGa4] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<Period>(28);
  const [sort, setSort] = useState<"submissions" | "views" | "calls">("submissions");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const period = days === 7 ? "7d" : days === 28 ? "28d" : "90d";
      const [pagesRes, eventsRes, gscRes, ga4Res] = await Promise.all([
        supabase.from("seo_pages").select("id,slug,title,status").eq("status", "published").limit(2000),
        supabase.from("seo_page_events").select("page_slug,event_type").gte("occurred_at", since).limit(50000),
        supabase.from("seo_gsc_metrics").select("page_id,impressions,clicks,position,ctr").eq("period", period),
        supabase.from("ga4_page_metrics").select("page_path,page_views").eq("period", period),
      ]);
      const pgs = (pagesRes.data ?? []) as PageRow[];
      const evMap = new Map<string, EventCounts>();
      for (const e of (eventsRes.data ?? []) as { page_slug: string; event_type: string }[]) {
        const cur = evMap.get(e.page_slug) ?? { view: 0, phone: 0, whatsapp: 0, submission: 0, cta: 0 };
        if (e.event_type === "view") cur.view++;
        else if (e.event_type === "phone_click") cur.phone++;
        else if (e.event_type === "whatsapp_click") cur.whatsapp++;
        else if (e.event_type === "submission") cur.submission++;
        else if (e.event_type === "cta_click") cur.cta++;
        evMap.set(e.page_slug, cur);
      }
      const gMap = new Map<string, Metrics>();
      for (const g of (gscRes.data ?? []) as { page_id: string; impressions: number; clicks: number; position: number; ctr: number }[]) {
        gMap.set(g.page_id, { impressions: g.impressions, clicks: g.clicks, position: g.position, ctr: g.ctr });
      }
      setPages(pgs);
      setEvents(evMap);
      setGsc(gMap);
      const aMap = new Map<string, number>();
      for (const g of (ga4Res.data ?? []) as { page_path: string; page_views: number }[]) {
        const key = (g.page_path || "").replace(/^\/+|\/+$/g, "").toLowerCase();
        aMap.set(key, (aMap.get(key) ?? 0) + (g.page_views ?? 0));
      }
      setGa4(aMap);
      setLoading(false);
    })();
  }, [days]);

  const rows = useMemo(() => {
    const filter = q.trim().toLowerCase();
    const all = pages.map((p) => {
      const ev = events.get(p.slug) ?? { view: 0, phone: 0, whatsapp: 0, submission: 0, cta: 0 };
      const g = gsc.get(p.id) ?? { impressions: 0, clicks: 0, position: 0, ctr: 0 };
      // Si aucun évènement interne, on affiche les vues réelles remontées par GA4.
      if (!ev.view) ev.view = ga4.get(p.slug.toLowerCase()) ?? 0;
      const contacts = ev.phone + ev.whatsapp + ev.submission;
      return { ...p, ev, g, contacts };
    });
    const filtered = filter
      ? all.filter((r) => r.title.toLowerCase().includes(filter) || r.slug.includes(filter))
      : all;
    return filtered.sort((a, b) => {
      if (sort === "submissions") return b.ev.submission - a.ev.submission || b.contacts - a.contacts;
      if (sort === "calls") return (b.ev.phone + b.ev.whatsapp) - (a.ev.phone + a.ev.whatsapp);
      return b.ev.view - a.ev.view;
    });
  }, [pages, events, gsc, ga4, sort, q]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => {
      acc.view += r.ev.view;
      acc.phone += r.ev.phone;
      acc.whatsapp += r.ev.whatsapp;
      acc.submission += r.ev.submission;
      acc.impressions += r.g.impressions;
      acc.clicks += r.g.clicks;
      return acc;
    },
    { view: 0, phone: 0, whatsapp: 0, submission: 0, impressions: 0, clicks: 0 },
  ), [rows]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Conversions par page</h2>
          <p className="text-sm text-muted-foreground font-body mt-1">
            Vues, appels, WhatsApp et soumissions générés par chaque page SEO ({days} derniers jours).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 28, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d as Period)}
              className={`text-xs px-3 py-1.5 rounded-md font-display font-semibold ${days === d ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
            >
              {d} j
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricPill icon={Eye} label="Vues" value={totals.view} />
        <MetricPill icon={Phone} label="Appels" value={totals.phone} />
        <MetricPill icon={MessageCircle} label="WhatsApp" value={totals.whatsapp} />
        <MetricPill icon={Send} label="Soumissions" value={totals.submission} highlight />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="search"
          placeholder="Filtrer par page…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 rounded-md border border-border bg-background text-sm font-body"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="px-3 py-2 rounded-md border border-border bg-background text-sm font-body"
        >
          <option value="submissions">Trier par soumissions</option>
          <option value="calls">Trier par appels + WhatsApp</option>
          <option value="views">Trier par vues</option>
        </select>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <table className="text-xs font-body min-w-full">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-display font-semibold">Page</th>
              <th className="text-right px-2 py-2 font-display font-semibold">Impr.</th>
              <th className="text-right px-2 py-2 font-display font-semibold">Clics G.</th>
              <th className="text-right px-2 py-2 font-display font-semibold">Pos.</th>
              <th className="text-right px-2 py-2 font-display font-semibold">Vues</th>
              <th className="text-right px-2 py-2 font-display font-semibold">☎</th>
              <th className="text-right px-2 py-2 font-display font-semibold">WA</th>
              <th className="text-right px-2 py-2 font-display font-semibold text-primary">Soum.</th>
              <th className="text-right px-2 py-2 font-display font-semibold">Conv.</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <div className="font-display font-semibold text-foreground line-clamp-1 max-w-xs">{r.title}</div>
                  <div className="text-[10px] text-muted-foreground">/{r.slug}</div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.g.impressions.toLocaleString("fr-CA")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.g.clicks.toLocaleString("fr-CA")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.g.position ? r.g.position.toFixed(1) : "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.ev.view.toLocaleString("fr-CA")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.ev.phone.toLocaleString("fr-CA")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.ev.whatsapp.toLocaleString("fr-CA")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-display font-bold text-primary">{r.ev.submission.toLocaleString("fr-CA")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pct(r.contacts, r.ev.view)}</td>
                <td className="px-1 py-1.5 text-right">
                  <Link to={`/${r.slug}`} target="_blank" className="text-muted-foreground hover:text-primary inline-flex items-center">
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-muted-foreground text-sm">Aucune donnée sur la période.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground font-body flex items-center gap-1">
        <TrendingUp className="w-3 h-3" /> Conversion = (appels + WhatsApp + soumissions) ÷ vues suivies.
      </p>
    </div>
  );
}

function MetricPill({ icon: Icon, label, value, highlight }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-display uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-xl font-display font-extrabold tabular-nums mt-1 ${highlight ? "text-primary" : "text-foreground"}`}>
        {value.toLocaleString("fr-CA")}
      </div>
    </div>
  );
}