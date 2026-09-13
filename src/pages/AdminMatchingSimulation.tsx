// ============================================================
// LOT 11 — MATCHING V2 : SIMULATION (INTERNE / ADMIN, LECTURE SEULE)
// ------------------------------------------------------------
// Aucune écriture métier : aucune demande créée/modifiée, aucun statut,
// aucune disponibilité, aucune affectation, aucune communication.
// Le matching public reste inactif (material_matching_v2 = false).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Radar, TriangleAlert, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  runMatchingPipeline,
  simulateSplit,
  MATCHING_PIPELINE_VERSION,
  type CandidateMatch,
  type PipelineCandidate,
  type PipelineRun,
} from "@/lib/matching/pipeline";
import { VEHICLE_CONFIG_CODES } from "@/lib/transport/capacity";

const verdictLabel = {
  COMPATIBLE: "Compatible",
  POSSIBLE: "Possible — à confirmer",
  INCOMPATIBLE: "Incompatible",
} as const;

function ResultCard({ r }: { r: CandidateMatch }) {
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{r.reference ?? r.requestId.slice(0, 8)}</span>
        {r.city && <span className="text-muted-foreground">{r.city}</span>}
        <Badge variant={r.compatibility === "COMPATIBLE" ? "default" : r.compatibility === "POSSIBLE" ? "secondary" : "outline"}>
          {verdictLabel[r.compatibility]}
        </Badge>
        <span className="ml-auto font-mono">{r.score}</span>
      </div>
      <p className="mt-1 text-muted-foreground">
        {r.distanceKm != null
          ? `${r.distanceKm} km ${r.distanceKind === "ROUTIERE" ? "(routier)" : "(approximatif)"}`
          : "Distance inconnue"}
        {" · "}
        {r.capacityMatch === "PARTIEL" ? `match partiel ${r.usableTrips} voyage(s)` : r.capacityMatch === "TOTAL" ? "capacité suffisante" : "capacité inconnue"}
        {r.freshness === "A_REVALIDER" ? " · disponibilité à revalider" : " · disponibilité confirmée"}
      </p>
      {r.positiveReasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">{r.positiveReasons.map((x, i) => <li key={i}>✓ {x}</li>)}</ul>
      )}
      {r.needsConfirmation.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">{r.needsConfirmation.map((x, i) => <li key={i}>? {x}</li>)}</ul>
      )}
      {r.warnings.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">{r.warnings.map((x, i) => <li key={i}>⚠ {x}</li>)}</ul>
      )}
      {r.blockingReasons.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-destructive">{r.blockingReasons.map((x, i) => <li key={i}>✕ {x}</li>)}</ul>
      )}
    </div>
  );
}

