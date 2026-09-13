// ============================================================
// ADMINISTRATION — MATCHING ENGINE LAB (LOT 8, INTERNE)
// ------------------------------------------------------------
// Moteur bidirectionnel V2 : OFFRE DE MATÉRIAUX ↔ DEMANDE DE REMBLAI.
// Lecture et simulation seulement : aucune réservation, aucune
// modification de demande, de statut, de disponibilité ou de capacité,
// aucune communication automatique. Matching public : INACTIF.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Loader2, Map as MapIcon, Play, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import PreviewResultsMap from "@/components/parcours/PreviewResultsMap";
import { VEHICLE_CONFIG_CODES, kgToTonnes } from "@/lib/transport/capacity";
import type { VehicleProfileLite } from "@/lib/matching/engine";
import { interpretDescription, DEFAULT_SYNONYMS, type SynonymEntry } from "@/lib/matching/interpreter";
import {
  MATCHING_V2_VERSION,
  DEFAULT_V2_WEIGHTS,
  buildMatchingMatrix,
  categoryLabel,
  hiddenOpportunities,
  matchDemandToOffers,
  matchOfferToDemands,
  matrixSummary,
  networkAnalytics,
  offersWithoutMatch,
  planDistributionOptions,
  recommendedQuestion,
  underusedDemands,
  type DemandRow,
  type MatchV2Result,
  type MatchWeights,
  type OfferInput,
} from "@/lib/matching/v2";

type Tab = "offre" | "demande" | "matrice" | "opportunites" | "analytics" | "carte" | "poids";

const TABS: [Tab, string][] = [
  ["offre", "Offre → demandes"],
  ["demande", "Demande → offres"],
  ["matrice", "Matrice de matching"],
  ["opportunites", "Opportunités à valider"],
  ["analytics", "Analytics réseau"],
  ["carte", "Carte du réseau"],
  ["poids", "Poids du moteur"],
];

const EXAMPLE_OFFER = "J'ai 400 tonnes de terre sablonneuse avec un peu de glaise et des petites pierres.";

