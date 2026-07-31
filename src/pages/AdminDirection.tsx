// Page Direction — cockpit temps réel, IA commerciale, automatisation, prévisions et copilote.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bot, Brain, Gauge, Loader2, RefreshCw, TrendingUp, Workflow, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import DirectionOverview from "@/components/direction/DirectionOverview";
import SalesIntelligence from "@/components/direction/SalesIntelligence";
import AutomationPanel from "@/components/direction/AutomationPanel";
import ForecastPanel from "@/components/direction/ForecastPanel";
import AiAdvisor from "@/components/direction/AiAdvisor";
import AiCopilot from "@/components/direction/AiCopilot";
import type { ExecDashboard } from "@/lib/jsc/intel";

type Company = { id: string; name: string; is_default: boolean | null };

export default function AdminDirection() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [data, setData] = useState<ExecDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data: rows } = await supabase
        .from("jsc_companies").select("id,name,is_default").is("archived_at", null).order("created_at");
      const list = (rows as Company[]) ?? [];
      setCompanies(list);
      setCompanyId((prev) => prev ?? (list.find((c) => c.is_default)?.id ?? list[0]?.id ?? null));
    })();
  }, [isAdmin]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc("jsc_executive_dashboard", { _company_id: companyId });
    if (error) toast.error(error.message);
    setData((res as unknown as ExecDashboard) ?? null);
    setLoading(false);
  }, [isAdmin, companyId]);

  useEffect(() => { void load(); }, [load]);

  // Rafraîchissement automatique du cockpit toutes les 60 secondes.
  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [isAdmin, load]);

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
          <Button asChild variant="ghost" size="icon"><Link to="/admin/jsc"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
              <Gauge className="h-5 w-5 text-primary" /> Direction
            </h1>
            <p className="text-xs text-muted-foreground">
              Intelligence commerciale, automatisation et prévisions en temps réel
              {data?.generated_at && ` · mis à jour ${new Date(data.generated_at).toLocaleTimeString("fr-CA")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {companies.length > 1 && (
            <Select value={companyId ?? ""} onValueChange={(v) => setCompanyId(v)}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Entreprise" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
        </div>
      </header>

      <Tabs defaultValue="direction">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="direction"><Gauge className="mr-1.5 h-4 w-4" /> Tableau de bord</TabsTrigger>
          <TabsTrigger value="commercial"><Zap className="mr-1.5 h-4 w-4" /> IA commerciale</TabsTrigger>
          <TabsTrigger value="automation"><Workflow className="mr-1.5 h-4 w-4" /> Automatisation</TabsTrigger>
          <TabsTrigger value="forecast"><TrendingUp className="mr-1.5 h-4 w-4" /> Prévisions</TabsTrigger>
          <TabsTrigger value="advisor"><Brain className="mr-1.5 h-4 w-4" /> Conseiller IA</TabsTrigger>
          <TabsTrigger value="copilot"><Bot className="mr-1.5 h-4 w-4" /> Copilote</TabsTrigger>
        </TabsList>

        <TabsContent value="direction" className="mt-4">
          {loading && !data && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}
          {data && <DirectionOverview data={data} />}
          {!loading && !data && <p className="py-12 text-center text-sm text-muted-foreground">Aucune donnée disponible.</p>}
        </TabsContent>
        <TabsContent value="commercial" className="mt-4"><SalesIntelligence companyId={companyId} /></TabsContent>
        <TabsContent value="automation" className="mt-4"><AutomationPanel companyId={companyId} /></TabsContent>
        <TabsContent value="forecast" className="mt-4"><ForecastPanel companyId={companyId} /></TabsContent>
        <TabsContent value="advisor" className="mt-4"><AiAdvisor companyId={companyId} /></TabsContent>
        <TabsContent value="copilot" className="mt-4"><AiCopilot companyId={companyId} /></TabsContent>
      </Tabs>
    </main>
  );
}