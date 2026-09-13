// ============================================================
// LOT 7 — APERÇU INTERNE « J'AI BESOIN DE MATÉRIAUX »
// ------------------------------------------------------------
// Réservé à l'administration. Aucune demande réelle n'est créée,
// aucune demande existante n'est modifiée, fusionnée ou réactivée,
// aucune communication n'est envoyée. Le formulaire public reste
// inchangé et la publication publique automatique reste impossible.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Camera, Check, ClipboardPaste, Loader2, MapPin,
  Sparkles, Truck, X,
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
import {
  DEFAULT_SYNONYMS, type FieldConfidence, type MaterialKey, type SynonymEntry,
} from "@/lib/matching/interpreter";
import {
  rankCandidates, MATCHING_ALGORITHM_VERSION,
  type CandidateRow, type QuantityUnit,
} from "@/lib/matching/engine";
import {
  BESOIN_STEPS, BESOIN_TRUCKS, detectDuplicates, interpretBesoin, scoreCompleteness,
  toBesoinStructuredData, type BesoinInterpretation, type BesoinStep, type DuplicateHit,
  type ExistingRequestLite, type Stance, type TruckCode,
} from "@/lib/besoin/interpreter";

const PLACEHOLDER =
  "Ex. : Je peux prendre environ 3 000 tonnes de terre, sable, glaise et petite roche. 12 roues et semi acceptés. Ouvert la semaine.";

const EXAMPLES = [
  "Besoin de terre de remplissage, pas de grosse roche.",
  "Je prends terre, sable, glaise, gravier et petites pierres.",
  "Besoin d'environ 500 voyages de terre pour monter mon terrain.",
  "Je prends pas mal de matériel sauf asphalte et béton.",
  "Terre ou sable, semi peuvent rentrer.",
];

const STANCE_STYLE: Record<Stance, string> = {
  ACCEPTE: "bg-primary/15 text-primary border-primary/40",
  REFUSE: "bg-destructive/10 text-destructive border-destructive/30",
  A_CONFIRMER: "bg-muted text-muted-foreground border-border",
};
const STANCE_ICON: Record<Stance, string> = { ACCEPTE: "✓", REFUSE: "✗", A_CONFIRMER: "?" };

