// Simulations, risques, stratégies et règles d'orchestration.
import { useEffect, useState } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CAD, NUM, RISK_LEVELS, SCENARIOS, SIM_FIELDS, invokeOrchestrator,
  type OrchRule, type RiskRow, type SimulationRow, type StrategyRow,
} from "@/lib/jsc/orchestrator";

/* ---------------- Simulations ---------------- */
export function SimulationLab({ companyId }: { companyId: string | null }) {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [inputs, setInputs] = useState<Record<string, number>>(SCENARIOS[0].defaults);
  const [name, setName] = useState(SCENARIOS[0].label);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<SimulationRow[]>([]);

  const load = async () => {
    const { data } = await supabase.from("jsc_simulations").select("*").order("created_at", { ascending: false }).limit(20);
    setRows((data ?? []) as unknown as SimulationRow[]);
  };
  useEffect(() => { void load(); }, [companyId]);

  const run = async () => {
    setBusy(true);
    try {
      await invokeOrchestrator({ action: "simulate", company_id: companyId, name, scenario_type: scenario.value, inputs });
      toast.success("Simulation calculée");
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs">Scénario</Label>
            <select className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
              value={scenario.value}
              onChange={(e) => {
                const s = SCENARIOS.find((x) => x.value === e.target.value)!;
                setScenario(s); setInputs(s.defaults); setName(s.label);
              }}>
              {SCENARIOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{scenario.hint}</p>
          </div>
          <div>
            <Label className="text-xs">Nom de la simulation</Label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SIM_FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{f.label} {f.suffix && `(${f.suffix})`}</Label>
              <Input className="mt-1" type="number" value={inputs[f.key] ?? ""}
                onChange={(e) => setInputs((s) => ({ ...s, [f.key]: e.target.value === "" ? 0 : Number(e.target.value) }))} />
            </div>
          ))}
        </div>
        <Button className="mt-4" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Lancer la simulation
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Base de calcul : 180 derniers jours de commandes réelles.</p>
      </div>

      {rows.map((s) => (
        <div key={s.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{s.name}</h3>
            <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("fr-CA")}</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {["revenue", "cost", "profit", "margin_pct", "volume_tonnes", "orders"].map((k) => (
              <div key={k} className="rounded-lg border border-border p-3 text-sm">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div>Base : {k.includes("pct") ? `${NUM(s.baseline?.[k], 1)} %` : k === "orders" || k === "volume_tonnes" ? NUM(s.baseline?.[k], 1) : CAD(s.baseline?.[k])}</div>
                <div className="font-semibold">Projeté : {k.includes("pct") ? `${NUM(s.projection?.[k], 1)} %` : k === "orders" || k === "volume_tonnes" ? NUM(s.projection?.[k], 1) : CAD(s.projection?.[k])}</div>
                <div className={Number(s.delta?.[k] ?? 0) >= 0 ? "text-primary" : "text-destructive"}>
                  Δ {k.includes("pct") ? `${NUM(s.delta?.[k], 1)} pts` : k === "orders" || k === "volume_tonnes" ? NUM(s.delta?.[k], 1) : CAD(s.delta?.[k])}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Risques ---------------- */
export function RiskBoard({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("jsc_risks").select("*").eq("status", "open").order("score", { ascending: false }).limit(100);
    setRows((data ?? []) as unknown as RiskRow[]);
  };
  useEffect(() => { void load(); }, [companyId]);

  const detect = async () => {
    setBusy(true);
    try { await invokeOrchestrator({ action: "run", company_id: companyId }); toast.success("Analyse des risques terminée"); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const resolve = async (id: string) => {
    const { error } = await supabase.from("jsc_risks").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Risque marqué comme résolu"); void load();
  };

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={detect} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Relancer la détection
      </Button>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucun risque ouvert.</p> : rows.map((r) => {
        const lvl = RISK_LEVELS[r.level] ?? RISK_LEVELS.low;
        return (
          <div key={r.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{r.title}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${lvl.className}`}>{lvl.label} · {NUM(r.score)}</span>
            </div>
            {r.detail && <p className="mt-1 text-sm text-muted-foreground">{r.detail}</p>}
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => resolve(r.id)}>Marquer comme résolu</Button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Stratégies ---------------- */
export function StrategyBoard({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("jsc_strategies").select("*").order("created_at", { ascending: false }).limit(40);
    setRows((data ?? []) as unknown as StrategyRow[]);
  };
  useEffect(() => { void load(); }, [companyId]);

  const generate = async () => {
    setBusy(true);
    try { await invokeOrchestrator({ action: "strategy", company_id: companyId }); toast.success("Recommandations générées"); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const decide = async (id: string, status: string) => {
    const { error } = await supabase.from("jsc_strategies").update({ status, decided_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div className="space-y-4">
      <Button onClick={generate} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Générer des recommandations
      </Button>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucune recommandation stratégique pour l'instant.</p> : rows.map((s) => (
        <div key={s.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{s.title}</span>
            <span className="text-xs text-muted-foreground">{s.kind} · {s.horizon} · confiance {NUM(s.confidence * 100)} %</span>
          </div>
          {s.rationale && <p className="mt-1 text-sm text-muted-foreground">{s.rationale}</p>}
          <div className="mt-2 text-sm">Impact estimé : <strong>{CAD(s.impact_estimate)}</strong></div>
          {s.status === "pending" ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => decide(s.id, "accepted")}>Accepter</Button>
              <Button size="sm" variant="ghost" onClick={() => decide(s.id, "rejected")}>Rejeter</Button>
            </div>
          ) : <div className="mt-2 text-xs text-muted-foreground">Statut : {s.status}</div>}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Règles ---------------- */
export function RulesBoard({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<OrchRule[]>([]);

  const load = async () => {
    const { data } = await supabase.from("jsc_orch_rules").select("*").order("sort_order").limit(100);
    setRows((data ?? []) as unknown as OrchRule[]);
  };
  useEffect(() => { void load(); }, [companyId]);

  const save = async (id: string, patch: Partial<OrchRule>) => {
    const { error } = await supabase.from("jsc_orch_rules").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">{r.label}</div>
              {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Seuil</Label>
                <Input className="w-28" type="number" defaultValue={r.threshold}
                  onBlur={(e) => Number(e.target.value) !== r.threshold && save(r.id, { threshold: Number(e.target.value) })} />
              </div>
              <Switch checked={r.is_active} onCheckedChange={(v) => save(r.id, { is_active: v })} />
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {r.metric} · {r.operator} · déclenchée {NUM(r.trigger_count)} fois
            {r.last_triggered_at && ` · dernière : ${new Date(r.last_triggered_at).toLocaleString("fr-CA")}`}
            {r.last_value != null && ` · dernière valeur : ${NUM(r.last_value, 2)}`}
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune règle configurée.</p>}
    </div>
  );
}