export default function AdminMatchingSimulation() {
  const { isReady } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();

  const [text, setText] = useState("");
  const [trips, setTrips] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"tonnes" | "verges3" | "m3" | "voyages">("tonnes");
  const [configCode, setConfigCode] = useState<string>("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [recentOnly, setRecentOnly] = useState(false);
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [publicFlag, setPublicFlag] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    supabase.from("matching_settings").select("value").eq("key", "matching_v2_enabled_public").maybeSingle()
      .then(({ data }) => setPublicFlag(Boolean((data?.value as { enabled?: boolean } | null)?.enabled)));
  }, [isReady, isAdmin]);

  const analyser = async () => {
    if (!text.trim()) { toast.error("Décrivez le chargement à évacuer."); return; }
    setLoading(true);
    try {
      // Filtrage/tri géographique côté serveur, puis évaluation locale.
      const { data, error } = await supabase.rpc("matching_lab_candidates", {
        _lat: lat ? Number(lat) : null,
        _lng: lng ? Number(lng) : null,
        _limit: 500,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as PipelineCandidate[];
      setRun(runMatchingPipeline(
        {
          text,
          trips: trips ? Number(trips) : null,
          quantity: quantity ? Number(quantity) : null,
          unit,
          configCode: configCode || null,
          origin: lat && lng ? { lat: Number(lat), lng: Number(lng) } : null,
        },
        rows,
        { filters: { maxDistanceKm: maxKm ? Number(maxKm) : null, requireRecentConfirmation: recentOnly } },
      ));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation impossible");
    } finally {
      setLoading(false);
    }
  };

  const split = useMemo(
    () => (run ? simulateSplit(run, run.load.trips) : null),
    [run],
  );

  if (!isReady || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-center"><p className="text-muted-foreground">Accès réservé à l'administration.</p></div>;
  }

  const best = run?.results.filter((r) => r.compatibility === "COMPATIBLE") ?? [];
  const possible = run?.results.filter((r) => r.compatibility === "POSSIBLE") ?? [];
  const bad = run?.results.filter((r) => r.compatibility === "INCOMPATIBLE") ?? [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" />Retour</Link></Button>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Radar className="h-6 w-6" />Matching V2 — simulation</h1>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><TriangleAlert className="h-4 w-4" />Outil interne — lecture seulement.</p>
          <p className="mt-1 text-muted-foreground">
            Aucune demande créée ou modifiée, aucune affectation, aucune communication. Moteur {MATCHING_PIPELINE_VERSION}.
            {publicFlag === false && " Matching public : inactif."}
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <Label htmlFor="desc">Matériau à évacuer — décrivez-le simplement</Label>
            <Textarea id="desc" rows={3} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="20 voyages de semi 2 essieux avec du sable terreux mélangé avec du tuff de moins de 18 pouces" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div><Label htmlFor="trips">Voyages</Label><Input id="trips" inputMode="numeric" value={trips} onChange={(e) => setTrips(e.target.value)} /></div>
            <div><Label htmlFor="qty">Quantité</Label><Input id="qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div>
              <Label htmlFor="unit">Unité</Label>
              <select id="unit" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                {["tonnes", "verges3", "m3", "voyages"].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="camion">Camion</Label>
              <select id="camion" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={configCode} onChange={(e) => setConfigCode(e.target.value)}>
                <option value="">non précisé</option>
                {VEHICLE_CONFIG_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><Label htmlFor="lat">Latitude</Label><Input id="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
            <div><Label htmlFor="lng">Longitude</Label><Input id="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></div>
            <div><Label htmlFor="rayon">Rayon max (km)</Label><Input id="rayon" inputMode="numeric" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} /></div>
            <div className="flex items-end gap-2">
              <Switch id="recent" checked={recentOnly} onCheckedChange={setRecentOnly} />
              <Label htmlFor="recent" className="text-xs">Confirmées récemment seulement</Label>
            </div>
          </div>
          <Button onClick={analyser} disabled={loading} className="w-full md:w-auto">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Analyser
          </Button>
        </div>

        {run && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              {run.evaluated} demande(s) évaluée(s) · {run.excluded} exclue(s) avant compatibilité ·
              {" "}{run.summary.compatible} compatibles · {run.summary.possible} possibles · {run.summary.incompatible} incompatibles
            </p>

            {split && split.lines.length > 0 && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">Répartition simulée (aucune affectation réelle)</p>
                <ul className="mt-1 text-muted-foreground">
                  {split.lines.map((l) => <li key={l.requestId}>{l.reference ?? l.requestId.slice(0, 8)} : {l.trips} voyage(s)</li>)}
                  {split.remaining ? <li>Reste à placer : {split.remaining} voyage(s)</li> : null}
                </ul>
              </div>
            )}

            <section className="space-y-2">
              <h2 className="font-semibold">Meilleurs matchs ({best.length})</h2>
              {best.length ? best.slice(0, 25).map((r) => <ResultCard key={r.requestId} r={r} />)
                : <p className="text-sm text-muted-foreground">Aucun match certain.</p>}
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold">Possibles — à confirmer ({possible.length})</h2>
              {possible.slice(0, 25).map((r) => <ResultCard key={r.requestId} r={r} />)}
            </section>

            <section className="space-y-2">
              <button type="button" className="flex items-center gap-1 font-semibold"
                onClick={() => setShowIncompatible((v) => !v)}>
                <ChevronDown className={`h-4 w-4 transition-transform ${showIncompatible ? "" : "-rotate-90"}`} />
                Incompatibles ({bad.length})
              </button>
              {showIncompatible && bad.slice(0, 50).map((r) => <ResultCard key={r.requestId} r={r} />)}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