export default function PreviewDemandeRemblai() {
  const { isReady } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();

  const [step, setStep] = useState<BesoinStep>(1);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([]);
  const [description, setDescription] = useState("");
  const [detailed, setDetailed] = useState(false);
  const [synonyms, setSynonyms] = useState<SynonymEntry[]>(DEFAULT_SYNONYMS);
  const [interp, setInterp] = useState<BesoinInterpretation | null>(null);
  const [confirmations, setConfirmations] = useState<Partial<Record<MaterialKey, Stance>>>({});
  const [trucksOverride, setTrucksOverride] = useState<Partial<Record<TruckCode, Stance>>>({});
  const [semiAnswer, setSemiAnswer] = useState<"OUI" | "NON" | "INCONNU">("INCONNU");
  const [driverNote, setDriverNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [simulation, setSimulation] = useState<{ count: number; top: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef(`besoin_${Math.random().toString(36).slice(2)}`);

  // ---------- synonymes administrables ----------
  useEffect(() => {
    if (!isReady || !isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("material_synonyms").select("expression, material_keys, confidence, notes").eq("is_active", true);
      if (data?.length) {
        setSynonyms([
          ...DEFAULT_SYNONYMS,
          ...data.map((r) => ({
            expression: r.expression,
            materialKeys: (r.material_keys ?? []) as MaterialKey[],
            confidence: (String(r.confidence).toUpperCase() === "ELEVEE" ? "ELEVEE"
              : String(r.confidence).toUpperCase() === "FAIBLE" ? "FAIBLE" : "MOYENNE") as FieldConfidence,
            note: r.notes ?? undefined,
          })).filter((e) => e.materialKeys.length > 0),
        ]);
      }
    })();
  }, [isReady, isAdmin]);

  // ---------- dédoublonnage (lecture seule, aucune fusion) ----------
  const checkDuplicates = useCallback(async (lat: number, lng: number, addr: string) => {
    const { data } = await supabase
      .from("submissions")
      .select("id, address, city, latitude, longitude, status, created_at, dompe_number")
      .gte("latitude", lat - 0.01).lte("latitude", lat + 0.01)
      .gte("longitude", lng - 0.015).lte("longitude", lng + 0.015)
      .limit(50);
    const existing: ExistingRequestLite[] = (data ?? []).map((r) => ({
      id: r.id, address: r.address, city: r.city,
      latitude: r.latitude, longitude: r.longitude,
      status: r.status, createdAt: r.created_at,
    }));
    setDuplicates(detectDuplicates({ address: addr, lat, lng }, existing));
  }, []);

  const analyze = (text = description) => {
    if (!text.trim()) return;
    const it = interpretBesoin(text, synonyms);
    setInterp(it);
    setSemiAnswer(it.access.semiAccess === "OUI" ? "OUI" : it.access.semiAccess === "NON" ? "NON" : "INCONNU");
    setDriverNote(it.driverInstructions.join(" "));
    setStep(3);
  };

  const pasteMessage = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return toast.error("Presse-papiers vide.");
      setDescription(text.trim());
      toast.success("Message collé — appuyez sur Analyser.");
    } catch {
      toast.error("Collage impossible : collez le message manuellement.");
    }
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Session requise.");
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const path = `${uid}/${session.current}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("parcours-preview-photos").upload(path, file);
        if (error) throw error;
        added.push(path);
      }
      setPhotos((p) => [...p, ...added]);
      toast.success("Photos ajoutées (stockage privé).");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléversement impossible");
    } finally {
      setUploading(false);
    }
  };

  const structured = useMemo(() => {
    if (!interp) return null;
    return toBesoinStructuredData(interp, {
      address, lat: coords?.lat ?? null, lng: coords?.lng ?? null,
      photos, confirmations, trucksOverride, now: new Date().toISOString(),
    });
  }, [interp, address, coords, photos, confirmations, trucksOverride]);

  const completeness = useMemo(
    () => (interp ? scoreCompleteness(interp, { hasLocation: Boolean(coords) }) : null),
    [interp, coords],
  );

  // ---------- simulation de matching bidirectionnel (aucun envoi) ----------
  const runSimulation = async () => {
    if (!interp || !structured) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("matching_lab_candidates", {
        _lat: coords?.lat ?? null, _lng: coords?.lng ?? null, _limit: 200,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as CandidateRow[];
      const label = [...interp.accepted].map((m) => m.label).join(" ") || interp.originalText;
      const ranked = rankCandidates(
        {
          materialLabel: label,
          materialSlug: label,
          quantity: interp.quantity,
          unit: (interp.unit ?? "tonnes") as QuantityUnit,
          origin: coords,
          configCode: null,
          truckCapacityTonnes: null,
        },
        rows,
        null,
      );
      setSimulation({ count: ranked.length, top: ranked[0]?.score ?? null });
      await supabase.from("matching_simulation_log").insert({
        algorithm_version: `${MATCHING_ALGORITHM_VERSION}+besoin-preview`,
        criteria: { preview: true, direction: "besoin_de_materiaux", structured: structured.structured },
        results: ranked.slice(0, 20).map((r) => ({ id: r.candidate.id, score: r.score, confidence: r.confidence })),
        result_count: ranked.length,
        top_score: ranked[0]?.score ?? null,
      });
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation impossible");
    } finally {
      setBusy(false);
    }
  };

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

  const trucksState = { ...(interp?.trucks ?? {}), ...trucksOverride } as Record<TruckCode, Stance>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto w-full max-w-2xl space-y-5 p-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" />Retour</Link>
          </Button>
          <Badge variant="secondary">Aperçu interne — aucune demande créée</Badge>
        </div>

        <header className="space-y-1">
          <h1 className="text-2xl font-extrabold leading-tight">J'ai besoin de matériaux</h1>
          <p className="text-sm text-muted-foreground">
            Je peux recevoir du remblai. Simulation seulement : rien n'est enregistré comme demande réelle.
          </p>
        </header>

        <ol className="flex gap-1 text-[11px] font-medium">
          {BESOIN_STEPS.map((label, i) => (
            <li key={label} className={`flex-1 rounded-full px-2 py-1 text-center ${
              step >= (i + 1) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i + 1} — {label}
            </li>
          ))}
        </ol>

        {/* ÉTAPE 1 — ENDROIT */}
        {step === 1 && (
          <section className="space-y-4 rounded-xl border border-border p-4">
            <h2 className="text-xl font-bold">Où voulez-vous recevoir le matériel ?</h2>
            <GooglePlaceAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={(d) => {
                setAddress(d.formattedAddress);
                if (d.lat != null && d.lng != null) {
                  setCoords({ lat: d.lat, lng: d.lng });
                  void checkDuplicates(d.lat, d.lng, d.formattedAddress);
                }
              }}
              placeholder="Adresse, ville ou code postal"
            />
            {coords && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" />Endroit enregistré — adresse gardée privée
              </p>
            )}
            {duplicates.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-semibold">Une demande semble déjà exister à cet endroit.</p>
                <ul className="space-y-1 text-muted-foreground">
                  {duplicates.map((d) => (
                    <li key={d.request.id}>
                      {d.request.address ?? d.request.city ?? "Adresse inconnue"} — {d.request.status ?? "statut inconnu"}
                      {d.distanceKm != null ? ` (${d.distanceKm.toFixed(2)} km)` : ""}
                    </li>
                  ))}
                </ul>
                <p className="text-xs">
                  Rien n'est fusionné ni réactivé automatiquement : un employé doit vérifier.
                </p>
              </div>
            )}
            <Button className="h-12 w-full text-base" disabled={!address.trim()} onClick={() => setStep(2)}>
              Continuer <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </section>
        )}

        {/* ÉTAPE 2 — DESCRIPTION LIBRE */}
        {step === 2 && (
          <section className="space-y-4 rounded-xl border border-border p-4">
            <h2 className="text-xl font-bold">Décrivez ce que vous recherchez</h2>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={PLACEHOLDER}
              className="min-h-[140px] text-base"
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setDescription(ex)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
                  {ex}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={pasteMessage}>
                <ClipboardPaste className="mr-2 h-4 w-4" />Coller un message reçu
              </Button>
              <Button variant="ghost" onClick={() => setDetailed((d) => !d)}>
                {detailed ? "Mode simple" : "Mode détaillé"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-12" onClick={() => setStep(1)}>Retour</Button>
              <Button className="h-12 flex-1 text-base" disabled={!description.trim()} onClick={() => analyze()}>
                <Sparkles className="mr-2 h-5 w-5" />Analyser
              </Button>
            </div>
          </section>
        )}

        {/* ÉTAPE 3 — ACCÈS / QUANTITÉ */}
        {step === 3 && interp && (
          <section className="space-y-5 rounded-xl border border-border p-4">
            <h2 className="text-xl font-bold">Accès et quantité</h2>

            <div className="space-y-2">
              <Label>Est-ce qu'un tracteur avec semi-remorque peut entrer et ressortir facilement ?</Label>
              <div className="flex gap-2">
                {(["OUI", "NON", "INCONNU"] as const).map((v) => (
                  <Button key={v} variant={semiAnswer === v ? "default" : "outline"} size="sm"
                    onClick={() => {
                      setSemiAnswer(v);
                      const stance: Stance = v === "OUI" ? "ACCEPTE" : v === "NON" ? "REFUSE" : "A_CONFIRMER";
                      const next: Partial<Record<TruckCode, Stance>> = {};
                      for (const t of BESOIN_TRUCKS) if (t.isSemi) next[t.code] = stance;
                      setTrucksOverride((o) => ({ ...o, ...next }));
                    }}>
                    {v === "OUI" ? "Oui" : v === "NON" ? "Non" : "Je ne sais pas"}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Aucune mesure n'est obligatoire : « Je ne sais pas » reste une réponse valide.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Truck className="h-4 w-4" />Camions acceptés</Label>
              <div className="grid grid-cols-2 gap-2">
                {BESOIN_TRUCKS.map((t) => {
                  const s = trucksState[t.code] ?? "A_CONFIRMER";
                  const cycle: Stance = s === "ACCEPTE" ? "REFUSE" : s === "REFUSE" ? "A_CONFIRMER" : "ACCEPTE";
                  return (
                    <button key={t.code} type="button"
                      onClick={() => setTrucksOverride((o) => ({ ...o, [t.code]: cycle }))}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${STANCE_STYLE[s]}`}>
                      {STANCE_ICON[s]} {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {detailed && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Largeur d'entrée (pieds)</Label>
                  <Input defaultValue={interp.access.entranceWidthFeet ?? ""} placeholder="Je ne sais pas" />
                </div>
                <div>
                  <Label>Hauteur libre (pieds)</Label>
                  <Input defaultValue={interp.access.clearHeightFeet ?? ""} placeholder="Je ne sais pas" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Instructions pour le chauffeur</Label>
              <Textarea value={driverNote} onChange={(e) => setDriverNote(e.target.value)}
                placeholder="Ex. : Entrer par la deuxième entrée, reculer près du garage et appeler avant de domper." />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Camera className="h-4 w-4" />Photos du site, de l'entrée, du lieu de dépôt</Label>
              <input type="file" accept="image/*" multiple onChange={(e) => uploadPhotos(e.target.files)} />
              {uploading && <p className="text-xs text-muted-foreground">Téléversement…</p>}
              {photos.length > 0 && <p className="text-xs text-muted-foreground">{photos.length} photo(s) — stockage privé</p>}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="h-12" onClick={() => setStep(2)}>Modifier le texte</Button>
              <Button className="h-12 flex-1 text-base" disabled={busy} onClick={runSimulation}>
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
                Voir ce que j'ai compris
              </Button>
            </div>
          </section>
        )}

        {/* ÉTAPE 4 — CONFIRMATION */}
        {step === 4 && interp && structured && completeness && (
          <section className="space-y-5 rounded-xl border border-border p-4">
            <h2 className="text-xl font-bold">Voici ce que j'ai compris</h2>

            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-semibold">Vous recherchez environ :</p>
              <p>
                {interp.quantity != null
                  ? `${interp.quantity} ${interp.unit ?? "tonnes"}`
                  : interp.trips != null
                    ? `${interp.trips} voyages (tonnage estimé seulement si le camion est connu)`
                    : interp.quantityLarge ? "Un gros volume — quantité à confirmer" : "Quantité à confirmer"}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Vous acceptez :</p>
              <div className="flex flex-wrap gap-2">
                {structured.structured.accepted_materials.length === 0 && (
                  <span className="text-sm text-muted-foreground">À préciser</span>
                )}
                {interp.accepted.filter((m) => structured.structured.accepted_materials.includes(m.key)).map((m) => (
                  <Badge key={m.key} className="bg-primary/15 text-primary">✓ {m.label}</Badge>
                ))}
                {(structured.structured.accepted_materials.filter(
                  (k) => !interp.accepted.some((m) => m.key === k))).map((k) => (
                  <Badge key={k} className="bg-primary/15 text-primary">✓ {k}</Badge>
                ))}
              </div>
            </div>

            {interp.toConfirm.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">À confirmer — votre demande pourrait peut-être aussi accepter :</p>
                <div className="space-y-1">
                  {interp.toConfirm.map((m) => {
                    const current = confirmations[m.key] ?? "A_CONFIRMER";
                    return (
                      <div key={m.key} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                        <span>? {m.label}</span>
                        <span className="flex gap-1">
                          <Button size="sm" variant={current === "ACCEPTE" ? "default" : "outline"}
                            onClick={() => setConfirmations((c) => ({ ...c, [m.key]: "ACCEPTE" }))}>J'accepte</Button>
                          <Button size="sm" variant={current === "REFUSE" ? "destructive" : "outline"}
                            onClick={() => setConfirmations((c) => ({ ...c, [m.key]: "REFUSE" }))}>Non</Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {structured.structured.refused_materials.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Vous refusez :</p>
                <div className="flex flex-wrap gap-2">
                  {structured.structured.refused_materials.map((k) => (
                    <Badge key={k} variant="destructive">✗ {k}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-semibold">Camions :</p>
              <div className="flex flex-wrap gap-2">
                {BESOIN_TRUCKS.map((t) => {
                  const s = structured.structured.trucks[t.code];
                  return <Badge key={t.code} variant="outline" className={STANCE_STYLE[s]}>{STANCE_ICON[s]} {t.label}</Badge>;
                })}
              </div>
            </div>

            <div className="text-sm">
              <p className="font-semibold">Disponibilité :</p>
              <p className="text-muted-foreground">{interp.schedule.summary ?? "À confirmer"}</p>
              {interp.schedule.originalText && (
                <p className="text-xs text-muted-foreground">Texte d'origine : « {interp.schedule.originalText} »</p>
              )}
            </div>

            {driverNote && (
              <div className="text-sm">
                <p className="font-semibold">Instructions pour le chauffeur :</p>
                <p className="text-muted-foreground">{driverNote}</p>
              </div>
            )}

            {interp.declarations.length > 0 && (
              <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                {interp.declarations.map((d) => <p key={d}>{d}</p>)}
              </div>
            )}

            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-semibold">Qualité de la demande : {completeness.level}</p>
              {completeness.missing.length > 0 ? (
                <>
                  <p className="mt-1 text-muted-foreground">
                    Il nous manque seulement {completeness.missing.length} information(s) :
                  </p>
                  <ol className="ml-4 list-decimal text-muted-foreground">
                    {completeness.missing.map((m) => <li key={m}>{m}</li>)}
                  </ol>
                </>
              ) : (
                <p className="text-muted-foreground">Rien d'important ne manque.</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Une demande imparfaite reste utilisable : rien n'est rendu invisible.
              </p>
            </div>

            {simulation && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                Nous avons actuellement {simulation.count} offre(s) de matériaux potentiellement compatibles avec cette demande
                (simulation interne — aucune communication envoyée, aucune réservation).
              </div>
            )}

            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              Texte original conservé : « {interp.originalText} »
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(2)}>
                <X className="mr-2 h-4 w-4" />Modifier
              </Button>
              <Button className="h-12 flex-1" onClick={() => toast.success("Aperçu seulement : aucune demande n'a été créée ni publiée.")}>
                <Check className="mr-2 h-4 w-4" />C'est bon
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
