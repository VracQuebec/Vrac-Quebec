// Mode pilote automatique — réglages d'exécution autonome, vue 360° et journal des actions.
import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2, PlayCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { CAD, invokeIntel } from "@/lib/jsc/intel";

type Settings = {
  id?: string; company_id: string | null; enabled: boolean;
  auto_send_quotes: boolean; auto_schedule_deliveries: boolean; auto_followups: boolean;
  auto_invoices: boolean; auto_assign_drivers: boolean; auto_dispatch_orders: boolean;
  auto_execute_decisions: boolean; max_auto_amount: number; min_confidence: number;
};

type LogRow = {
  id: string; action: string; status: string; detail: string | null;
  entity_type: string | null; executed_at: string;
};

export type Dashboard360 = {
  generated_at: string;
  decisions: { pending: number; accepted: number; rejected: number; executed: number; pending_impact: number };
  alerts: { open: number; critical: number; impact: number };
  autopilot: { actions_24h: number; errors_24h: number; actions_7d: number };
  documents: { total: number; last_30d: number };
};

const TOGGLES: { key: keyof Settings; label: string; hint: string }[] = [
  { key: "auto_execute_decisions", label: "Exécuter les décisions acceptées", hint: "L'agent applique lui-même les décisions validées." },
  { key: "auto_send_quotes", label: "Envoi automatique des soumissions", hint: "Marque les soumissions prêtes comme envoyées." },
  { key: "auto_dispatch_orders", label: "Conversion automatique en commandes", hint: "Soumission acceptée → commande." },
  { key: "auto_schedule_deliveries", label: "Génération automatique des livraisons", hint: "Commande confirmée → livraisons planifiées." },
  { key: "auto_assign_drivers", label: "Assignation automatique des ressources", hint: "Chauffeur et camion attribués selon la disponibilité." },
  { key: "auto_invoices", label: "Facturation automatique", hint: "Commande terminée → facture générée." },
  { key: "auto_followups", label: "Relances automatiques", hint: "Relances 24 h et 72 h sur les soumissions sans réponse." },
];

export default function AutopilotPanel({ companyId }: { companyId: string | null }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [board, setBoard] = useState<Dashboard360 | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: b, error: bErr }, { data: l }] = await Promise.all([
      supabase.from("jsc_autopilot_settings").select("*").eq("company_id", companyId ?? "").maybeSingle(),
      supabase.rpc("jsc_dashboard_360", { p_company_id: companyId }),
      supabase.from("jsc_autopilot_log").select("*").order("executed_at", { ascending: false }).limit(40),
    ]);
    if (bErr) toast.error(bErr.message);
    setSettings((s as unknown as Settings) ?? {
      company_id: companyId, enabled: false, auto_send_quotes: false, auto_schedule_deliveries: false,
      auto_followups: true, auto_invoices: false, auto_assign_drivers: false, auto_dispatch_orders: false,
      auto_execute_decisions: false, max_auto_amount: 5000, min_confidence: 0.75,
    });
    setBoard((b as unknown as Dashboard360) ?? null);
    setLogs((l as unknown as LogRow[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch, company_id: companyId };
    setSettings(next);
    const { error } = await supabase.from("jsc_autopilot_settings")
      .upsert({ ...next, id: settings.id }, { onConflict: "company_id" });
    if (error) toast.error(error.message);
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await invokeIntel<{ executed: number; errors: number; skipped?: string }>(
        "vqos-autopilot", { company_id: companyId },
      );
      if (res.skipped) toast.warning(res.skipped);
      else toast.success(`${res.executed} action(s) exécutée(s), ${res.errors} erreur(s)`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setRunning(false); }
  };

  if (loading && !settings) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const tile = (label: string, value: string, sub?: string) => (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );

  return (
    <div className="space-y-4">
      {board && (
        <div className="grid gap-3 md:grid-cols-4">
          {tile("Décisions en attente", String(board.decisions.pending), `Impact ${CAD(board.decisions.pending_impact)}`)}
          {tile("Alertes ouvertes", String(board.alerts.open), `${board.alerts.critical} critique(s)`)}
          {tile("Actions automatiques 24 h", String(board.autopilot.actions_24h), `${board.autopilot.errors_24h} erreur(s)`)}
          {tile("Documents centralisés", String(board.documents.total), `${board.documents.last_30d} sur 30 jours`)}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" /> Mode pilote automatique
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant={settings?.enabled ? "default" : "outline"}>
              {settings?.enabled ? "Actif" : "Inactif"}
            </Badge>
            <Switch checked={!!settings?.enabled} onCheckedChange={(v) => void save({ enabled: v })} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Lorsque le pilote automatique est actif, l'agent exécute seul les actions autorisées ci-dessous,
            dans les limites de montant et de confiance définies. Tout est journalisé.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {TOGGLES.map((t) => (
              <div key={String(t.key)} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.hint}</p>
                </div>
                <Switch
                  checked={Boolean(settings?.[t.key])}
                  disabled={!settings?.enabled}
                  onCheckedChange={(v) => void save({ [t.key]: v } as Partial<Settings>)}
                />
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Montant maximum d'une action automatique ($)</Label>
              <Input type="number" min={0} value={settings?.max_auto_amount ?? 0}
                onChange={(e) => void save({ max_auto_amount: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confiance minimale requise (0 à 1)</Label>
              <Input type="number" min={0} max={1} step={0.05} value={settings?.min_confidence ?? 0.75}
                onChange={(e) => void save({ min_confidence: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void runNow()} disabled={running}>
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-1.5 h-4 w-4" />}
              Exécuter maintenant
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" /> Journal des actions automatiques
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!logs.length && <p className="py-6 text-center text-sm text-muted-foreground">Aucune action exécutée.</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <Badge variant={l.status === "ok" ? "outline" : l.status === "error" ? "destructive" : "secondary"}>
                  {l.status}
                </Badge>
                <span className="font-mono text-xs">{l.action}</span>
                <span className="text-muted-foreground">{l.detail}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(l.executed_at).toLocaleString("fr-CA")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
