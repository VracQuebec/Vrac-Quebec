// ============================================================
// ADMINISTRATION — MATCHING LAB (INTERNE, LECTURE / SIMULATION)
// ------------------------------------------------------------
// Aucune écriture métier : pas de réservation, pas de changement de
// statut CRM, de disponibilité, de capacité, ni d'envoi de courriel/SMS.
// Le matching public reste INACTIF (matching_v2_enabled_public = false).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FlaskConical, Loader2, Search, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  rankCandidates,
  planAllocation,
  computeQuantity,
  MATCHING_ALGORITHM_VERSION,
  type CandidateRow,
  type MatchResult,
  type QuantityUnit,
  type VehicleProfileLite,
} from "@/lib/matching/engine";
import { VEHICLE_CONFIG_CODES, kgToTonnes } from "@/lib/transport/capacity";
import MaterialAssistant from "@/components/admin/MaterialAssistant";

const UNITS: { value: QuantityUnit; label: string }[] = [
  { value: "tonnes", label: "tonnes" },
  { value: "tonnes_metriques", label: "tonnes métriques" },
  { value: "m3", label: "m³" },
  { value: "verges3", label: "verges³" },
];

export default function AdminMatchingLab() {
  const { isReady: ready } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();

  const [material, setMaterial] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<QuantityUnit>("tonnes");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [configCode, setConfigCode] = useState<string>("porteur_12_roues");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, VehicleProfileLite>>({});
  const [publicFlag, setPublicFlag] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"recherche" | "assistant" | "interpreteur">("recherche");

  useEffect(() => {
    if (!ready || !isAdmin) return;
    (async () => {
      const { data: flag } = await supabase
        .from("matching_settings").select("value").eq("key", "matching_v2_enabled_public").maybeSingle();
      setPublicFlag(Boolean((flag?.value as { enabled?: boolean } | null)?.enabled));

      const { data: caps } = await supabase
        .from("transport_vehicle_capacities")
        .select("id, config_id, operational_capacity_kg, payload_kg, transport_vehicle_configs(code)")
        .eq("is_active", true);
      const { data: dims } = await supabase
        .from("transport_vehicle_dimensions")
        .select("config_id, overall_length_m, mirror_to_mirror_width_m, overall_height_m, turning_radius_m, ground_clearance_m, combo_measured_length_m, combo_max_width_m, combo_max_height_m, transport_vehicle_configs(code)")
        .eq("is_active", true);

      const map: Record<string, VehicleProfileLite> = {};
      for (const code of VEHICLE_CONFIG_CODES) map[code] = { configCode: code };
      (caps ?? []).forEach((c) => {
        const code = (c as { transport_vehicle_configs?: { code?: string } }).transport_vehicle_configs?.code;
        if (!code || !map[code]) return;
        map[code].capacityTonnes = kgToTonnes(c.operational_capacity_kg ?? c.payload_kg ?? null);
      });
      (dims ?? []).forEach((d) => {
        const code = (d as { transport_vehicle_configs?: { code?: string } }).transport_vehicle_configs?.code;
        if (!code || !map[code]) return;
        map[code].overallLengthM = d.combo_measured_length_m ?? d.overall_length_m ?? null;
        map[code].mirrorToMirrorWidthM = d.combo_max_width_m ?? d.mirror_to_mirror_width_m ?? null;
        map[code].overallHeightM = d.combo_max_height_m ?? d.overall_height_m ?? null;
        map[code].turningRadiusM = d.turning_radius_m ?? null;
        map[code].groundClearanceM = d.ground_clearance_m ?? null;
      });
      setVehicles(map);
    })();
  }, [ready, isAdmin]);

  const vehicle = vehicles[configCode] ?? { configCode };

  const quantityInfo = useMemo(
    () => computeQuantity({
      quantity: quantity ? Number(quantity) : null,
      unit,
      truckCapacityTonnes: vehicle.capacityTonnes ?? null,
    }),
    [quantity, unit, vehicle.capacityTonnes],
  );

  const allocation = useMemo(
    () => (quantityInfo.tonnes ? planAllocation(quantityInfo.tonnes, results, vehicle.capacityTonnes ?? null) : null),
    [quantityInfo.tonnes, results, vehicle.capacityTonnes],
  );

  const search = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("matching_lab_candidates", {
        _lat: lat ? Number(lat) : null,
        _lng: lng ? Number(lng) : null,
        _limit: 200,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as CandidateRow[];
      const ranked = rankCandidates(
        { materialSlug: material, materialLabel: material, quantity: quantity ? Number(quantity) : null, unit },
        rows,
        vehicle,
      );
      setResults(ranked);
      // Journal de simulation (aucune donnée personnelle).
      await supabase.from("matching_simulation_log").insert({
        algorithm_version: MATCHING_ALGORITHM_VERSION,
        criteria: { material, quantity, unit, configCode, lat, lng },
        results: ranked.slice(0, 20).map((r) => ({
          id: r.candidate.id, score: r.score, confidence: r.confidence,
          compatibility: r.material.compatibility, distance_km: r.distance.km,
        })),
        result_count: ranked.length,
        top_score: ranked[0]?.score ?? null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recherche impossible");
    } finally {
      setLoading(false);
    }
  };

  if (!ready || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">Accès réservé à l'administration.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" />Retour</Link></Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><FlaskConical className="h-6 w-6" />Matching Lab</h1>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><TriangleAlert className="h-4 w-4" />Outil interne — lecture et simulation seulement.</p>
          <p className="text-muted-foreground">
            Aucune réservation, aucun changement de statut, de disponibilité ou de capacité, aucune communication.
            Matching public : <strong>{publicFlag ? "ACTIVÉ" : "inactif"}</strong> · algorithme {MATCHING_ALGORITHM_VERSION}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ["recherche", "Recherche"],
            ["assistant", "Assistant IA matériaux"],
            ["interpreteur", "Interpréteur IA"],
          ] as const).map(([key, label]) => (
            <Button key={key} size="sm" variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>
              {label}
            </Button>
          ))}
        </div>

        {tab !== "recherche" && (
          <MaterialAssistant vehicles={vehicles} inspectorMode={tab === "interpreteur"} />
        )}

        {tab === "recherche" && (<>
        <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Matériau à évacuer</Label>
            <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="terre brune" />
          </div>
          <div>
            <Label>Quantité</Label>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="400" />
          </div>
          <div>
            <Label>Unité</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={unit} onChange={(e) => setUnit(e.target.value as QuantityUnit)}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Latitude</Label>
            <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="46.81" />
          </div>
          <div>
            <Label>Longitude</Label>
            <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-71.21" />
          </div>
          <div className="md:col-span-2">
            <Label>Type de camion</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={configCode} onChange={(e) => setConfigCode(e.target.value)}>
              {VEHICLE_CONFIG_CODES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div className="flex items-end md:col-span-2">
            <Button onClick={search} disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Rechercher les demandes de remblai
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 text-sm">
          <p><strong>Capacité par voyage :</strong> {vehicle.capacityTonnes ? `${vehicle.capacityTonnes.toFixed(1)} t` : "inconnue (à configurer)"}</p>
          <p><strong>Quantité totale :</strong> {quantityInfo.tonnes ? `${quantityInfo.tonnes.toFixed(1)} t${quantityInfo.isEstimate ? " (estimation)" : ""}` : "—"}</p>
          <p><strong>Nombre de voyages estimé :</strong> {quantityInfo.trips ?? "—"}</p>
          {quantityInfo.note && <p className="text-muted-foreground">{quantityInfo.note}</p>}
        </div>

        {allocation && allocation.lines.length > 0 && (
          <div className="rounded-lg border border-border p-4 text-sm">
            <h2 className="mb-2 font-semibold">Répartition multi-remblais (simulation)</h2>
            <ul className="space-y-1">
              {allocation.lines.map((l) => (
                <li key={l.submissionId}>{l.label} — {l.allocatedTonnes.toFixed(0)} t · {l.trips ?? "?"} voyage(s)</li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Réparti : {allocation.allocated.toFixed(0)} t · Non réparti : {allocation.unallocated.toFixed(0)} t. {allocation.note}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.candidate.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {r.candidate.dompe_number || r.candidate.submission_number || r.candidate.id}
                  {r.candidate.city ? ` — ${r.candidate.city}` : ""}
                </h3>
                <span className="text-sm">Score {r.score} · {r.material.compatibility.replace(/_/g, " ")} · confiance {r.confidence.replace(/_/g, " ").toLowerCase()}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {r.distance.km != null ? `${r.distance.km.toFixed(1)} km (${r.distance.kind.toLowerCase()})` : "distance inconnue"} ·
                {" "}{r.availability.label} · accessibilité {r.access.verdict.replace(/_/g, " ").toLowerCase()}
                {r.candidate.remaining_capacity ? ` · capacité ${r.candidate.remaining_capacity}` : " · capacité inconnue"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Matériaux acceptés : {(r.candidate.accepted_materials ?? []).map((m) => m.name ?? m.slug ?? m.original_value).filter(Boolean).join(", ") || "non renseignés"}
              </p>
              <ul className="mt-2 space-y-0.5 text-xs">
                {r.factors.map((f, i) => (
                  <li key={i}>{f.status === "ok" ? "✓" : f.status === "warn" ? "⚠" : "•"} {f.label} ({f.points})</li>
                ))}
              </ul>
              {r.missingData.length > 0 && (
                <p className="mt-2 text-xs text-amber-600">Données manquantes : {r.missingData.join(" · ")}</p>
              )}
            </div>
          ))}
          {!loading && results.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun résultat pour l'instant.</p>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}
