// ============================================================
// ASSISTANT IA MATÉRIAUX — INTERNE (Matching Lab)
// ------------------------------------------------------------
// Parcours obligatoire :
//   TEXTE LIBRE → INTERPRÉTATION → CONFIRMATION → DONNÉES
//   STRUCTURÉES → MATCHING (lecture / simulation seulement).
// Aucune écriture métier, aucune activation publique.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Loader2, Mic, Search, Sparkles, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DEFAULT_SYNONYMS,
  interpretDescription,
  toStructuredData,
  estimateTonnesFromTrips,
  publicMatchLabel,
  type Interpretation,
  type MaterialKey,
  type SynonymEntry,
} from "@/lib/matching/interpreter";
import {
  rankCandidates,
  MATCHING_ALGORITHM_VERSION,
  type CandidateRow,
  type MatchResult,
  type QuantityUnit,
  type VehicleProfileLite,
} from "@/lib/matching/engine";

interface Props {
  vehicles: Record<string, VehicleProfileLite>;
  /** Mode « interpréteur » : analyse seulement, sans écran de confirmation client. */
  inspectorMode?: boolean;
}

const PLACEHOLDER =
  "Exemple : J'ai environ 20 voyages de semi de terre sablonneuse avec un peu de glaise et des petites roches.";