export default function AdminMatchingEngine() {
  const { isReady: ready } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();

  const [tab, setTab] = useState<Tab>("offre");
  const [text, setText] = useState(EXAMPLE_OFFER);
  const [lat, setLat] = useState("46.81");
  const [lng, setLng] = useState("-71.21");
  const [configCode, setConfigCode] = useState<string>("");
  const [limit, setLimit] = useState("100");

  const [vehicles, setVehicles] = useState<VehicleProfileLite[]>([]);
  const [synonyms, setSynonyms] = useState<SynonymEntry[]>(DEFAULT_SYNONYMS);
  const [weights, setWeights] = useState<MatchWeights>(DEFAULT_V2_WEIGHTS);
  const [publicFlag, setPublicFlag] = useState<boolean | null>(null);

  const [demands, setDemands] = useState<DemandRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchV2Result[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<string>("");

  useEffect(() => {
    if (!ready || !isAdmin) return;
    (async () => {
      const [{ data: flag }, { data: w }, { data: caps }, { data: dims }, { data: syn }] = await Promise.all([
        supabase.from("matching_settings").select("value").eq("key", "matching_v2_enabled_public").maybeSingle(),
        supabase.from("matching_settings").select("value").eq("key", "matching_v2_weights").maybeSingle(),
        supabase.from("transport_vehicle_capacities")
          .select("operational_capacity_kg, payload_kg, transport_vehicle_configs(code)").eq("is_active", true),
        supabase.from("transport_vehicle_dimensions")
          .select("overall_length_m, mirror_to_mirror_width_m, overall_height_m, turning_radius_m, combo_measured_length_m, combo_max_width_m, combo_max_height_m, transport_vehicle_configs(code)")
          .eq("is_active", true),
        supabase.from("material_synonyms").select("expression, material_keys, confidence, note").eq("is_active", true),
      ]);

      setPublicFlag(Boolean((flag?.value as { enabled?: boolean } | null)?.enabled));
      if (w?.value) setWeights({ ...DEFAULT_V2_WEIGHTS, ...(w.value as Partial<MatchWeights>) });

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
      });
      setVehicles(Object.values(map));

      if (syn?.length) {
        setSynonyms([
          ...DEFAULT_SYNONYMS,
          ...syn.map((s) => ({
            expression: s.expression as string,
            materialKeys: (s.material_keys ?? []) as SynonymEntry["materialKeys"],
            confidence: (s.confidence ?? "MOYENNE") as SynonymEntry["confidence"],
            note: (s.note ?? undefined) as string | undefined,
          })),
        ]);
      }
    })();
  }, [ready, isAdmin]);

  const interpretation = useMemo(() => interpretDescription(text, synonyms), [text, synonyms]);

  const offer: OfferInput = useMemo(() => ({
    id: "offre-simulee",
    label: text.slice(0, 60),
    quantityTonnes: interpretation.unit === "tonnes" || interpretation.unit === "tonnes_metriques" ? interpretation.quantity : null,
    origin: lat && lng ? { lat: Number(lat), lng: Number(lng) } : null,
    configCode: configCode || interpretation.truckConfigCode || null,
    maxSizeInches: interpretation.maxSizeInches,
    sizeSource: interpretation.maxSizeInches != null ? "DECLARE" : "INCONNU",
    materials: interpretation.materials.map((m) => ({ slug: m.key, label: m.label })),
  }), [text, interpretation, lat, lng, configCode]);

  const loadDemands = async (): Promise<DemandRow[]> => {
    const { data, error } = await supabase.rpc("matching_lab_candidates", {
      _lat: lat ? Number(lat) : null,
      _lng: lng ? Number(lng) : null,
      _limit: Math.min(500, Number(limit) || 100),
    });
    if (error) throw error;
    const rows = (data ?? []) as unknown as DemandRow[];
    setDemands(rows);
    return rows;
  };

  const logSimulation = async (direction: string, res: MatchV2Result[]) => {
    await supabase.from("matching_simulation_log").insert({
      algorithm_version: MATCHING_V2_VERSION,
      criteria: { direction, text, lat, lng, configCode, weights } as unknown as Record<string, unknown>,
      results: res.slice(0, 20).map((r) => ({
        demand_id: r.demandId, score: r.score, category: r.category,
        distance_km: r.distance.km, missing: r.missingData.length,
      })),
      result_count: res.length,
      top_score: res[0]?.score ?? null,
    });
  };

  const runOfferToDemands = async () => {
    setLoading(true);
    try {
      const rows = await loadDemands();
      const res = matchOfferToDemands(offer, rows, vehicles, weights);
      setResults(res);
      await logSimulation("offre_vers_demandes", res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation impossible");
    } finally { setLoading(false); }
  };

  const runDemandToOffers = async () => {
    setLoading(true);
    try {
      const rows = demands.length ? demands : await loadDemands();
      const target = rows.find((d) => d.id === selectedDemand) ?? rows[0];
      if (!target) { toast.error("Aucune demande chargée"); return; }
      setSelectedDemand(target.id);
      const res = matchDemandToOffers(target, [offer], vehicles, weights);
      setResults(res);
      await logSimulation("demande_vers_offres", res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation impossible");
    } finally { setLoading(false); }
  };

  const matrix = useMemo(
    () => (tab === "matrice" || tab === "opportunites" || tab === "analytics" ? buildMatchingMatrix([offer], demands, vehicles, weights) : []),
    [tab, offer, demands, vehicles, weights],
  );
  const summary = useMemo(() => matrixSummary(matrix), [matrix]);
  const opportunities = useMemo(() => hiddenOpportunities(matrix), [matrix]);
  const stats = useMemo(() => networkAnalytics([offer], demands, matrix), [offer, demands, matrix]);
  const sousExploitees = useMemo(() => underusedDemands(demands), [demands]);
  const sansMatch = useMemo(() => offersWithoutMatch([offer], matrix), [offer, matrix]);

  const bestCapacity = vehicles.find((v) => v.configCode === (offer.configCode ?? ""))?.capacityTonnes ?? null;
  const distribution = useMemo(
    () => (offer.quantityTonnes ? planDistributionOptions(offer.quantityTonnes, results, bestCapacity) : []),
    [offer.quantityTonnes, results, bestCapacity],
  );

  const saveWeights = async () => {
    const { error } = await supabase.from("matching_settings")
      .update({ value: weights as unknown as Record<string, number> })
      .eq("key", "matching_v2_weights");
    if (error) return toast.error(error.message);
    toast.success("Poids enregistrés");
  };

  if (!ready || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-center"><p className="text-muted-foreground">Accès réservé à l'administration.</p></div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" />Retour</Link></Button>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Brain className="h-6 w-6" />Matching Engine Lab</h1>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><TriangleAlert className="h-4 w-4" />Outil interne — simulation seulement.</p>
          <p className="text-muted-foreground">
            Aucune réservation, aucune modification de demande, de statut, de disponibilité ou de capacité, aucune communication.
            Matching public : <strong>{publicFlag ? "ACTIVÉ" : "inactif"}</strong> · algorithme <strong>{MATCHING_V2_VERSION}</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map(([key, label]) => (
            <Button key={key} size="sm" variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>{label}</Button>
          ))}
        </div>

        {(tab === "offre" || tab === "demande" || tab === "matrice") && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <Label>Description du matériau à sortir (texte libre)</Label>
              <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Compris : {interpretation.materials.map((m) => m.label).join(", ") || "—"}
                {interpretation.quantity ? ` · ${interpretation.quantity} ${interpretation.unit ?? ""}` : ""}
                {interpretation.maxSizeInches ? ` · max ${interpretation.maxSizeInches} po` : " · grosseur inconnue"}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div><Label>Latitude</Label><Input value={lat} onChange={(e) => setLat(e.target.value)} /></div>
              <div><Label>Longitude</Label><Input value={lng} onChange={(e) => setLng(e.target.value)} /></div>
              <div>
                <Label>Camion (optionnel)</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={configCode} onChange={(e) => setConfigCode(e.target.value)}>
                  <option value="">Tester toutes les configurations</option>
                  {VEHICLE_CONFIG_CODES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div><Label>Demandes analysées</Label><Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={runOfferToDemands} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Offre → demandes
              </Button>
              <Button variant="outline" onClick={runDemandToOffers} disabled={loading}>Demande → offres</Button>
            </div>
            {tab === "demande" && demands.length > 0 && (
              <div>
                <Label>Demande de remblai analysée</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedDemand} onChange={(e) => setSelectedDemand(e.target.value)}>
                  {demands.map((d) => (
                    <option key={d.id} value={d.id}>{d.dompe_number || d.submission_number || d.id} — {d.city ?? "ville inconnue"}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {(tab === "offre" || tab === "demande") && (
          <div className="space-y-3">
            {distribution.length > 0 && distribution.some((o) => o.lines.length > 0) && (
              <div className="rounded-lg border border-border p-4 text-sm">
                <h2 className="mb-2 font-semibold">Meilleure répartition (simulation)</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  {distribution.map((o) => (
                    <div key={o.key} className="rounded-md border border-border p-3">
                      <p className="font-medium">Option {o.key} — {o.sites} site(s)</p>
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {o.lines.map((l) => (
                          <li key={l.demandId}>{l.label} — {l.tonnes.toFixed(0)} t{l.trips ? ` · ${l.trips} voyage(s)` : ""}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Réparti {o.allocated.toFixed(0)} t · reste {o.unallocated.toFixed(0)} t
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Aucune réservation effectuée.</p>
              </div>
            )}

            {results.map((r) => (
              <div key={`${r.offerId}-${r.demandId}`} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">
                    {r.demand.dompe_number || r.demand.submission_number || r.demandId}
                    {r.demand.city ? ` — ${r.demand.city}` : ""}
                  </h3>
                  <span className="text-sm font-medium">{categoryLabel(r.category)}</span>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {r.explanations.map((e, i) => <li key={i}>{e.symbol} {e.text}</li>)}
                </ul>
                {r.distance.cycleKm != null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aller {r.distance.allerKm?.toFixed(1)} km · retour {r.distance.retourKm?.toFixed(1)} km · cycle {r.distance.cycleKm.toFixed(1)} km
                    {r.distance.cycleMinutes ? ` ≈ ${r.distance.cycleMinutes} min (estimation)` : ""}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Camions testés : {r.truckOptions.map((o) => `${o.configCode.replace(/_/g, " ")}${o.trips ? ` (${o.trips} v.)` : ""}${o.compatible ? "" : " ✗"}`).join(" · ")}
                </p>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Score interne {r.score}</summary>
                  <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(r.subScores, null, 1)}</pre>
                </details>
                {r.missingData.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    À confirmer : {r.missingData.join(" · ")}
                    {recommendedQuestion(results, r.demandId) ? ` — Question recommandée : « ${recommendedQuestion(results, r.demandId)?.question} »` : ""}
                  </p>
                )}
              </div>
            ))}
            {!loading && results.length === 0 && <p className="text-sm text-muted-foreground">Aucune simulation lancée.</p>}
          </div>
        )}

        {tab === "matrice" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              {(Object.keys(summary) as (keyof typeof summary)[]).map((k) => (
                <span key={k} className="rounded-full border border-border px-3 py-1">{categoryLabel(k)} : {summary[k]}</span>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr><th className="p-2">Demande de remblai</th><th className="p-2">Ville</th><th className="p-2">Catégorie</th><th className="p-2">Distance</th></tr>
                </thead>
                <tbody>
                  {matrix.slice(0, 200).map((c) => (
                    <tr key={`${c.offerId}-${c.demandId}`} className="border-t border-border">
                      <td className="p-2">{c.result.demand.dompe_number || c.demandId.slice(0, 8)}</td>
                      <td className="p-2">{c.result.demand.city ?? "—"}</td>
                      <td className="p-2">{categoryLabel(c.category)}</td>
                      <td className="p-2">{c.result.distance.km != null ? `${c.result.distance.km.toFixed(1)} km` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {matrix.length === 0 && <p className="text-sm text-muted-foreground">Lancez d'abord une analyse pour charger les demandes.</p>}
          </div>
        )}

        {tab === "opportunites" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <h2 className="font-semibold">Opportunités à valider</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {opportunities.map((o) => (
                  <li key={o.missingField}>
                    {o.blockedMatches} correspondance(s) limitée(s) par : <strong>{o.missingField}</strong> — question recommandée : « {o.question} » (valeur estimée {o.value})
                  </li>
                ))}
                {opportunities.length === 0 && <li className="text-muted-foreground">Aucune information manquante identifiée.</li>}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Aucune communication n'est envoyée : affichage administrateur seulement.</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <h2 className="font-semibold">Demandes sous-exploitées</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {sousExploitees.slice(0, 50).map((u) => (
                  <li key={u.demandId}>{u.label} — potentiel d'élargissement : {u.potentialMaterials.join(", ")}</li>
                ))}
                {sousExploitees.length === 0 && <li className="text-muted-foreground">Aucune demande sous-exploitée détectée.</li>}
              </ul>
            </div>
            <div className="rounded-lg border border-border p-4">
              <h2 className="font-semibold">Matériaux sans match</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {sansMatch.map((o) => <li key={o.offerId}>{o.label} — {o.reason}{o.blockedBy.length ? ` (${o.blockedBy.join(", ")})` : ""}</li>)}
                {sansMatch.length === 0 && <li className="text-muted-foreground">L'offre simulée trouve au moins une piste.</li>}
              </ul>
            </div>
          </div>
        )}

        {tab === "analytics" && (
          <div className="grid gap-3 rounded-lg border border-border p-4 text-sm md:grid-cols-2">
            <p>Offres analysées : <strong>{stats.offersCount}</strong></p>
            <p>Demandes analysées : <strong>{stats.demandsCount}</strong></p>
            <p>Tonnes disponibles (estimation) : <strong>{stats.tonnesAvailable?.toFixed(0) ?? "—"}</strong></p>
            <p>Tonnes recherchées (estimation) : <strong>{stats.tonnesSought?.toFixed(0) ?? "—"}</strong></p>
            <p>Matières les plus offertes : {stats.topOfferedMaterials.map((m) => `${m.label} (${m.count})`).join(", ") || "—"}</p>
            <p>Matières les plus recherchées : {stats.topSoughtMaterials.map((m) => `${m.label} (${m.count})`).join(", ") || "—"}</p>
            <p>Régions en manque : {stats.shortageRegions.map((r) => `${r.region} (${r.demands})`).join(", ") || "—"}</p>
            <p>Correspondances potentielles : <strong>{stats.potentialMatches}</strong></p>
            <p>Demandes sous-utilisées : <strong>{stats.underusedDemands}</strong></p>
            <p>Offres sans solution : <strong>{stats.offersWithoutSolution}</strong></p>
            <p className="md:col-span-2 text-xs text-muted-foreground">{stats.disclaimer}</p>
          </div>
        )}

        {tab === "carte" && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapIcon className="h-4 w-4" />Offre simulée et demandes analysées.</p>
            <div className="h-[420px] overflow-hidden rounded-lg border border-border">
              <PreviewResultsMap
                origin={offer.origin ?? null}
                points={demands
                  .filter((d) => d.latitude != null && d.longitude != null)
                  .map((d) => ({
                    id: d.id,
                    lat: Number(d.latitude),
                    lng: Number(d.longitude),
                    title: d.dompe_number || d.city || "Demande de remblai",
                    km: d.distance_km ?? null,
                  }))}
              />
            </div>
          </div>
        )}

        {tab === "poids" && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="font-semibold">Poids configurables du moteur</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(weights) as (keyof MatchWeights)[]).map((k) => (
                <div key={k}>
                  <Label>{k.replace(/_/g, " ")}</Label>
                  <Input type="number" value={weights[k]}
                    onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))} />
                </div>
              ))}
            </div>
            <Button onClick={saveWeights}>Enregistrer les poids</Button>
            <p className="text-xs text-muted-foreground">
              Priorité du moteur : incompatibilités bloquantes, matériaux, disponibilité, accessibilité, distance, capacité, confiance des données.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
