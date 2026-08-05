// ============================================================
// SUPERVISION DE LA PLATEFORME
// Journal centralisé (erreurs, soumissions, calculs, appels Google,
// courriels, API) + alertes automatiques + état de santé 24 h.
// Accès strictement réservé aux administrateurs.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const SOURCES = [
  { value: "all", label: "Toutes les sources" },
  { value: "quote_submit", label: "Soumissions" },
  { value: "quote_engine", label: "Calculs" },
  { value: "google_maps", label: "Google Maps" },
  { value: "email", label: "Courriels" },
  { value: "database", label: "Base de données" },
  { value: "edge_function", label: "Fonctions" },
  { value: "api", label: "API" },
];

const LEVELS = [
  { value: "all", label: "Tous les niveaux" },
  { value: "errors", label: "Erreurs seulement" },
  { value: "warn", label: "Avertissements" },
  { value: "info", label: "Information" },
];

interface LogRow {
  id: number;
  created_at: string;
  level: string;
  source: string;
  event: string;
  message: string | null;
  duration_ms: number | null;
  status_code: number | null;
  ref_id: string | null;
  context: Record<string, unknown> | null;
}

interface AlertRow {
  id: string;
  created_at: string;
  severity: string;
  source: string;
  title: string;
  occurrences: number;
  last_seen_at: string;
  details: Record<string, unknown> | null;
}

interface HealthPayload {
  window?: string;
  open_alerts?: number;
  by_source?: Record<string, { total: number; errors: number; avg_ms: number | null }>;
}

const levelClass = (level: string) =>
  level === "critical" || level === "error"
    ? "bg-destructive/15 text-destructive"
    : level === "warn"
      ? "bg-amber-500/15 text-amber-600"
      : "bg-muted text-muted-foreground";

export default function AdminMonitoring() {
  const { user, isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("platform_logs")
      .select("id,created_at,level,source,event,message,duration_ms,status_code,ref_id,context")
      .order("created_at", { ascending: false })
      .limit(300);
    if (source !== "all") query = query.eq("source", source);
    if (level === "errors") query = query.in("level", ["error", "critical"]);
    else if (level !== "all") query = query.eq("level", level);

    const [logsRes, alertsRes, healthRes] = await Promise.all([
      query,
      supabase
        .from("platform_alerts")
        .select("id,created_at,severity,source,title,occurrences,last_seen_at,details")
        .is("acknowledged_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(50),
      supabase.rpc("platform_health"),
    ]);

    if (logsRes.error) toast.error(logsRes.error.message);
    setLogs((logsRes.data ?? []) as unknown as LogRow[]);
    setAlerts((alertsRes.data ?? []) as unknown as AlertRow[]);
    setHealth((healthRes.data ?? null) as HealthPayload | null);
    setLoading(false);
  }, [source, level]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) =>
      [l.event, l.message, l.ref_id, l.source].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [logs, search]);

  const acknowledge = async (id: string) => {
    const { error } = await supabase
      .from("platform_alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user?.id ?? null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Alerte traitée");
    void load();
  };

  if (!isReady || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
        Accès réservé aux administrateurs.
      </div>
    );
  }

  const sources = Object.entries(health?.by_source ?? {});

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
              <Link to="/admin"><ArrowLeft className="mr-2 h-4 w-4" /> Administration</Link>
            </Button>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Activity className="h-6 w-6 text-primary" /> Supervision de la plateforme
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Journal centralisé, alertes automatiques et santé des services sur 24 h.
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
        </div>

        {/* Santé des services */}
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sources.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Aucun événement enregistré sur les dernières 24 h.
            </div>
          )}
          {sources.map(([name, stats]) => (
            <div key={name} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{name}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{stats.total}</p>
              <p className={`text-xs ${stats.errors > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {stats.errors} erreur{stats.errors > 1 ? "s" : ""}
                {stats.avg_ms ? ` · ${stats.avg_ms} ms en moyenne` : ""}
              </p>
            </div>
          ))}
        </section>

        {/* Alertes ouvertes */}
        <section className="mb-6 rounded-xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-foreground">Alertes ouvertes ({alerts.length})</h2>
          </header>
          {alerts.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Aucun incident en cours.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.severity} · {a.occurrences} occurrence{a.occurrences > 1 ? "s" : ""} · dernière {new Date(a.last_seen_at).toLocaleString("fr-CA")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void acknowledge(a.id)}>
                    Marquer comme traitée
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Filtres */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Rechercher (événement, message, numéro de soumission)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEVELS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Journal */}
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Horodatage</th>
                <th className="px-4 py-3">Niveau</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Événement</th>
                <th className="px-4 py-3">Détail</th>
                <th className="px-4 py-3 text-right">Durée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Aucun journal pour ces filtres.</td></tr>
              )}
              {!loading && filtered.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("fr-CA")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${levelClass(l.level)}`}>{l.level}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{l.source}</td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {l.event}
                    {l.ref_id && <span className="block text-xs text-muted-foreground">{l.ref_id}</span>}
                  </td>
                  <td className="max-w-[380px] px-4 py-3 text-muted-foreground">
                    {l.message ?? "—"}
                    {l.status_code && <span className="ml-2 text-xs">HTTP {l.status_code}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                    {l.duration_ms != null ? `${l.duration_ms} ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
