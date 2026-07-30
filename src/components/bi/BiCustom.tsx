// Tableau de bord personnalisé — chaque administrateur choisit ses widgets et leur ordre.
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { money, num, table, type Analytics, type Overview, type Row } from "@/lib/bi/api";
import { BarBlock, KpiCard, PieBlock, SectionCard } from "./BiShared";

type Widget = { id: string; label: string };

export const WIDGETS: Widget[] = [
  { id: "kpi_revenue_month", label: "Indicateur — CA du mois" },
  { id: "kpi_revenue_year", label: "Indicateur — CA de l'année" },
  { id: "kpi_orders", label: "Indicateur — Commandes de la période" },
  { id: "kpi_conversion", label: "Indicateur — Taux de conversion" },
  { id: "kpi_net_margin", label: "Indicateur — Marge nette" },
  { id: "kpi_avg_order", label: "Indicateur — Valeur moyenne d'une commande" },
  { id: "chart_material", label: "Graphique — Ventes par matériau" },
  { id: "chart_city", label: "Graphique — Ventes par ville" },
  { id: "chart_category", label: "Graphique — Répartition par catégorie" },
  { id: "chart_client", label: "Graphique — Ventes par client" },
  { id: "chart_carrier", label: "Graphique — Ventes par transporteur" },
];

export default function BiCustom({ overview, analytics, companyId }: {
  overview: Overview | null; analytics: Analytics | null; companyId: string | null;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    const { data } = await table("jsc_bi_layouts").select("id,widgets").eq("user_id", auth.user.id).limit(1).maybeSingle();
    if (data) { setLayoutId(data.id); setSelected((data.widgets as string[]) ?? []); }
    else setSelected(["kpi_revenue_month", "kpi_orders", "kpi_net_margin", "chart_material", "chart_city"]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = { user_id: auth.user?.id, company_id: companyId, widgets: selected, updated_at: new Date().toISOString() };
    const { data, error } = layoutId
      ? await table("jsc_bi_layouts").update(payload).eq("id", layoutId).select("id").maybeSingle()
      : await table("jsc_bi_layouts").insert(payload).select("id").maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (data?.id) setLayoutId(data.id);
    toast.success("Tableau de bord enregistré.");
  };

  const move = (id: string, dir: -1 | 1) => {
    setSelected((prev) => {
      const i = prev.indexOf(id), j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const rows = (k: string) => ((analytics?.[k] as Row[]) ?? []);

  const render = (id: string) => {
    if (!overview) return null;
    switch (id) {
      case "kpi_revenue_month": return <KpiCard key={id} label="CA du mois" value={money(overview.revenue.month)} />;
      case "kpi_revenue_year": return <KpiCard key={id} label="CA de l'année" value={money(overview.revenue.year)} />;
      case "kpi_orders": return <KpiCard key={id} label="Commandes" value={num(overview.counts.orders)} current={overview.counts.orders} previous={overview.counts.orders_previous} />;
      case "kpi_conversion": return <KpiCard key={id} label="Taux de conversion" value={`${num(overview.averages.conversion_pct, 1)} %`} />;
      case "kpi_net_margin": return <KpiCard key={id} label="Marge nette" value={money(overview.profitability.net_margin)} hint={`${num(overview.profitability.net_margin_pct, 1)} % du CA`} />;
      case "kpi_avg_order": return <KpiCard key={id} label="Valeur moyenne d'une commande" value={money(overview.averages.order_value)} />;
      case "chart_material": return <SectionCard key={id} title="Ventes par matériau"><BarBlock rows={rows("sales_by_material")} xKey="name" yKey="revenue" /></SectionCard>;
      case "chart_city": return <SectionCard key={id} title="Ventes par ville"><BarBlock rows={rows("sales_by_city")} xKey="name" yKey="revenue" /></SectionCard>;
      case "chart_category": return <SectionCard key={id} title="Répartition par catégorie"><PieBlock rows={rows("sales_by_category")} nameKey="name" valueKey="revenue" /></SectionCard>;
      case "chart_client": return <SectionCard key={id} title="Ventes par client"><BarBlock rows={rows("sales_by_client")} xKey="name" yKey="revenue" /></SectionCard>;
      case "chart_carrier": return <SectionCard key={id} title="Ventes par transporteur"><BarBlock rows={rows("sales_by_carrier")} xKey="name" yKey="revenue" /></SectionCard>;
      default: return null;
    }
  };

  if (loading) {
    return <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</p>;
  }

  const kpis = selected.filter((id) => id.startsWith("kpi_"));
  const charts = selected.filter((id) => id.startsWith("chart_"));

  return (
    <div className="space-y-4">
      <SectionCard
        title="Composition du tableau de bord"
        subtitle="Choisissez vos widgets et leur ordre d'affichage"
        actions={<Button size="sm" onClick={save} disabled={saving} className="print:hidden">
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Enregistrer
        </Button>}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {WIDGETS.map((w) => {
            const on = selected.includes(w.id);
            return (
              <div key={w.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={on} onCheckedChange={() => toggle(w.id)} />
                  {w.label}
                </label>
                {on && (
                  <div className="flex">
                    <Button size="icon" variant="ghost" onClick={() => move(w.id, -1)} aria-label="Monter"><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => move(w.id, 1)} aria-label="Descendre"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {kpis.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{kpis.map(render)}</div>}
      {charts.length > 0 && <div className="grid gap-4 xl:grid-cols-2">{charts.map(render)}</div>}
      {selected.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucun widget sélectionné.</p>}
    </div>
  );
}