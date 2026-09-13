// ============================================================
// APERÇU INTERNE — « J'AI DU MATÉRIEL À SORTIR » (LOT 6)
// ------------------------------------------------------------
// Chemin d'aperçu réservé à l'administration + drapeau
// matching_settings.public_matching_preview.
// Le formulaire public /remblai reste inchangé, le matching public
// et la taxonomie publique restent INACTIFS.
// Aucune réservation, aucune communication, aucune écriture métier :
// seuls le journal de simulation et les événements anonymes sont écrits.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Camera, Check, Clock, Loader2, MapPin, Map as MapIcon,
  List, Pencil, Search, Sparkles, Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import PreviewResultsMap from "@/components/parcours/PreviewResultsMap";
import {
  interpretDescription, toStructuredData, estimateTonnesFromTrips,
  DEFAULT_SYNONYMS, type Interpretation, type SynonymEntry, type MaterialKey, type FieldConfidence,
} from "@/lib/matching/interpreter";
import {
  rankCandidates, planAllocation, computeQuantity, MATCHING_ALGORITHM_VERSION,
  type CandidateRow, type MatchResult, type QuantityUnit, type VehicleProfileLite,
} from "@/lib/matching/engine";
import { VEHICLE_CONFIG_CODES, kgToTonnes } from "@/lib/transport/capacity";
import {
  PARCOURS_EVENTS, PARCOURS_STEPS, TRUCK_OPTIONS, anonymizePayload, clearDraft,
  estimatedMinutes, groupResults, humanizeMissing, loadDraft, saveDraft, sessionKey,
  simpleMatchLabel, tripsSentence, truckLabelFor, type ParcoursStep, type ResultGroupKey,
} from "@/lib/preview/parcours";

const PLACEHOLDER =
  "Ex. : J'ai environ 20 voyages de semi de terre sablonneuse avec un peu de glaise et de petites roches.";

