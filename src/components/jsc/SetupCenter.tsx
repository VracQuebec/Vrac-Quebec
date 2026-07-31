// Centre de mise en service : assistant de configuration, indicateurs de
// préparation, validation automatique, parcours client et mode Test/Production.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Circle, Download, FileWarning,
  Loader2, MapPin, RefreshCw, Rocket, ShieldCheck, Upload, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  fetchReadiness, setPlatformMode, stepIsDone, type Readiness,
} from "@/lib/jsc/readiness";

const IMPORTABLE = [
  { resource: "materials", label: "Matériaux" },
  { resource: "suppliers", label: "Fournisseurs" },
  { resource: "pickup_locations", label: "Lieux de chargement" },
  { resource: "carriers", label: "Transporteurs" },
  { resource: "trucks", label: "Camions" },
  { resource: "transport_rates", label: "Tarifs" },
  { resource: "clients", label: "Clients" },
];

export default function SetupCenter({
  companyId,
  onNavigate,
}: {
  companyId?: string | null;
  onNavigate: (resourceId: string) => void;
}) {
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchReadiness(companyId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const mapsConnected = Boolean(import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY);

  const indicators = useMemo(() => {
    if (!data) return [];
    const count = (id: string) => data.steps.find((s) => s.id === id)?.count ?? 0;
    const ok = (id: string) => stepIsDone(data.steps.find((s) => s.id === id)!);
    const engineReady = ok("settings") && ok("rates") && ok("trucks") && ok("pickups");
    return [
      { label: "Matériaux configurés", ok: ok("materials"), value: count("materials") },
      { label: "Fournisseurs configurés", ok: ok("suppliers"), value: count("suppliers") },
      { label: "Camions configurés", ok: ok("trucks"), value: count("trucks") },
      { label: "Tarifs configurés", ok: ok("rates"), value: count("rates") },
      { label: "Taxes configurées", ok: ok("taxes"), value: count("taxes") },
      { label: "Zones configurées", ok: ok("zones"), value: count("zones") },
      { label: "Google Maps connecté", ok: mapsConnected, value: mapsConnected ? "Oui" : "Non" },
      { label: "Calculateur opérationnel", ok: engineReady && data.critical_count === 0, value: engineReady ? "Prêt" : "Incomplet" },
      { label: "CRM opérationnel", ok: (data.flow.find((f) => f.id === "clients")?.count ?? 0) >= 0, value: `${data.flow.find((f) => f.id === "requests")?.count ?? 0} demandes` },
      { label: "Pipeline opérationnel", ok: (data.flow.find((f) => f.id === "quotes")?.count ?? 0) >= 0, value: `${data.flow.find((f) => f.id === "orders")?.count ?? 0} commandes` },
    ];
  }, [data, mapsConnected]);

  const changeMode = async (mode: "test" | "production") => {
    if (!data) return;
    if (mode === "production" && !data.production_ready) {
      toast.error("Configuration incomplète : corrigez les erreurs critiques avant d'activer la production.");
      return;
    }
    setSaving(true);
    try {
      await setPlatformMode(mode);
      toast.success(mode === "production" ? "Mode Production activé." : "Mode Test activé.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const downloadReport = () => {
    if (!data) return;
    const lines = [
      "# Rapport de mise en service — Vrac Québec OS",
      `Généré le ${new Date(data.generated_at).toLocaleString("fr-CA")}`,
      "",
      `## Score de préparation : ${data.score} %`,
      `Production Ready : ${data.production_ready ? "OUI" : "NON"}`,
      `Mode actuel : ${data.mode === "production" ? "Production" : "Test"}`,
      "",
      "## Étapes de configuration",
      ...data.steps.map((s) => `- [${stepIsDone(s) ? "x" : " "}] ${s.label} — ${s.count} enregistrement(s)`),
      "",
      "## Erreurs détectées",
      ...(data.issues.length
        ? data.issues.map((i) => `- (${i.severity}) ${i.label} : ${i.count} — ${i.detail}`)
        : ["- Aucune"]),
      "",
      "## Parcours client",
      ...data.flow.map((f) => `- ${f.label} : ${f.count}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rapport-mise-en-service-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyse de la configuration…
      </div>
    );
  }
  if (!data) return <p className="py-10 text-center text-sm text-muted-foreground">Aucune donnée.</p>;

  const nextStep = data.steps.find((s) => !stepIsDone(s));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Mise en service</h2>
          <p className="text-sm text-muted-foreground">
            Assistant de première configuration, validation automatique et certification de production.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={downloadReport}>
            <Download className="mr-1.5 h-4 w-4" /> Rapport
          </Button>
        </div>
      </div>

      {/* Score global */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Configuration</p>
            <p className="text-4xl font-bold">{data.score} %</p>
            <p className="text-sm text-muted-foreground">
              {data.steps_done} / {data.steps_total} étapes complétées
            </p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Badge variant={data.production_ready ? "default" : "secondary"} className="gap-1.5 px-3 py-1.5 text-sm">
              {data.production_ready ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              Production Ready : {data.production_ready ? "Oui" : "Non"}
            </Badge>
            <div className="flex items-center gap-1 rounded-lg border p-1">
              <Button size="sm" variant={data.mode === "test" ? "default" : "ghost"} disabled={saving}
                onClick={() => void changeMode("test")}>
                Mode Test
              </Button>
              <Button size="sm" variant={data.mode === "production" ? "default" : "ghost"} disabled={saving}
                onClick={() => void changeMode("production")}>
                <Rocket className="mr-1.5 h-4 w-4" /> Mode Production
              </Button>
            </div>
          </div>
        </div>
        <Progress value={data.score} className="mt-4" />
        {data.mode === "test" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Mode Test : filigrane visible, données fictives autorisées, aucun document officiel émis.
          </p>
        )}
      </div>

      {/* Assistant de configuration */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Assistant de configuration</h3>
        <div className="divide-y rounded-xl border bg-card">
          {data.steps.map((s, i) => {
            const done = stepIsDone(s);
            const isNext = nextStep?.id === s.id;
            const pct = Math.round(((i + (done ? 1 : 0)) / data.steps_total) * 100);
            return (
              <div key={s.id} className={`flex flex-wrap items-center gap-3 p-3 ${isNext ? "bg-primary/5" : ""}`}>
                {done
                  ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {i + 1}. {s.label}{" "}
                    {isNext && <Badge variant="outline" className="ml-1 align-middle text-[10px]">Étape suivante</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.count} enregistrement(s) · minimum requis : {s.min} · progression {pct} %
                  </p>
                </div>
                <Button size="sm" variant={isNext ? "default" : "outline"} onClick={() => onNavigate(s.resource)}>
                  {done ? "Réviser" : "Configurer"} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Indicateurs */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Indicateurs de configuration</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {indicators.map((ind) => (
            <div key={ind.label} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              {ind.ok
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                : <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{ind.label}</p>
                <p className="text-xs text-muted-foreground">{ind.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Validation */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Validation automatique</h3>
        {data.issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Aucune anomalie détectée.
          </div>
        ) : (
          <div className="space-y-2">
            {data.issues.map((issue) => (
              <div key={issue.code}
                className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                  issue.severity === "critical" ? "border-destructive/40 bg-destructive/5" : "bg-card"
                }`}>
                {issue.severity === "critical"
                  ? <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                  : <FileWarning className="h-5 w-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {issue.label} {issue.count > 0 && <span className="text-muted-foreground">({issue.count})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{issue.detail}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onNavigate(issue.resource)}>Corriger</Button>
              </div>
            ))}
            {data.critical_count > 0 && (
              <p className="text-xs text-destructive">
                {data.critical_count} erreur(s) critique(s) : aucun calcul officiel n'est possible tant qu'elles subsistent.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Parcours client */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Parcours client de bout en bout</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.flow.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              {f.count > 0
                ? <CheckCircle2 className="h-5 w-5 text-primary" />
                : <Circle className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="text-xl font-bold leading-none">{f.count}</p>
                <p className="text-xs text-muted-foreground">{f.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Importation */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Importation de données (CSV / Excel)</h3>
        <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3">
          {IMPORTABLE.map((i) => (
            <Button key={i.resource} size="sm" variant="outline" onClick={() => onNavigate(i.resource)}>
              <Upload className="mr-1.5 h-4 w-4" /> {i.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Chaque module offre l'export d'un modèle CSV, l'aperçu avant importation et la mise à jour des
          enregistrements existants.
        </p>
      </section>

      {!mapsConnected && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-4 w-4" /> Google Maps n'est pas détecté : les distances et la géolocalisation seront indisponibles.
        </p>
      )}
    </div>
  );
}
