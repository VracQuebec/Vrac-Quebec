// Vrac Québec OS — Centre de Contrôle Global (Orchestrateur & Jumeau numérique).
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ControlCenter from "@/components/orch/ControlCenter";
import DigitalTwin from "@/components/orch/DigitalTwin";
import OrchMapView from "@/components/orch/OrchMapView";
import { RiskBoard, RulesBoard, SimulationLab, StrategyBoard } from "@/components/orch/OrchPanels";
import {
  fetchControl, fetchMap, fetchTwin, invokeOrchestrator,
  type MapData, type OrchControl, type TwinData,
} from "@/lib/jsc/orchestrator";

export default function AdminOrchestrator() {
  const companyId: string | null = null;
  const [control, setControl] = useState<OrchControl | null>(null);
  const [twin, setTwin] = useState<TwinData | null>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [c, t, m] = await Promise.all([fetchControl(companyId), fetchTwin(companyId), fetchMap(companyId)]);
      setControl(c); setTwin(t); setMap(m);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const runCycle = async () => {
    setRunning(true);
    try { await invokeOrchestrator({ action: "run", company_id: companyId }); toast.success("Cycle d'orchestration terminé"); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setRunning(false); }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <Helmet>
        <title>Centre de contrôle global | Vrac Québec OS</title>
        <meta name="description" content="Orchestrateur global, jumeau numérique, carte opérationnelle, simulations et gestion des risques de la plateforme Vrac Québec." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Centre de contrôle global</h1>
          <p className="text-sm text-muted-foreground">Orchestrateur, jumeau numérique et pilotage stratégique en temps réel.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualiser
          </Button>
          <Button onClick={runCycle} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Lancer un cycle
          </Button>
        </div>
      </header>

      {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      <Tabs defaultValue="control">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="control">Contrôle</TabsTrigger>
          <TabsTrigger value="twin">Jumeau numérique</TabsTrigger>
          <TabsTrigger value="map">Carte</TabsTrigger>
          <TabsTrigger value="sim">Simulations</TabsTrigger>
          <TabsTrigger value="risks">Risques</TabsTrigger>
          <TabsTrigger value="strategy">Stratégie</TabsTrigger>
          <TabsTrigger value="rules">Règles</TabsTrigger>
        </TabsList>

        <TabsContent value="control" className="mt-6">
          {control ? <ControlCenter data={control} /> : <p className="text-sm text-muted-foreground">Chargement…</p>}
        </TabsContent>
        <TabsContent value="twin" className="mt-6">
          {twin ? <DigitalTwin data={twin} /> : <p className="text-sm text-muted-foreground">Chargement…</p>}
        </TabsContent>
        <TabsContent value="map" className="mt-6">
          {map ? <OrchMapView data={map} /> : <p className="text-sm text-muted-foreground">Chargement…</p>}
        </TabsContent>
        <TabsContent value="sim" className="mt-6"><SimulationLab companyId={companyId} /></TabsContent>
        <TabsContent value="risks" className="mt-6"><RiskBoard companyId={companyId} /></TabsContent>
        <TabsContent value="strategy" className="mt-6"><StrategyBoard companyId={companyId} /></TabsContent>
        <TabsContent value="rules" className="mt-6"><RulesBoard companyId={companyId} /></TabsContent>
      </Tabs>
    </div>
  );
}
