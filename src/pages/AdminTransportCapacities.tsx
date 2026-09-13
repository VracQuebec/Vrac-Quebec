// ============================================================
// ADMINISTRATION — CAPACITÉS RÉELLES DE TRANSPORT
// ------------------------------------------------------------
// Sépare clairement : LIMITE RÉGLEMENTAIRE / CAPACITÉ CALCULÉE /
// CAPACITÉ OPÉRATIONNELLE. Aucune limite légale n'est inventée :
// les masses admissibles sont saisies et validées par l'administration.
// Cet écran n'est branché ni au site public, ni au matching,
// ni à la tarification.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Scale, Truck, Gauge, Layers, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  computePayloadKg, kgToTonnes, validateOperationalCapacityKg,
} from "@/lib/transport/capacity";

type ConfigRow = {
  id: string; code: string; label: string; vehicle_class: string;
  axle_count: number | null; trailer_axle_count: number | null;
  axle_configuration: string | null; sort_order: number | null; is_active: boolean;
};
type RuleRow = {
  id: string; config_id: string | null; season: string; version: number;
  max_total_mass_kg: number | null; max_group_mass_kg: number | null;
  regulatory_source: string | null; effective_from: string | null;
  last_verified_at: string | null; validation_status: string; notes: string | null;
};
type CapacityRow = {
  id: string; config_id: string; label: string | null;
  tractor_tare_kg: number | null; trailer_tare_kg: number | null; combo_tare_kg: number | null;
  gross_admissible_kg: number | null; payload_kg: number | null;
  operational_capacity_kg: number | null; volume_capacity: number | null;
  volume_unit: string | null; data_source: string | null; validated_at: string | null;
  notes: string | null; is_active: boolean;
};
type DensityRow = {
  id: string; material_slug: string | null; density_avg_kg_m3: number | null;
  density_min_kg_m3: number | null; density_max_kg_m3: number | null;
  is_estimate: boolean; data_source: string | null;
};

const TABS = [
  { id: "configs", label: "Configurations", icon: Truck },
  { id: "capacities", label: "Capacités", icon: Gauge },
  { id: "rules", label: "Règles Québec", icon: Scale },
  { id: "densities", label: "Densités", icon: Layers },
] as const;
type TabId = (typeof TABS)[number]["id"];

const kg = (v: number | null | undefined) =>
  v == null ? "—" : `${new Intl.NumberFormat("fr-CA").format(Number(v))} kg`;