export default function PreviewParcoursDompe() {
  const { isReady } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();

  const [flagOn, setFlagOn] = useState<boolean | null>(null);
  const [step, setStep] = useState<ParcoursStep>(1);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [description, setDescription] = useState("");
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [synonyms, setSynonyms] = useState<SynonymEntry[]>(DEFAULT_SYNONYMS);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [truckCode, setTruckCode] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [extra, setExtra] = useState({ chantier: "", date: "", trips: "", granulometry: "", notes: "", access: "" });
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [vehicles, setVehicles] = useState<Record<string, VehicleProfileLite>>({});
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<"liste" | "carte">("liste");
  const [selected, setSelected] = useState<MatchResult | null>(null);
  const [multi, setMulti] = useState(false);
  const session = useRef(sessionKey());

  // ---------- analytique interne anonyme ----------
  const track = useCallback(async (event: string, payload: Record<string, unknown> = {}) => {
    try {
      await supabase.from("parcours_preview_events").insert({
        session_key: session.current,
        event_name: event,
        step: String(step),
        payload: JSON.parse(JSON.stringify(anonymizePayload(payload))),
      });
    } catch {
      /* la mesure ne doit jamais bloquer le parcours */
    }
  }, [step]);

  // ---------- chargement initial ----------
  useEffect(() => {
    if (!isReady || !isAdmin) return;
    (async () => {
      const { data: flag } = await supabase
        .from("matching_settings").select("value").eq("key", "public_matching_preview").maybeSingle();
      setFlagOn(Boolean((flag?.value as { enabled?: boolean } | null)?.enabled));

      const { data: syn } = await supabase
        .from("material_synonyms").select("expression, material_keys, confidence, notes").eq("is_active", true);
      if (syn?.length) {
        setSynonyms([
          ...DEFAULT_SYNONYMS,
          ...syn.map((r) => ({
            expression: r.expression,
            materialKeys: (r.material_keys ?? []) as MaterialKey[],
            confidence: (String(r.confidence).toUpperCase() === "ELEVEE" ? "ELEVEE"
              : String(r.confidence).toUpperCase() === "FAIBLE" ? "FAIBLE" : "MOYENNE") as FieldConfidence,
            note: r.notes ?? undefined,
          })).filter((e) => e.materialKeys.length > 0),
        ]);
      }

      const { data: caps } = await supabase
        .from("transport_vehicle_capacities")
        .select("config_id, operational_capacity_kg, payload_kg, transport_vehicle_configs(code)")
        .eq("is_active", true);
      const map: Record<string, VehicleProfileLite> = {};
      for (const code of VEHICLE_CONFIG_CODES) map[code] = { configCode: code };
      (caps ?? []).forEach((c) => {
        const code = (c as { transport_vehicle_configs?: { code?: string } }).transport_vehicle_configs?.code;
        if (!code || !map[code]) return;
        map[code].capacityTonnes = kgToTonnes(c.operational_capacity_kg ?? c.payload_kg ?? null);
      });
      setVehicles(map);
    })();
  }, [isReady, isAdmin]);

  // ---------- brouillon temporaire ----------
  useEffect(() => {
    const d = loadDraft();
    if (!d) return;
    setAddress(d.address);
    setCoords(d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null);
    setDescription(d.description);
    setTruckCode(d.truckCode);
    setAnswers(d.answers ?? {});
    setDetailed(Boolean(d.detailed));
  }, []);

  useEffect(() => {
    saveDraft({
      step, address, lat: coords?.lat ?? null, lng: coords?.lng ?? null,
      description, truckCode, answers, detailed,
    });
  }, [step, address, coords, description, truckCode, answers, detailed]);

  const vehicle = truckCode ? vehicles[truckCode] ?? { configCode: truckCode } : null;

  const tripEstimate = useMemo(
    () => estimateTonnesFromTrips(interpretation?.trips ?? null, vehicle?.capacityTonnes ?? null),
    [interpretation?.trips, vehicle?.capacityTonnes],
  );

  const quantityInfo = useMemo(() => computeQuantity({
    quantity: interpretation?.quantity ?? tripEstimate.tonnes ?? null,
    unit: (interpretation?.quantity ? interpretation.unit ?? "tonnes" : "tonnes") as QuantityUnit,
    truckCapacityTonnes: vehicle?.capacityTonnes ?? null,
  }), [interpretation?.quantity, interpretation?.unit, tripEstimate.tonnes, vehicle?.capacityTonnes]);

  const analyze = () => {
    if (!description.trim()) return;
    const it = interpretDescription(description, synonyms);
    setInterpretation(it);
    if (it.truckConfigCode && !truckCode) setTruckCode(it.truckConfigCode);
    setStep(3);
    void track(PARCOURS_EVENTS.aiAnalyse, {
      materials_count: it.materials.length,
      has_quantity: it.quantity != null,
      has_trips: it.trips != null,
      truck_detected: Boolean(it.truckConfigCode),
      questions: it.questions.length,
    });
  };

  const runSearch = async () => {
    if (!interpretation) return;
    setSearching(true);
    void track(PARCOURS_EVENTS.search, { has_origin: Boolean(coords), truck_known: Boolean(truckCode) });
    try {
      const structured = toStructuredData(interpretation, answers);
      const { data, error } = await supabase.rpc("matching_lab_candidates", {
        _lat: coords?.lat ?? null, _lng: coords?.lng ?? null, _limit: 200,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as CandidateRow[];
      const label = structured.normalized_structured_data.material_labels.join(" ") || interpretation.originalText;
      const ranked = rankCandidates(
        {
          materialLabel: label,
          materialSlug: label,
          quantity: interpretation.quantity ?? tripEstimate.tonnes,
          unit: (interpretation.quantity ? interpretation.unit ?? "tonnes" : "tonnes") as QuantityUnit,
          origin: coords,
          configCode: truckCode,
          truckCapacityTonnes: vehicle?.capacityTonnes ?? null,
        },
        rows,
        vehicle,
      );
      setResults(ranked);
      setStep(4);
      await supabase.from("matching_simulation_log").insert({
        algorithm_version: `${MATCHING_ALGORITHM_VERSION}+preview`,
        criteria: { preview: true, structured: structured.normalized_structured_data },
        results: ranked.slice(0, 20).map((r) => ({
          id: r.candidate.id, score: r.score, confidence: r.confidence,
          compatibility: r.material.compatibility, distance_km: r.distance.km,
        })),
        result_count: ranked.length,
        top_score: ranked[0]?.score ?? null,
      });
      void track(PARCOURS_EVENTS.results, { count: ranked.length, top_score: ranked[0]?.score ?? null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recherche impossible");
    } finally {
      setSearching(false);
    }
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Session requise pour déposer une photo.");
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const path = `${uid}/${session.current}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("parcours-preview-photos").upload(path, file);
        if (error) throw error;
        added.push(path);
      }
      setPhotos((p) => [...p, ...added]);
      toast.success("Photos ajoutées (aide visuelle seulement).");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléversement impossible");
    } finally {
      setUploading(false);
    }
  };

  const groups = useMemo(() => (results ? groupResults(results) : null), [results]);

  const allocation = useMemo(() => {
    if (!multi || !results || !quantityInfo.tonnes) return null;
    return planAllocation(quantityInfo.tonnes, results, vehicle?.capacityTonnes ?? null);
  }, [multi, results, quantityInfo.tonnes, vehicle?.capacityTonnes]);

  const mapPoints = useMemo(
    () => (results ?? [])
      .filter((r) => r.candidate.latitude != null && r.candidate.longitude != null)
      .slice(0, 40)
      .map((r) => ({
        id: r.candidate.id,
        lat: Number(r.candidate.latitude),
        lng: Number(r.candidate.longitude),
        title: r.candidate.city ?? "Endroit à confirmer",
        km: r.distance.km,
      })),
    [results],
  );

  if (!isReady || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">Aperçu réservé à l'administration.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto w-full max-w-2xl space-y-5 p-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" />Retour</Link>
          </Button>
          <Badge variant="secondary">Aperçu interne{flagOn === false ? " (drapeau inactif)" : ""}</Badge>
        </div>

        <header className="space-y-1">
          <h1 className="text-2xl font-extrabold leading-tight">J'ai du matériel à sortir</h1>
          <p className="text-sm text-muted-foreground">
            Simulation seulement : aucune réservation, aucun envoi, aucune modification.
          </p>
        </header>

        {/* Barre de progression */}
        <ol className="flex gap-1 text-[11px] font-medium">
          {PARCOURS_STEPS.map((label, i) => (
            <li
              key={label}
              className={`flex-1 rounded-full px-2 py-1 text-center ${
                step >= (i + 1) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1} — {label}
            </li>
          ))}
        </ol>

        {/* ÉTAPE 1 — LIEU */}
        {step === 1 && (
          <section className="space-y-4 rounded-xl border border-border p-4">
            <h2 className="text-xl font-bold">Où se trouve le matériel ?</h2>
            <GooglePlaceAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={(d) => {
                setAddress(d.formattedAddress);
                if (d.lat != null && d.lng != null) setCoords({ lat: d.lat, lng: d.lng });
              }}
              placeholder="Adresse, ville ou code postal"
            />
            {coords && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" />Adresse de départ enregistrée
              </p>
            )}
            <Button
              className="h-12 w-full text-base"
              disabled={!address.trim()}
              onClick={() => { setStep(2); void track(PARCOURS_EVENTS.start, { has_coords: Boolean(coords) }); }}
            >
              Trouver où l'envoyer <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </section>
        )}

        {/* ÉTAPE 2 — DESCRIPTION */}
        {step === 2 && (
          <section className="space-y-4 rounded-xl border border-border p-4">
            <h2 className="text-xl font-bold">Qu'est-ce que vous avez à transporter ?</h2>
            <Textarea
              className="min-h-36 text-base"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={PLACEHOLDER}
            />
            <div className="space-y-2">
              <Label className="text-sm">Savez-vous quel type de camion sera utilisé ? (facultatif)</Label>
              <div className="flex flex-wrap gap-2">
                {TRUCK_OPTIONS.map((t) => (
                  <Button
                    key={t.label}
                    type="button"
                    size="sm"
                    variant={truckCode === t.code ? "default" : "outline"}
                    onClick={() => setTruckCode(t.code)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-12" onClick={() => setStep(1)}>Retour</Button>
              <Button className="h-12 flex-1 text-base" disabled={!description.trim()} onClick={analyze}>
                <Sparkles className="mr-2 h-5 w-5" />Continuer
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDetailed((v) => !v)}>
              {detailed ? "Masquer le mode détaillé" : "Mode détaillé (entrepreneur)"}
            </Button>
            {detailed && (
              <div className="grid gap-3 rounded-lg border border-border p-3">
                <div><Label>Chantier</Label><Input value={extra.chantier} onChange={(e) => setExtra({ ...extra, chantier: e.target.value })} /></div>
                <div><Label>Date souhaitée</Label><Input type="date" value={extra.date} onChange={(e) => setExtra({ ...extra, date: e.target.value })} /></div>
                <div><Label>Nombre de voyages</Label><Input inputMode="numeric" value={extra.trips} onChange={(e) => setExtra({ ...extra, trips: e.target.value })} /></div>
                <div><Label>Granulométrie</Label><Input value={extra.granulometry} onChange={(e) => setExtra({ ...extra, granulometry: e.target.value })} /></div>
                <div><Label>Contraintes d'accès</Label><Input value={extra.access} onChange={(e) => setExtra({ ...extra, access: e.target.value })} placeholder="entrée étroite, pente…" /></div>
                <div><Label>Notes</Label><Input value={extra.notes} onChange={(e) => setExtra({ ...extra, notes: e.target.value })} /></div>
                <div>
                  <Label className="flex items-center gap-2"><Camera className="h-4 w-4" />Ajouter des photos du matériel</Label>
                  <Input type="file" accept="image/*" multiple disabled={uploading} onChange={(e) => uploadPhotos(e.target.files)} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aide visuelle seulement : une photo ne certifie ni la propreté, ni la granulométrie, ni la conformité.
                    {photos.length > 0 ? ` ${photos.length} photo(s) enregistrée(s) de façon privée.` : ""}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ÉTAPE 3 — CONFIRMATION */}
        {step === 3 && interpretation && (
          <section className="space-y-4 rounded-xl border border-border p-4">
            <h2 className="text-xl font-bold">Voici ce que j'ai compris</h2>

            <p className="text-lg font-semibold">
              {interpretation.quantity
                ? `${interpretation.quantity} ${interpretation.unit === "m3" ? "m³" : interpretation.unit === "verges3" ? "verges³" : "tonnes"}${interpretation.quantityIsApproximate ? " environ" : ""}`
                : interpretation.trips
                  ? `${interpretation.trips} voyages environ`
                  : "Quantité à préciser"}
            </p>

            <div>
              <p className="text-sm text-muted-foreground">Matériel :</p>
              {interpretation.materials.length === 0 && <p className="text-sm">À confirmer ensemble</p>}
              <ul className="mt-1 space-y-0.5 text-sm">
                {interpretation.materials.map((m) => <li key={m.key}>✓ {m.label}</li>)}
              </ul>
            </div>

            <p className="text-sm"><span className="text-muted-foreground">Camion : </span>{truckLabelFor(truckCode)}</p>
            {interpretation.maxSizeLabel && (
              <p className="text-sm"><span className="text-muted-foreground">Grosseur : </span>{interpretation.maxSizeLabel}</p>
            )}
            {interpretation.declarations.length > 0 && (
              <p className="rounded bg-muted p-2 text-xs">{interpretation.declarations.join(" · ")}</p>
            )}

            {interpretation.questions.slice(0, 2).map((q) => (
              <div key={q.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{q.question}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...q.options, "Je ne sais pas"].map((o) => (
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

            {editing && (
              <div className="grid gap-3 rounded-lg border border-border p-3">
                <div>
                  <Label>Quantité</Label>
                  <Input
                    inputMode="decimal"
                    value={interpretation.quantity ?? ""}
                    onChange={(e) => setInterpretation({
                      ...interpretation,
                      quantity: e.target.value ? Number(e.target.value) : null,
                      unit: interpretation.unit ?? "tonnes",
                    })}
                  />
                </div>
                <div>
                  <Label>Nombre de voyages</Label>
                  <Input
                    inputMode="numeric"
                    value={interpretation.trips ?? ""}
                    onChange={(e) => setInterpretation({ ...interpretation, trips: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>Camion</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {TRUCK_OPTIONS.map((t) => (
                      <Button key={t.label} size="sm" variant={truckCode === t.code ? "default" : "outline"} onClick={() => setTruckCode(t.code)}>
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button className="h-12 flex-1 text-base" onClick={runSearch} disabled={searching}>
                {searching ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
                C'est bon
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => { setEditing((v) => !v); void track(PARCOURS_EVENTS.aiCorrection); }}
              >
                <Pencil className="mr-2 h-4 w-4" />Modifier
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>Revenir à ma description</Button>
          </section>
        )}

        {/* ÉTAPE 4 — RÉSULTATS */}
        {step === 4 && results && groups && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">Où je peux aller</h2>
              <div className="flex gap-1">
                <Button size="sm" variant={view === "liste" ? "default" : "outline"} onClick={() => setView("liste")}>
                  <List className="mr-1 h-4 w-4" />Liste
                </Button>
                <Button size="sm" variant={view === "carte" ? "default" : "outline"} onClick={() => setView("carte")}>
                  <MapIcon className="mr-1 h-4 w-4" />Carte
                </Button>
              </div>
            </div>

            <p className="rounded-lg bg-muted p-3 text-sm">
              {tripsSentence({
                declaredTrips: interpretation?.trips ?? null,
                tonnes: quantityInfo.tonnes,
                trips: quantityInfo.trips,
                truckLabel: truckLabelFor(truckCode),
              }).text}
            </p>

            {view === "carte" ? (
              <PreviewResultsMap
                origin={coords}
                points={mapPoints}
                onSelect={(id) => setSelected(results.find((r) => r.candidate.id === id) ?? null)}
              />
            ) : (
              <div className="space-y-6">
                {(["meilleurs", "possibles", "a_confirmer"] as ResultGroupKey[]).map((key) => (
                  groups[key].length > 0 && (
                    <div key={key} className="space-y-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                        {key === "meilleurs" ? "Meilleurs matchs" : key === "possibles" ? "Matchs possibles" : "À confirmer"}
                      </h3>
                      {groups[key].slice(0, 15).map((r) => {
                        const minutes = estimatedMinutes(r.distance.km);
                        return (
                          <article key={r.candidate.id} className="space-y-2 rounded-xl border border-border p-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold">{simpleMatchLabel(r)}</span>
                              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                {r.distance.km != null ? `${r.distance.km.toFixed(0)} km` : "distance à confirmer"}
                                {minutes != null && (<><Clock className="h-3 w-3" />≈ {minutes} min</>)}
                              </span>
                            </div>
                            <p className="font-medium">Site de remblai — {r.candidate.city ?? "ville à confirmer"}</p>
                            <p className="text-sm">{r.material.compatibility === "COMPATIBLE_CONFIRME" ? "✓" : "⚠"} {r.material.reason}</p>
                            <p className="text-sm flex items-center gap-1">
                              <Truck className="h-4 w-4" />
                              {r.access.verdict === "ACCESSIBLE" ? "Accès correct pour ce camion" : "Accès à confirmer pour ce camion"}
                            </p>
                            <p className="text-sm">Disponibilité : {r.availability.label}</p>
                            {humanizeMissing(r.missingData).slice(0, 3).map((m) => (
                              <p key={m} className="text-xs text-muted-foreground">⚠ {m}</p>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => { setSelected(r); void track(PARCOURS_EVENTS.resultClick, { score: r.score }); }}
                            >
                              Voir les détails
                            </Button>
                          </article>
                        );
                      })}
                    </div>
                  )
                ))}
                {results.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Aucun endroit à proposer pour l'instant. Essayez avec une description un peu plus précise.
                  </p>
                )}
              </div>
            )}

            {quantityInfo.tonnes != null && (
              <div className="rounded-xl border border-border p-4">
                <Button variant="outline" size="sm" onClick={() => setMulti((v) => !v)}>
                  Répartir le matériel entre plusieurs endroits
                </Button>
                {allocation && (
                  <div className="mt-3 space-y-1 text-sm">
                    {allocation.lines.map((l) => (
                      <p key={l.submissionId}>{l.label} : ≈ {Math.round(l.allocatedTonnes)} t</p>
                    ))}
                    {allocation.lines.length === 0 && <p className="text-muted-foreground">Capacités restantes à confirmer avec les sites.</p>}
                    <p className="text-xs text-muted-foreground">{allocation.note}</p>
                  </div>
                )}
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={() => { setStep(3); }}>Modifier ma demande</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { clearDraft(); window.location.reload(); }}
            >
              Recommencer
            </Button>
          </section>
        )}

        {/* Détails d'un résultat — simulation seulement */}
        {selected && (
          <section className="space-y-3 rounded-xl border border-primary p-4">
            <h3 className="text-lg font-bold">Site de remblai — {selected.candidate.city ?? "ville à confirmer"}</h3>
            <p className="text-sm">{selected.material.reason}</p>
            <p className="text-sm">Disponibilité : {selected.availability.label}</p>
            {humanizeMissing(selected.missingData).map((m) => (
              <p key={m} className="text-xs text-muted-foreground">⚠ {m}</p>
            ))}
            <Button
              className="h-12 w-full"
              onClick={() => toast.info("Aperçu : cette étape sera une demande à confirmer. Aucune réservation n'a été faite.")}
            >
              <Search className="mr-2 h-4 w-4" />Je veux utiliser cet endroit
            </Button>
            <p className="text-xs text-muted-foreground">
              Simulation : aucune réservation, aucun courriel, aucun changement de disponibilité.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Fermer</Button>
          </section>
        )}
      </div>
    </div>
  );
}
