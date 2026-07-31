// Vrac Québec OS — Back Office administrateur (ERP).
// Tout est configurable ici : aucune valeur ne doit être modifiée en base.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Layers, Building2, Building, MapPin, DollarSign, Truck, Route, Globe2, Percent,
  Settings2, ShieldCheck, History, DatabaseBackup, Loader2, FolderTree, UserCog, Users,
  Inbox, FileText, ClipboardList, Receipt, LayoutDashboard, Table2, Columns3, Calculator,
  Rocket, FlaskConical, Bell, KeyRound, Plug,
} from "lucide-react";
import {
  JSC_RESOURCES, JSC_COMPANY_RESOURCE, JSC_COMMERCIAL_RESOURCES, JSC_ORG_RESOURCES, JSC_SAAS_RESOURCES,
  JSC_REQUEST_STATUSES, JSC_QUOTE_STATUSES, JSC_ORDER_STATUSES,
} from "@/lib/jsc/config";
import ResourceManager from "@/components/jsc/ResourceManager";
import AuditTrail from "@/components/jsc/AuditTrail";
import ConfigBackup from "@/components/jsc/ConfigBackup";
import JscDashboard from "@/components/jsc/JscDashboard";
import JscPipeline, { type PipelineKind } from "@/components/jsc/JscPipeline";
import SetupCenter from "@/components/jsc/SetupCenter";
import ApiConsole from "@/components/jsc/ApiConsole";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";

const ICONS: Record<string, typeof Layers> = {
  Layers, Building2, Building, MapPin, DollarSign, Truck, Route, Globe2, Percent, Settings2,
  FolderTree, UserCog, Users, Inbox, FileText, ClipboardList, Receipt, ShieldCheck,
  LayoutDashboard, History, DatabaseBackup, Calculator, Rocket, Bell, KeyRound, Plug,
};

const REFERENTIEL = [...JSC_RESOURCES, JSC_COMPANY_RESOURCE];
const PIPELINE_STATUSES: Record<string, { kind: PipelineKind; statuses: { value: string; label: string }[] }> = {
  requests: { kind: "requests", statuses: JSC_REQUEST_STATUSES },
  quotes: { kind: "quotes", statuses: JSC_QUOTE_STATUSES },
  orders: { kind: "orders", statuses: JSC_ORDER_STATUSES },
};

type Company = { id: string; name: string; is_default: boolean | null };