const tonnes = (v: number | null | undefined) => {
  const t = kgToTonnes(v == null ? null : Number(v));
  return t == null ? "—" : `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(t)} t`;
};
const numOrNull = (v: string) => {
  const n = Number(String(v).replace(",", ".").trim());
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

export default function AdminTransportCapacities() {
  const { ready, session } = useAuthReady();
  const { roles, loading: rolesLoading } = useUserRoles();
  const isAdmin = roles.includes("admin");

  const [tab, setTab] = useState<TabId>("configs");
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [capacities, setCapacities] = useState<CapacityRow[]>([]);
  const [densities, setDensities] = useState<DensityRow[]>([]);
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r, cap, d] = await Promise.all([
      supabase.from("transport_vehicle_configs").select("*").order("sort_order"),
      supabase.from("transport_weight_rules").select("*").order("version"),
      supabase.from("transport_vehicle_capacities").select("*").order("created_at"),
      supabase.from("transport_material_densities").select("*").order("created_at"),
    ]);
    setConfigs((c.data ?? []) as ConfigRow[]);
    setRules((r.data ?? []) as RuleRow[]);
    setCapacities((cap.data ?? []) as CapacityRow[]);
    setDensities((d.data ?? []) as DensityRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (ready && isAdmin) void load(); }, [ready, isAdmin, load]);

  const configLabel = useMemo(
    () => Object.fromEntries(configs.map((c) => [c.id, c.label])),
    [configs],
  );

  const field = (rowId: string, key: string, current: unknown) =>
    draft[rowId]?.[key] ?? (current == null ? "" : String(current));

  const setField = (rowId: string, key: string, value: string) =>
    setDraft((d) => ({ ...d, [rowId]: { ...(d[rowId] ?? {}), [key]: value } }));

  const previewPayload = (row: CapacityRow) =>
    computePayloadKg({
      tractorTareKg: numOrNull(field(row.id, "tractor_tare_kg", row.tractor_tare_kg)),
      trailerTareKg: numOrNull(field(row.id, "trailer_tare_kg", row.trailer_tare_kg)),
      comboTareKg: numOrNull(field(row.id, "combo_tare_kg", row.combo_tare_kg)),
      grossAdmissibleKg: numOrNull(field(row.id, "gross_admissible_kg", row.gross_admissible_kg)),
    });

  const saveCapacity = async (row: CapacityRow) => {
    const payload = previewPayload(row);
    const operational = numOrNull(field(row.id, "operational_capacity_kg", row.operational_capacity_kg));
    const check = validateOperationalCapacityKg(operational, payload);
    if (operational != null && !check.ok) {
      toast.error(check.reason ?? "Capacité opérationnelle refusée.");
      return;
    }
    setSavingId(row.id);
    const patch = {
      label: field(row.id, "label", row.label) || null,
      tractor_tare_kg: numOrNull(field(row.id, "tractor_tare_kg", row.tractor_tare_kg)),
      trailer_tare_kg: numOrNull(field(row.id, "trailer_tare_kg", row.trailer_tare_kg)),
      combo_tare_kg: numOrNull(field(row.id, "combo_tare_kg", row.combo_tare_kg)),
      gross_admissible_kg: numOrNull(field(row.id, "gross_admissible_kg", row.gross_admissible_kg)),
      operational_capacity_kg: operational,
      volume_capacity: numOrNull(field(row.id, "volume_capacity", row.volume_capacity)),
      data_source: field(row.id, "data_source", row.data_source) || null,
      notes: field(row.id, "notes", row.notes) || null,
    };
    const { error } = await supabase
      .from("transport_vehicle_capacities").update(patch).eq("id", row.id);
    setSavingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Capacité enregistrée.");
    setDraft((d) => ({ ...d, [row.id]: {} }));
    void load();
  };

  const addCapacity = async (configId: string) => {
    const { error } = await supabase.from("transport_vehicle_capacities").insert({
      config_id: configId, label: "Nouvel équipement", volume_unit: "m3",
    });
    if (error) { toast.error(error.message); return; }
    setTab("capacities");
    void load();
  };

  if (!ready || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session || !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Accès réservé à l'administration</h1>
        <Button asChild variant="outline"><Link to="/">Retour à l'accueil</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" aria-label="Retour">
              <Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Capacités de transport</h1>
              <p className="text-xs text-muted-foreground">
                Limite réglementaire, capacité calculée et capacité opérationnelle — usage interne.
              </p>
            </div>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? "default" : "ghost"}
              size="sm"
              className="shrink-0"
              onClick={() => setTab(t.id)}
            >
              <t.icon className="mr-2 h-4 w-4" />{t.label}
            </Button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && tab === "configs" && (
          <div className="space-y-3">
            {configs.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.vehicle_class} · {c.axle_count ?? "—"} essieux
                      {c.trailer_axle_count ? ` (remorque : ${c.trailer_axle_count})` : ""}
                      {c.axle_configuration ? ` · ${c.axle_configuration}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addCapacity(c.id)}>
                    Ajouter un équipement
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "capacities" && (
          <div className="space-y-4">
            {capacities.length === 0 && (
              <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Aucun équipement enregistré. Ajoutez-en un depuis l'onglet « Configurations ».
              </p>
            )}
            {capacities.map((row) => {
              const payload = previewPayload(row);
              const operational = numOrNull(
                field(row.id, "operational_capacity_kg", row.operational_capacity_kg),
              );
              const check = validateOperationalCapacityKg(operational, payload);
              return (
                <div key={row.id} className="space-y-3 rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">{configLabel[row.config_id] ?? "—"}</p>
                    <Button size="sm" disabled={savingId === row.id} onClick={() => saveCapacity(row)}>
                      {savingId === row.id
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Save className="mr-2 h-4 w-4" />}
                      Enregistrer
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {([
                      ["label", "Identification", row.label],
                      ["tractor_tare_kg", "Poids à vide du tracteur (kg)", row.tractor_tare_kg],
                      ["trailer_tare_kg", "Poids à vide de la remorque (kg)", row.trailer_tare_kg],
                      ["combo_tare_kg", "Poids à vide de l'ensemble (kg)", row.combo_tare_kg],
                      ["gross_admissible_kg", "Masse totale admissible (kg)", row.gross_admissible_kg],
                      ["operational_capacity_kg", "Capacité opérationnelle (kg)", row.operational_capacity_kg],
                      ["volume_capacity", "Capacité volumique", row.volume_capacity],
                      ["data_source", "Source de la donnée", row.data_source],
                      ["notes", "Notes", row.notes],
                    ] as const).map(([key, label, value]) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={`${row.id}-${key}`} className="text-xs">{label}</Label>
                        <Input
                          id={`${row.id}-${key}`}
                          value={field(row.id, key, value)}
                          onChange={(e) => setField(row.id, key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Limite réglementaire</p>
                      <p className="font-medium">{kg(numOrNull(field(row.id, "gross_admissible_kg", row.gross_admissible_kg)))}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Capacité calculée</p>
                      <p className="font-medium">{payload == null ? "—" : `${kg(payload)} · ${tonnes(payload)}`}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Capacité opérationnelle</p>
                      <p className="font-medium">{kg(operational)}</p>
                    </div>
                  </div>
                  {operational != null && !check.ok && (
                    <p className="text-sm text-destructive">{check.reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "rules" && (
          <div className="space-y-3">
            <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
              Les masses admissibles doivent être saisies et validées contre la réglementation
              officielle du Québec avant d'être présentées comme une limite légale. Chaque règle
              est versionnée avec sa date d'entrée en vigueur.
            </p>
            {rules.map((r) => (
              <div key={r.id} className="rounded-lg border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.config_id ? configLabel[r.config_id] ?? "—" : "Général"} · période {r.season} · v{r.version}
                  </p>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{r.validation_status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Masse totale admissible : {kg(r.max_total_mass_kg)} · par groupe : {kg(r.max_group_mass_kg)} ·
                  source : {r.regulatory_source ?? "—"} · en vigueur : {r.effective_from ?? "—"} ·
                  vérifiée : {r.last_verified_at ?? "—"}
                </p>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "densities" && (
          <div className="space-y-3">
            <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
              Les densités sont des estimations : elles varient selon l'humidité, la granulométrie,
              la composition et la compaction. Une conversion volume → poids n'est jamais exacte.
            </p>
            {densities.length === 0 && (
              <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Aucune densité enregistrée pour l'instant.
              </p>
            )}
            {densities.map((d) => (
              <div key={d.id} className="rounded-lg border bg-card p-4 text-sm">
                <p className="font-medium">{d.material_slug ?? "Matériau"}</p>
                <p className="text-xs text-muted-foreground">
                  Moyenne : {d.density_avg_kg_m3 ?? "—"} kg/m³ · min : {d.density_min_kg_m3 ?? "—"} ·
                  max : {d.density_max_kg_m3 ?? "—"} · {d.is_estimate ? "estimation" : "valeur mesurée"}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
