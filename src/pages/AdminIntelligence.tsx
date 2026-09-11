// Centre d'Intelligence d'Affaires — cockpit décisionnel de Vrac Québec OS.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, BarChart3, Bell, FileSpreadsheet, Layout, Loader2, Printer,
  RefreshCw, ShieldCheck, Target, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import BiExecutive from "@/components/bi/BiExecutive";
import BiSales from "@/components/bi/BiSales";
import BiEntities from "@/components/bi/BiEntities";
import BiForecast from "@/components/bi/BiForecast";
import BiAlerts from "@/components/bi/BiAlerts";
import BiGoals from "@/components/bi/BiGoals";
import BiCustom from "@/components/bi/BiCustom";
import {
  PRESETS, exportExcel, rpc,
  type Alert, type Analytics, type Forecast, type Overview, type Row,
} from "@/lib/bi/api";

type Company = { id: string; name: string; is_default: boolean | null };

export default function AdminIntelligence() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [preset, setPreset] = useState("year");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const [from, to] = useMemo(
    () => (PRESETS.find((p) => p.id === preset) ?? PRESETS[4]).range(),
    [preset],
  );

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data } = await supabase
        .from("jsc_companies").select("id,name,is_default").is("archived_at", null).order("created_at");
      const list = (data as Company[]) ?? [];
      setCompanies(list);
      setCompanyId((prev) => prev ?? (list.find((c) => c.is_default)?.id ?? list[0]?.id ?? null));
    })();
  }, [isAdmin]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const args = { _company_id: companyId, _from: from, _to: to };
    const [o, a, f, al] = await Promise.all([
      rpc("jsc_bi_overview", args),
      rpc("jsc_bi_analytics", args),
      rpc("jsc_bi_forecast", { _company_id: companyId, _months: 12 }),
      rpc("jsc_bi_alerts", { _company_id: companyId }),
    ]);
    const err = o.error ?? a.error ?? f.error ?? al.error;
    if (err) toast.error(err.message);
    setOverview((o.data as Overview) ?? null);
    setAnalytics((a.data as Analytics) ?? null);
    setForecast((f.data as Forecast) ?? null);
    setAlerts(((al.data as { alerts?: Alert[] })?.alerts) ?? []);
    setLoading(false);
  }, [isAdmin, companyId, from, to]);

  useEffect(() => { void load(); }, [load]);

  const exportAll = async () => {
    if (!analytics || !overview) return;
    const sheets: Record<string, Row[]> = {
      Synthese: [{
        Période: `${from} → ${to}`,
        "CA période": overview.revenue.period,
        "CA mois": overview.revenue.month,
        "CA année": overview.revenue.year,
        Demandes: overview.counts.requests,
        Soumissions: overview.counts.quotes,
        Commandes: overview.counts.orders,
        Livraisons: overview.counts.deliveries,
        "Taux conversion %": overview.averages.conversion_pct,
        "Valeur moyenne commande": overview.averages.order_value,
        "Marge brute": overview.profitability.gross_margin,
        "Marge nette": overview.profitability.net_margin,
      }],
      Mensuel: overview.monthly as unknown as Row[],
    };
    ["sales_by_material", "sales_by_category", "sales_by_city", "sales_by_region",
      "sales_by_carrier", "sales_by_supplier", "sales_by_client", "clients",
      "materials_trend", "carriers", "trucks", "suppliers"].forEach((k) => {
        const rows = analytics[k] as Row[];
        if (Array.isArray(rows) && rows.length) sheets[k] = rows;
      });
    if (forecast) sheets.Previsions = forecast.projection as unknown as Row[];
    await exportExcel(`vrac-quebec-bi-${from}_${to}`, sheets);
    toast.success("Export Excel généré.");
  };

  if (!isReady || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Vérification des permissions…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldCheck className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Accès réservé</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Le Centre d'Intelligence d'Affaires est réservé aux administrateurs.
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/admin" className="min-h-10 mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour à l'administration
            </Link>
            <h1 className="text-2xl font-bold">Centre d'Intelligence d'Affaires</h1>
            <p className="text-sm text-muted-foreground">
              Performance, rentabilité, croissance et alertes — calculés en temps réel sur les données de la plateforme.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {companies.length > 0 && (
              <Select value={companyId ?? undefined} onValueChange={setCompanyId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Entreprise" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
            </Button>
            <Button size="sm" variant="outline" onClick={() => void exportAll()}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" /> Imprimer / PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading && !overview ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyse des données en cours…
          </div>
        ) : (
          <Tabs defaultValue="executif">
            <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-1 print:hidden">
              <TabsTrigger value="executif"><BarChart3 className="mr-1.5 h-4 w-4" /> Exécutif</TabsTrigger>
              <TabsTrigger value="ventes"><TrendingUp className="mr-1.5 h-4 w-4" /> Ventes & rentabilité</TabsTrigger>
              <TabsTrigger value="acteurs"><Users className="mr-1.5 h-4 w-4" /> Clients & opérations</TabsTrigger>
              <TabsTrigger value="previsions"><TrendingUp className="mr-1.5 h-4 w-4" /> Prévisions</TabsTrigger>
              <TabsTrigger value="alertes">
                <Bell className="mr-1.5 h-4 w-4" /> Alertes & IA
                {alerts.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
                    {alerts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="objectifs"><Target className="mr-1.5 h-4 w-4" /> Objectifs</TabsTrigger>
              <TabsTrigger value="perso"><Layout className="mr-1.5 h-4 w-4" /> Mon tableau</TabsTrigger>
            </TabsList>

            <TabsContent value="executif">{overview && <BiExecutive data={overview} />}</TabsContent>
            <TabsContent value="ventes">{analytics && <BiSales data={analytics} />}</TabsContent>
            <TabsContent value="acteurs">{analytics && <BiEntities data={analytics} />}</TabsContent>
            <TabsContent value="previsions">{forecast && <BiForecast data={forecast} />}</TabsContent>
            <TabsContent value="alertes">
              <BiAlerts alerts={alerts} metrics={{ periode: `${from} → ${to}`, overview, analytics, forecast, alerts }} />
            </TabsContent>
            <TabsContent value="objectifs"><BiGoals companyId={companyId} /></TabsContent>
            <TabsContent value="perso">
              <BiCustom overview={overview} analytics={analytics} companyId={companyId} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}