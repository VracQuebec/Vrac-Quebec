// Centre IA — Sprint Production 6 : intelligence autonome et auto-optimisation.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Activity, AlertTriangle, Brain, FileText, Gauge, History, Loader2, PlayCircle, RefreshCw, Sparkles, TrendingUp, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import IntelOverview from "@/components/intel/IntelOverview";
import { AnomaliesPanel, LearningPanel, MemoryPanel, OptimizationsPanel, PredictionsPanel, ScoresPanel } from "@/components/intel/IntelPanels";
import { CommercialPanel, DailyReportPanel } from "@/components/intel/IntelCommercial";
import { fetchIntelDashboard, invokeIntelligence, type IntelDashboard } from "@/lib/jsc/intelligence";

type Company = { id: string; name: string; is_default: boolean | null };

export default function AdminIaCenter() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [data, setData] = useState<IntelDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data: rows } = await supabase.from("jsc_companies")
        .select("id,name,is_default").is("archived_at", null).order("created_at");
      const list = (rows as Company[]) ?? [];
      setCompanies(list);
      setCompanyId((prev) => prev ?? (list.find((c) => c.is_default)?.id ?? list[0]?.id ?? null));
    })();
  }, [isAdmin]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try { setData(await fetchIntelDashboard(companyId)); }
    catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  }, [isAdmin, companyId]);

  useEffect(() => { void load(); }, [load]);

  const runCycle = async () => {
    setRunning(true);
    try {
      await invokeIntelligence({ action: "run", company_id: companyId });
      toast.success("Cycle d'intelligence terminé");
      await load();
    } catch (e) { toast.error((e as Error).message); }
    setRunning(false);
  };

  if (!isReady || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">Accès réservé à la direction</h1>
        <Button asChild variant="outline"><Link to="/">Retour à l'accueil</Link></Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/admin/direction"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
              <Brain className="h-5 w-5 text-primary" /> Centre IA
            </h1>
            <p className="text-xs text-muted-foreground">
              Apprentissage continu, scores dynamiques, prévisions et auto-optimisation — données réelles uniquement
              {data?.generated_at && ` · ${new Date(data.generated_at).toLocaleTimeString("fr-CA")}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {companies.length > 1 && (
            <Select value={companyId ?? ""} onValueChange={setCompanyId}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Entreprise" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={() => void runCycle()} disabled={running}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-1.5 h-4 w-4" />}
            Lancer un cycle d'intelligence
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="overview"><Gauge className="mr-1.5 h-4 w-4" /> Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="learning"><Activity className="mr-1.5 h-4 w-4" /> Apprentissage</TabsTrigger>
          <TabsTrigger value="scores"><Sparkles className="mr-1.5 h-4 w-4" /> Scores</TabsTrigger>
          <TabsTrigger value="predictions"><TrendingUp className="mr-1.5 h-4 w-4" /> Prédictions</TabsTrigger>
          <TabsTrigger value="anomalies"><AlertTriangle className="mr-1.5 h-4 w-4" /> Anomalies</TabsTrigger>
          <TabsTrigger value="optimizations"><Wrench className="mr-1.5 h-4 w-4" /> Optimisations</TabsTrigger>
          <TabsTrigger value="commercial"><Brain className="mr-1.5 h-4 w-4" /> IA commerciale</TabsTrigger>
          <TabsTrigger value="report"><FileText className="mr-1.5 h-4 w-4" /> Rapport direction</TabsTrigger>
          <TabsTrigger value="memory"><History className="mr-1.5 h-4 w-4" /> Mémoire</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {loading && !data && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}
          {data && <IntelOverview data={data} />}
          {!loading && !data && <p className="py-12 text-center text-sm text-muted-foreground">Aucune donnée disponible.</p>}
        </TabsContent>
        <TabsContent value="learning" className="mt-4"><LearningPanel companyId={companyId} /></TabsContent>
        <TabsContent value="scores" className="mt-4"><ScoresPanel /></TabsContent>
        <TabsContent value="predictions" className="mt-4"><PredictionsPanel data={data} /></TabsContent>
        <TabsContent value="anomalies" className="mt-4"><AnomaliesPanel onChanged={() => void load()} /></TabsContent>
        <TabsContent value="optimizations" className="mt-4"><OptimizationsPanel onChanged={() => void load()} /></TabsContent>
        <TabsContent value="commercial" className="mt-4"><CommercialPanel companyId={companyId} /></TabsContent>
        <TabsContent value="report" className="mt-4">
          <DailyReportPanel companyId={companyId} lastReport={data?.last_report ?? null} />
        </TabsContent>
        <TabsContent value="memory" className="mt-4"><MemoryPanel /></TabsContent>
      </Tabs>
    </main>
  );
}