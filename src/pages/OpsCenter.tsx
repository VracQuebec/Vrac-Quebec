// Vrac Québec OS — Centre des Opérations.
// Poste de pilotage quotidien : dispatch, planification, flotte, incidents.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Loader2, ShieldCheck, LayoutDashboard, Table2, CalendarDays,
  Truck, Map as MapIcon, AlertTriangle, FolderKanban, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Delivery, OpsRefs, emptyRefs, fetchDeliveries, fetchOpsRefs, updateDelivery, notify,
} from "@/lib/jsc/operations";
import OpsDashboard from "@/components/ops/OpsDashboard";
import OpsTable from "@/components/ops/OpsTable";
import OpsPlanner from "@/components/ops/OpsPlanner";
import DispatchDrawer from "@/components/ops/DispatchDrawer";
import FleetBoard from "@/components/ops/FleetBoard";
import IncidentsBoard from "@/components/ops/IncidentsBoard";
import OpsMap from "@/components/ops/OpsMap";
import ResourceManager from "@/components/jsc/ResourceManager";
import { JSC_OPS_RESOURCES } from "@/lib/jsc/config";

type Company = { id: string; name: string; is_default: boolean | null };
type TabId = "dashboard" | "operations" | "planner" | "fleet" | "map" | "incidents" | "projects";

const TABS: { id: TabId; label: string; icon: typeof Truck }[] = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "operations", label: "Opérations", icon: Table2 },
  { id: "planner", label: "Planificateur", icon: CalendarDays },
  { id: "fleet", label: "Flotte", icon: Truck },
  { id: "map", label: "Carte", icon: MapIcon },
  { id: "incidents", label: "Incidents", icon: AlertTriangle },
  { id: "projects", label: "Projets", icon: FolderKanban },
];

export default function OpsCenter() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [refs, setRefs] = useState<OpsRefs>(emptyRefs());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Delivery | null>(null);

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
    try {
      const [d, r] = await Promise.all([fetchDeliveries(companyId), fetchOpsRefs(companyId)]);
      setDeliveries(d);
      setRefs(r);
      setSelected((s) => (s ? d.find((x) => x.id === s.id) ?? null : null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [companyId, isAdmin]);

  useEffect(() => { void load(); }, [load]);

  // Mise à jour temps réel des opérations.
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("ops-deliveries")
      .on("postgres_changes", { event: "*", schema: "public", table: "jsc_deliveries" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isAdmin, load]);

  const patch = useCallback(async (id: string, values: Record<string, unknown>) => {
    setDeliveries((list) => list.map((d) => (d.id === id ? { ...d, ...values } as Delivery : d)));
    setSelected((s) => (s && s.id === id ? { ...s, ...values } as Delivery : s));
    try {
      await updateDelivery(id, values);
      if (values.status) {
        const d = deliveries.find((x) => x.id === id);
        await notify({
          companyId, audience: "repartiteur",
          title: `Livraison ${d?.delivery_number ?? ""} — statut ${String(values.status)}`,
          entityType: "delivery", entityId: id,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
      void load();
    }
  }, [companyId, deliveries, load]);

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
          Le Centre des Opérations est réservé aux administrateurs et aux répartiteurs autorisés.
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex flex-wrap items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-lg leading-tight">Centre des Opérations</h1>
            <p className="text-[11px] text-muted-foreground">Dispatch, répartition et planification — Vrac Québec OS</p>
          </div>
          {companies.length > 0 && (
            <Select value={companyId ?? undefined} onValueChange={setCompanyId}>
              <SelectTrigger className="w-[220px] h-9 text-xs"><SelectValue placeholder="Entreprise" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
        </div>
        <div className="mx-auto max-w-[1600px] px-4 pb-2 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-bold whitespace-nowrap ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {loading && tab !== "dashboard" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement des opérations…
          </div>
        ) : (
          <>
            {tab === "dashboard" && <OpsDashboard companyId={companyId} />}
            {tab === "operations" && <OpsTable deliveries={deliveries} refs={refs} onOpen={setSelected} />}
            {tab === "planner" && (
              <OpsPlanner
                deliveries={deliveries}
                refs={refs}
                onOpen={setSelected}
                onReschedule={(id, date) => void patch(id, { scheduled_date: date, status: "planifiee" })}
              />
            )}
            {tab === "fleet" && <FleetBoard deliveries={deliveries} refs={refs} onChanged={() => void load()} />}
            {tab === "map" && <OpsMap deliveries={deliveries} refs={refs} onOpen={setSelected} />}
            {tab === "incidents" && <IncidentsBoard companyId={companyId} />}
            {tab === "projects" && <ResourceManager resource={JSC_OPS_RESOURCES[0]} companyId={companyId} />}
          </>
        )}
      </main>

      {selected && (
        <DispatchDrawer
          delivery={selected}
          deliveries={deliveries}
          refs={refs}
          companyId={companyId}
          onClose={() => setSelected(null)}
          onUpdate={patch}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}