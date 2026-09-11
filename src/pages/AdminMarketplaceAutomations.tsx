// ============================================================
// AUTOMATISATIONS ET RELANCES — place de marché.
// Chaque règle est configurable (activation, délai) : aucun délai
// n'est codé en dur. Le journal montre les actions déclenchées.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Play, RefreshCw } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAutomationRules, fetchAutomationRuns, runAutomations, saveAutomationRule,
} from "@/lib/marketplace/api";
import type { AutomationRule } from "@/lib/marketplace/api";

const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("fr-CA") : "—");

export default function AdminMarketplaceAutomations() {
  const { isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { toast } = useToast();

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [r, l] = await Promise.all([fetchAutomationRules(), fetchAutomationRuns()]);
      setRules(r); setRuns(l);
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { if (isAdmin) void charger(); }, [isAdmin, charger]);

  const majRegle = async (rule: AutomationRule, patch: Partial<AutomationRule>) => {
    setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)));
    try {
      await saveAutomationRule({ id: rule.id, ...patch });
    } catch (e) {
      toast({ title: "Modification refusée", description: (e as Error).message, variant: "destructive" });
      void charger();
    }
  };

  if (!isReady || roleLoading) return <FullPageState title="Chargement" message="Vérification de votre accès…" showSpinner />;
  if (!isAuthenticated) return <FullPageState title="Connexion requise" message="Connectez-vous pour accéder à cette section." />;
  if (!isAdmin) return <FullPageState title="Accès réservé" message="Cette section est réservée à l'administration de Vrac Québec." />;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/admin/marche/soumissions" className="min-h-10 mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Gestion des soumissions
            </Link>
            <h1 className="text-2xl font-bold md:text-3xl">Automatisations et relances</h1>
            <p className="text-sm text-muted-foreground">Rappels, alertes et suivis déclenchés automatiquement selon vos délais.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={async () => {
              setBusy(true);
              try {
                const res = await runAutomations();
                await charger();
                toast({ title: `${res.actions} action(s) déclenchée(s)` });
              } catch (e) {
                toast({ title: "Exécution impossible", description: (e as Error).message, variant: "destructive" });
              } finally { setBusy(false); }
            }} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />} Exécuter maintenant
            </Button>
            <Button variant="outline" onClick={() => void charger()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {rules.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-[220px] flex-1">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Dernière exécution : {dt(r.last_run_at)}</p>
                </div>
                <div className="w-32">
                  <Label className="text-xs text-muted-foreground">Délai (heures)</Label>
                  <Input inputMode="numeric" value={String(r.delay_hours)}
                    onChange={(e) => majRegle(r, { delay_hours: Number(e.target.value) || 0 })} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={r.is_active} onCheckedChange={(v) => majRegle(r, { is_active: v })} />
                  <span className="text-sm">{r.is_active ? "Active" : "Inactive"}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Journal des actions ({runs.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {runs.length === 0 && <p className="text-muted-foreground">Aucune action déclenchée pour le moment.</p>}
            {runs.map((r, i) => (
              <p key={i} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
                <span>{String(r.rule_key)} — {String(r.action)}</span>
                <span className="text-muted-foreground">{dt(r.created_at)}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
