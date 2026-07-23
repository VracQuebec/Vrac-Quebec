// Dashboard — AI Economy (Phase 3).
// Realtime counters for AI calls, cache hits, credits saved, and a toggle
// for Max Economy mode (blocks automatic AI calls; only human-triggered
// generation/rewrite is allowed). Also lists the last 50 calls.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Zap, Database, Clock, TrendingDown, RefreshCw } from "lucide-react";

type Stats = {
  window_days: number;
  calls_total: number;
  calls_ai: number;
  calls_cached: number;
  credits_spent: number;
  credits_saved: number;
  time_saved_ms: number;
  cache_hit_rate: number;
  cache_entries: number;
  total_hits_all_time: number;
  total_saved_all_time: number;
};

type CallRow = {
  id: number;
  function_name: string | null;
  model: string | null;
  cached: boolean;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  estimated_credits: number;
  duration_ms: number | null;
  created_at: string;
};

function fmtMs(ms: number): string {
  if (!ms) return "0 s";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${(s / 60).toFixed(1)} min`;
}

export default function AdminAiEconomy() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<CallRow[]>([]);
  const [economy, setEconomy] = useState<boolean>(true);
  const [windowDays, setWindowDays] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: setting }, { data: log }] = await Promise.all([
        supabase.rpc("ai_economy_stats", { _days: windowDays }),
        supabase.from("ai_settings").select("economy_mode").eq("id", 1).maybeSingle(),
        supabase.from("ai_call_log").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      if (s) setStats(s as unknown as Stats);
      if (setting) setEconomy(setting.economy_mode !== false);
      setRows((log as CallRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  const toggleEconomy = async (next: boolean) => {
    setEconomy(next);
    const { error } = await supabase
      .from("ai_settings")
      .update({ economy_mode: next, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) {
      toast.error("Impossible de modifier le mode");
      setEconomy(!next);
    } else {
      toast.success(next ? "Mode Économie maximale activé" : "Mode Économie désactivé");
    }
  };

  const kpis = [
    { label: "Appels IA effectués", value: stats?.calls_ai ?? 0, icon: Sparkles, tone: "text-primary" },
    { label: "Appels évités (cache)", value: stats?.calls_cached ?? 0, icon: Database, tone: "text-green-500" },
    { label: "Crédits économisés", value: (stats?.credits_saved ?? 0).toFixed(2), icon: TrendingDown, tone: "text-green-500" },
    { label: "Coût estimé", value: (stats?.credits_spent ?? 0).toFixed(2) + " crédits", icon: Zap, tone: "text-amber-500" },
    { label: "% d'économie", value: `${stats?.cache_hit_rate ?? 0}%`, icon: TrendingDown, tone: "text-green-500" },
    { label: "Temps économisé", value: fmtMs(stats?.time_saved_ms ?? 0), icon: Clock, tone: "text-primary" },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Économie IA</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Chaque appel IA est une ressource coûteuse. Le cache permanent réutilise
            les résultats identiques et la déduplication regroupe les demandes concurrentes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
          {[1, 7, 30].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={windowDays === d ? "default" : "outline"}
              onClick={() => setWindowDays(d)}
            >
              {d === 1 ? "24 h" : `${d} j`}
            </Button>
          ))}
        </div>
      </div>

      <Card className="border-primary/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Mode Économie maximale
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Activé par défaut. Bloque les appels IA automatiques (QA, batch, maillage) et
              n'autorise que la création ou la réécriture explicitement demandées par un humain.
            </p>
          </div>
          <Switch checked={economy} onCheckedChange={toggleEconomy} />
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="p-4">
                <Icon className={`h-5 w-5 mb-2 ${k.tone}`} />
                <div className="text-2xl font-bold">{k.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Cache permanent</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Entrées en cache</span><span className="font-semibold">{stats?.cache_entries ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Réutilisations totales</span><span className="font-semibold">{stats?.total_hits_all_time ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Crédits économisés (total)</span><span className="font-semibold text-green-500">{(stats?.total_saved_all_time ?? 0).toFixed(2)}</span></div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Comment fonctionne l'économie</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Cache permanent : contenu identique → 0 appel IA.</p>
            <p>• Déduplication : plusieurs tâches simultanées identiques → 1 seul appel partagé.</p>
            <p>• Non-textuel (QA, maillage, stats, métadonnées) : 100 % déterministe, aucun appel IA.</p>
            <p>• Mode Économie maximale : les jobs automatiques ne peuvent pas déclencher l'IA — seule la création/réécriture explicite le peut.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">50 derniers appels</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-3">Fonction</th>
                  <th className="text-left p-3">Modèle</th>
                  <th className="text-left p-3">Statut</th>
                  <th className="text-right p-3">Crédits</th>
                  <th className="text-right p-3">Durée</th>
                  <th className="text-right p-3">Heure</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">{r.function_name}</td>
                    <td className="p-3 text-muted-foreground">{r.model}</td>
                    <td className="p-3">
                      {r.cached
                        ? <Badge variant="secondary" className="bg-green-500/10 text-green-500">Cache</Badge>
                        : <Badge variant="secondary" className="bg-amber-500/10 text-amber-500">IA</Badge>}
                    </td>
                    <td className="p-3 text-right">{r.estimated_credits.toFixed(3)}</td>
                    <td className="p-3 text-right">{fmtMs(r.duration_ms ?? 0)}</td>
                    <td className="p-3 text-right text-muted-foreground">{new Date(r.created_at).toLocaleTimeString("fr-CA")}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Aucun appel enregistré sur la fenêtre sélectionnée.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}