export default function MaterialAssistant({ vehicles, inspectorMode = false }: Props) {
  const [text, setText] = useState("");
  const [synonyms, setSynonyms] = useState<SynonymEntry[]>(DEFAULT_SYNONYMS);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState({ date: "", frequency: "", notes: "", lat: "", lng: "" });
  const [matching, setMatching] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);

  // Dictionnaire administrable : complète (ne remplace pas) les expressions par défaut.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("material_synonyms")
        .select("expression, material_keys, confidence, notes")
        .eq("is_active", true);
      if (!data?.length) return;
      const extra: SynonymEntry[] = data.map((r) => ({
        expression: r.expression,
        materialKeys: (r.material_keys ?? []) as MaterialKey[],
        confidence: (String(r.confidence).toUpperCase() === "ELEVEE" ? "ELEVEE"
          : String(r.confidence).toUpperCase() === "FAIBLE" ? "FAIBLE" : "MOYENNE"),
        note: r.notes ?? undefined,
      })).filter((e) => e.materialKeys.length > 0);
      setSynonyms([...DEFAULT_SYNONYMS, ...extra]);
    })();
  }, []);

  const vehicle = interpretation?.truckConfigCode
    ? vehicles[interpretation.truckConfigCode] ?? { configCode: interpretation.truckConfigCode }
    : null;

  const tripEstimate = useMemo(
    () => estimateTonnesFromTrips(interpretation?.trips ?? null, vehicle?.capacityTonnes ?? null),
    [interpretation?.trips, vehicle?.capacityTonnes],
  );

  const analyze = () => {
    if (!text.trim()) return;
    setResults(null);
    setAnswers({});
    setEditing(false);
    setInterpretation(interpretDescription(text, synonyms));
  };

  const runMatching = async () => {
    if (!interpretation) return;
    setMatching(true);
    try {
      const structured = toStructuredData(interpretation, answers);
      const { data, error } = await supabase.rpc("matching_lab_candidates", {
        _lat: details.lat ? Number(details.lat) : null,
        _lng: details.lng ? Number(details.lng) : null,
        _limit: 200,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as CandidateRow[];
      const label = structured.normalized_structured_data.material_labels.join(" ") ||
        interpretation.originalText;
      const quantity = interpretation.quantity ?? tripEstimate.tonnes;
      const unit: QuantityUnit = interpretation.quantity ? (interpretation.unit ?? "tonnes") : "tonnes";
      const ranked = rankCandidates(
        { materialLabel: label, quantity, unit },
        rows,
        vehicle,
      );
      setResults(ranked);
      await supabase.from("matching_simulation_log").insert({
        algorithm_version: `${MATCHING_ALGORITHM_VERSION}+${interpretation.version}`,
        criteria: { assistant: true, structured: structured.normalized_structured_data },
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
      setMatching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-4">
        <h2 className="text-xl font-bold">Décrivez ce que vous avez à transporter</h2>
        <p className="text-sm text-muted-foreground">Écrivez comme vous parleriez à quelqu'un.</p>
        <Textarea
          className="mt-3 min-h-28"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={analyze} disabled={!text.trim()}>
            <Sparkles className="mr-2 h-4 w-4" />Analyser
          </Button>
          {/* Architecture prête pour la dictée vocale (désactivée pour l'instant). */}
          <Button variant="outline" disabled title="Dictée vocale à venir">
            <Mic className="mr-2 h-4 w-4" />Dicter
          </Button>
        </div>
      </div>

      {interpretation && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="text-lg font-semibold">Voici ce que j'ai compris</h3>

          <div className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Matériaux : </span>
              {interpretation.materials.length
                ? interpretation.materials.map((m) => (
                    <Badge key={m.key} variant="secondary" className="mr-1">
                      {m.label}
                      {inspectorMode ? ` · ${m.confidence.toLowerCase()}` : ""}
                    </Badge>
                  ))
                : "non précisé"}
            </div>
            <div>
              <span className="text-muted-foreground">Type : </span>
              {interpretation.isMixture ? "mélange" : "matériau unique ou non précisé"}
            </div>
            <div>
              <span className="text-muted-foreground">Quantité : </span>
              {interpretation.quantity
                ? `${interpretation.quantity} ${interpretation.unit ?? "tonnes"}${interpretation.quantityIsApproximate ? " (approximatif)" : ""}`
                : tripEstimate.tonnes
                  ? `≈ ${tripEstimate.tonnes.toFixed(0)} tonnes (estimation)`
                  : "non précisée"}
            </div>
            <div>
              <span className="text-muted-foreground">Voyages : </span>
              {interpretation.trips ?? "non précisé"}
            </div>
            <div>
              <span className="text-muted-foreground">Camion : </span>
              {interpretation.truckLabel ?? "Non précisé"}
            </div>
            <div>
              <span className="text-muted-foreground">Grosseur : </span>
              {interpretation.maxSizeLabel ?? "non précisée"}
            </div>
            {interpretation.location && (
              <div><span className="text-muted-foreground">Endroit : </span>{interpretation.location}</div>
            )}
            {interpretation.dates.length > 0 && (
              <div><span className="text-muted-foreground">Dates : </span>{interpretation.dates.join(", ")}</div>
            )}
          </div>

          {interpretation.declarations.map((d) => (
            <p key={d} className="rounded bg-muted p-2 text-xs">
              Description utilisateur : « {interpretation.originalText} » — {d}.
            </p>
          ))}

          {interpretation.trips != null && !vehicle?.capacityTonnes && (
            <p className="text-xs text-muted-foreground">{tripEstimate.note}</p>
          )}

          {interpretation.questions.length > 0 && (
            <div className="space-y-2 rounded-md border border-border p-3">
              {interpretation.questions.map((q) => (
                <div key={q.id}>
                  <p className="text-sm font-medium">{q.question}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <Button
                        key={o}
                        size="sm"
                        variant={answers[q.id] === o ? "default" : "outline"}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                      >
                        {o}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {editing && (
            <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-3">
              <div>
                <Label>Quantité</Label>
                <Input
                  value={interpretation.quantity ?? ""}
                  inputMode="decimal"
                  onChange={(e) =>
                    setInterpretation({ ...interpretation, quantity: e.target.value ? Number(e.target.value) : null, unit: interpretation.unit ?? "tonnes" })
                  }
                />
              </div>
              <div>
                <Label>Voyages</Label>
                <Input
                  value={interpretation.trips ?? ""}
                  inputMode="numeric"
                  onChange={(e) => setInterpretation({ ...interpretation, trips: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <Label>Camion</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={interpretation.truckConfigCode ?? ""}
                  onChange={(e) =>
                    setInterpretation({
                      ...interpretation,
                      truckConfigCode: e.target.value || null,
                      truckLabel: e.target.value ? e.target.value.replace(/_/g, " ") : null,
                    })
                  }
                >
                  <option value="">je ne sais pas</option>
                  {Object.keys(vehicles).map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runMatching} disabled={matching}>
              {matching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              C'est bon
            </Button>
            <Button variant="outline" onClick={() => setEditing((v) => !v)}>
              <Wand2 className="mr-2 h-4 w-4" />Corriger
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDetails((v) => !v)}>
              Ajouter des détails
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowTechnical((v) => !v)}
            >
              Voir les détails techniques
            </button>
          </div>

          {showDetails && (
            <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-3">
              <div><Label>Date souhaitée</Label><Input type="date" value={details.date} onChange={(e) => setDetails({ ...details, date: e.target.value })} /></div>
              <div><Label>Fréquence</Label><Input value={details.frequency} onChange={(e) => setDetails({ ...details, frequency: e.target.value })} placeholder="ex. 5 voyages/jour" /></div>
              <div><Label>Notes</Label><Input value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} /></div>
              <div><Label>Latitude</Label><Input value={details.lat} onChange={(e) => setDetails({ ...details, lat: e.target.value })} placeholder="46.81" /></div>
              <div><Label>Longitude</Label><Input value={details.lng} onChange={(e) => setDetails({ ...details, lng: e.target.value })} placeholder="-71.21" /></div>
            </div>
          )}

          {showTechnical && (
            <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(toStructuredData(interpretation, answers), null, 2)}
            </pre>
          )}
        </div>
      )}

      {results && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Endroits proposés</h3>
          {results.length === 0 && <p className="text-sm text-muted-foreground">Aucun endroit à proposer pour l'instant.</p>}
          {results.slice(0, 10).map((r) => (
            <div key={r.candidate.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{publicMatchLabel(r.score, r.confidence)}</span>
                <span className="text-sm text-muted-foreground">
                  {r.distance.km != null ? `${r.distance.km.toFixed(1)} km` : "distance à confirmer"}
                </span>
              </div>
              <p className="text-sm">{r.candidate.city ?? "Endroit à confirmer"}</p>
              <ul className="mt-2 space-y-0.5 text-sm">
                <li>{r.material.compatibility === "COMPATIBLE_CONFIRME" ? "✓" : "⚠"} {r.material.reason}</li>
                <li>{r.availability.state === "OUI" ? "✓" : "⚠"} {r.availability.label}</li>
                <li>{r.access.verdict === "ACCESSIBLE" ? "✓" : "⚠"} Accès : {r.access.verdict.replace(/_/g, " ").toLowerCase()}</li>
              </ul>
              {r.quantity.trips != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.quantity.trips} voyage(s) estimé(s){r.quantity.isEstimate ? " — estimation" : ""}
                </p>
              )}
              {inspectorMode && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Score interne {r.score} · confiance {r.confidence.toLowerCase()} ·
                  {" "}manquant : {r.missingData.join(", ") || "aucun"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
