// Objectifs d'affaires — création, suivi et progression automatique.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { GOAL_METRICS, money, num, rpc, table, type Goal } from "@/lib/bi/api";
import { SectionCard } from "./BiShared";

const firstDay = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const lastDay = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

export default function BiGoals({ companyId }: { companyId: string | null }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "", metric: "revenue", target_value: "", starts_on: firstDay(), ends_on: lastDay(),
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await rpc("jsc_bi_goal_progress", { _company_id: companyId });
    if (error) toast.error(error.message);
    setGoals((data as Goal[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !Number(form.target_value)) { toast.error("Nom et valeur cible requis."); return; }
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await table("jsc_bi_goals").insert({
      name: form.name.trim(),
      metric: form.metric,
      target_value: Number(form.target_value),
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      company_id: companyId,
      created_by: auth.user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Objectif créé.");
    setForm({ ...form, name: "", target_value: "" });
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await table("jsc_bi_goals").update({ archived_at: new Date().toISOString(), is_active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Nouvel objectif" subtitle="Fixez une cible et suivez la progression en temps réel">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Nom</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CA du mois" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Indicateur</Label>
            <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GOAL_METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cible</Label>
            <Input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Début</Label>
            <Input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fin</Label>
            <Input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={create}><Plus className="mr-1.5 h-4 w-4" /> Ajouter l'objectif</Button>
      </SectionCard>

      <SectionCard title="Progression des objectifs" subtitle="Calculée automatiquement sur les données réelles">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </p>
        ) : goals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun objectif actif.</p>
        ) : (
          <ul className="space-y-3">
            {goals.map((g) => {
              const meta = GOAL_METRICS.find((m) => m.value === g.metric);
              const fmt = (v: number) => (meta?.money ? money(v) : num(v));
              const progress = g.target_value ? Math.min(100, (Number(g.current_value) / Number(g.target_value)) * 100) : 0;
              return (
                <li key={g.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Target className="h-4 w-4 text-primary" /> {g.name}
                      <span className="text-xs font-normal text-muted-foreground">
                        {meta?.label} · {g.starts_on} → {g.ends_on}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm tabular-nums">{fmt(Number(g.current_value))} / {fmt(Number(g.target_value))}</span>
                      <Button size="icon" variant="ghost" onClick={() => remove(g.id)} aria-label="Archiver l'objectif">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Progress value={progress} className="mt-2 h-2" />
                  <p className="mt-1 text-xs text-muted-foreground">{num(progress, 1)} % de l'objectif atteint</p>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}