export default function AdminJsc() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [activeId, setActiveId] = useState("dashboard");
  const [reloadKey, setReloadKey] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [mode, setMode] = useState<"test" | "production">("test");

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data } = await supabase
        .from("jsc_settings").select("value").eq("key", "platform_mode").maybeSingle();
      setMode((data?.value as "test" | "production") ?? "test");
    })();
  }, [isAdmin, activeId]);

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

  const allResources = useMemo(
    () => [...REFERENTIEL, ...JSC_COMMERCIAL_RESOURCES, ...JSC_ORG_RESOURCES, ...JSC_SAAS_RESOURCES],
    [],
  );
  const active = allResources.find((r) => r.id === activeId);
  const pipeline = PIPELINE_STATUSES[activeId];

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
          Le back office est accessible uniquement aux administrateurs.
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">Retour à l'accueil</Link>
      </div>
    );
  }

  const NavButton = ({ id, title, icon }: { id: string; title: string; icon: string }) => {
    const Icon = ICONS[icon] ?? Settings2;
    const isActive = id === activeId;
    return (
      <button
        onClick={() => setActiveId(id)}
        className={`flex w-full shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
          isActive
            ? "border-primary bg-primary/10 font-medium text-foreground"
            : "border-transparent text-muted-foreground hover:bg-muted"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="whitespace-nowrap">{title}</span>
      </button>
    );
  };

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex gap-2 lg:flex-col">
      <p className="hidden px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:block">
        {label}
      </p>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/admin" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour à l'administration
            </Link>
            <h1 className="text-2xl font-bold">Vrac Québec OS — Back Office</h1>
            <p className="text-sm text-muted-foreground">
              Centre de contrôle : référentiel, flux commercial, organisation et paramètres des moteurs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                mode === "production"
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-amber-500/40 bg-amber-500/10 text-foreground"
              }`}
            >
              {mode === "production" ? <Rocket className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
              {mode === "production" ? "Mode Production" : "Mode Test"}
            </div>
            {companies.length > 0 && (
              <Select value={companyId ?? undefined} onValueChange={setCompanyId}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Entreprise" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Données internes — jamais visibles par les clients
            </div>
          </div>
        </div>
      </header>

      {mode === "test" && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-foreground">
          Environnement de test — les documents générés portent la mention « TEST » et ne sont pas officiels.
        </div>
      )}

      <div className="mx-auto max-w-7xl gap-6 px-4 py-6 lg:flex">
        <nav className="mb-4 flex gap-2 overflow-x-auto lg:mb-0 lg:w-64 lg:flex-col lg:overflow-visible">
          <NavButton id="dashboard" title="Tableau de bord" icon="LayoutDashboard" />
          <NavButton id="setup" title="Mise en service" icon="Rocket" />
          <Section label="Flux commercial">
            {JSC_COMMERCIAL_RESOURCES.map((r) => (
              <NavButton key={r.id} id={r.id} title={r.title} icon={r.icon} />
            ))}
          </Section>
          <Section label="Référentiel">
            {REFERENTIEL.map((r) => <NavButton key={r.id} id={r.id} title={r.title} icon={r.icon} />)}
          </Section>
          <Section label="Organisation">
            {JSC_ORG_RESOURCES.map((r) => <NavButton key={r.id} id={r.id} title={r.title} icon={r.icon} />)}
            <NavButton id="audit" title="Journal d'audit" icon="History" />
            <NavButton id="backup" title="Sauvegarde" icon="DatabaseBackup" />
          </Section>
          <Section label="Plateforme">
            {JSC_SAAS_RESOURCES.map((r) => <NavButton key={r.id} id={r.id} title={r.title} icon={r.icon} />)}
            <NavButton id="api" title="API publique" icon="Plug" />
          </Section>
        </nav>

        <main className="min-w-0 flex-1">
          {activeId === "dashboard" && <JscDashboard companyId={companyId} />}

          {activeId === "api" && <ApiConsole companyId={companyId} />}

          {activeId === "setup" && (
            <SetupCenter companyId={companyId} onNavigate={(id) => setActiveId(id)} />
          )}

          {activeId === "audit" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Journal d'audit</h2>
                <p className="text-sm text-muted-foreground">
                  Chaque création, modification, archivage ou suppression est historisée avec
                  l'utilisateur, la date, l'ancienne et la nouvelle valeur.
                </p>
              </div>
              <AuditTrail />
            </div>
          )}

          {activeId === "backup" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Export / import de la configuration</h2>
                <p className="text-sm text-muted-foreground">
                  Sauvegarde complète et restauration de tous les paramètres.
                </p>
              </div>
              <ConfigBackup onImported={() => setReloadKey((k) => k + 1)} />
            </div>
          )}

          {active && pipeline && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{active.title}</h2>
                  <p className="text-sm text-muted-foreground">{active.description}</p>
                </div>
                <div className="flex gap-1 rounded-lg border p-1">
                  <Button size="sm" variant={view === "kanban" ? "default" : "ghost"} onClick={() => setView("kanban")}>
                    <Columns3 className="mr-1.5 h-4 w-4" /> Kanban
                  </Button>
                  <Button size="sm" variant={view === "table" ? "default" : "ghost"} onClick={() => setView("table")}>
                    <Table2 className="mr-1.5 h-4 w-4" /> Tableau
                  </Button>
                </div>
              </div>
              {view === "kanban" ? (
                <JscPipeline
                  key={`${activeId}-${companyId}-${reloadKey}`}
                  kind={pipeline.kind}
                  statuses={pipeline.statuses}
                  companyId={companyId}
                />
              ) : (
                <ResourceManager
                  key={`${active.id}-${companyId}-${reloadKey}`}
                  resource={active}
                  companyId={companyId}
                />
              )}
            </div>
          )}

          {active && !pipeline && (
            <ResourceManager
              key={`${active.id}-${companyId}-${reloadKey}`}
              resource={active}
              companyId={companyId}
            />
          )}
        </main>
      </div>
    </div>
  );
}
