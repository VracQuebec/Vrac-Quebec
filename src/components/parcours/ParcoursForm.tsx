// ============================================================
// Parcours de demande intégré aux pages /remblai et /depot-materiaux.
// Un seul composant, deux sens de demande :
//  - « reception »  : la personne a besoin de matériel de remplissage;
//  - « evacuation » : la personne a des matériaux à sortir de son chantier.
// Tout est réutilisé : matériaux (questionnaire-data), camions
// (lib/trucks/catalog), Google Places, stockage « lead-photos »,
// champs d'accès chantier et table `submissions` du CRM.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Loader2, MapPin, Send, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import { useAuthReady } from "@/hooks/useAuthReady";
import { getAttribution } from "@/lib/analytics/attribution";
import { trackEvent } from "@/lib/analytics/ga4";
import {
  REMBLAI_MATERIAL_CATEGORIES,
  REMBLAI_MATERIAL_IMAGES,
  REMBLAI_MATERIAL_DESCRIPTIONS,
  REMBLAI_TIMEFRAME_OPTIONS,
  PROJECT_USAGE_OPTIONS,
} from "@/lib/questionnaire-data";
import { BULK_TRUCK_TYPES } from "@/lib/trucks/catalog";
import {
  ACCESS_CRITERIA,
  HEAVY_TRUCK_ACCESS,
  PHOTO_CATEGORY_DEFS,
  SELECTABLE_QUANTITY_UNITS,
  formatQuantity,
  parseQuantityValue,
  normalizeQuantityUnit,
  type PhotoCategoryKey,
} from "@/lib/parcours/normalisation";
import { buildHandoff, saveHandoff, tripsFromHandoff, type ParcoursHandoff } from "@/lib/parcours/handoff";
import { isFeatureEnabled } from "@/lib/flags";
import { Button } from "@/components/ui/button";
import { emptyParcoursDraft as emptyDraft, publicStepError, type ParcoursDraft as Draft } from "@/lib/remblai/public-form";
import MaterialAssistantStep from "@/components/parcours/MaterialAssistantStep";
import { assistantNotes, type EnvironmentAnswer } from "@/lib/parcours/assistant-materiaux";

export type ParcoursVariant = "reception" | "evacuation";

type StepKey =
  | "address" | "quantity" | "project" | "material" | "truck" | "date"
  | "access" | "photos" | "contact";

const STEPS: Record<ParcoursVariant, StepKey[]> = {
  reception: ["address", "quantity", "project", "material", "access", "photos", "contact"],
  evacuation: ["material", "quantity", "address", "date", "truck", "access", "photos", "contact"],
};

const TITLES: Record<StepKey, Record<ParcoursVariant, string>> = {
  address: { reception: "Où avez-vous besoin du matériel ?", evacuation: "Adresse du chantier" },
  quantity: { reception: "Quelle quantité approximative ?", evacuation: "Quantité approximative à sortir" },
  project: { reception: "Quel est votre projet ?", evacuation: "Quel est votre projet ?" },
  material: { reception: "Quel type de matériau peut convenir ?", evacuation: "Quel matériau devez-vous sortir ?" },
  truck: { reception: "Type de camion", evacuation: "Type de camion (si connu)" },
  date: { reception: "Quand en avez-vous besoin ?", evacuation: "Date souhaitée" },
  access: { reception: "Comment est l'accès au terrain ?", evacuation: "Accès au chantier" },
  photos: { reception: "Photos (optionnel)", evacuation: "Photos (optionnel)" },
  contact: { reception: "Vos coordonnées", evacuation: "Vos coordonnées" },
};

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-4 py-3.5 font-body text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none";

const choiceCls = (active: boolean) =>
  `flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left font-body text-base transition-colors ${
    active ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border bg-background text-foreground hover:border-primary/50"
  }`;

type Editor = { initial: Draft; onSave: (value: Draft) => void; onCancel: () => void; busy: boolean };
const ParcoursForm = ({ variant, editor }: { variant: ParcoursVariant; editor?: Editor }) => {
  const storageKey = `vq_parcours_${variant}_v1`;
  const navigate = useNavigate();
  const { user } = useAuthReady();
  const steps = STEPS[variant];
  // Drapeau material_assistant_v2 : désactivé par défaut (production inchangée).
  const assistantOn = useMemo(() => !editor && isFeatureEnabled("material_assistant_v2"), [editor]);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<Draft>(() => {
    try {
      if (editor) return editor.initial;
      const raw = localStorage.getItem(storageKey);
      if (!raw) return emptyDraft;
      const saved = { ...emptyDraft, ...JSON.parse(raw) } as Draft;
      // Compatibilité : les brouillons plus anciens contiennent d'anciennes clés.
      const unit = normalizeQuantityUnit(saved.quantityUnit);
      return { ...saved, quantityUnit: unit === "inconnu" ? "voyages" : unit };
    } catch { return emptyDraft; }
  });
  // Brouillon retrouvé au chargement : on l'annonce pour expliquer le retour à l'étape 1.
  const [restoredDraft, setRestoredDraft] = useState<boolean>(() => {
    if (editor) return false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const d = JSON.parse(raw) as Partial<Draft>;
      return !!(d.address?.trim() || d.name?.trim() || d.phone?.trim() || d.email?.trim() || d.materials?.length);
    } catch { return false; }
  });
  const [uploading, setUploading] = useState(false);
  const [photoCategory, setPhotoCategory] = useState<PhotoCategoryKey>("materiau");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"queued" | "failed" | "not_sent" | null>(null);
  const [resending, setResending] = useState(false);
  const lastBody = useRef<Record<string, unknown> | null>(null);
  const [handoff, setHandoff] = useState<ParcoursHandoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const topRef = useRef<HTMLDivElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Draft>) => setData((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (editor) return;
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* quota */ }
  }, [data, storageKey]);

  useEffect(() => {
    if (index === 0) return;
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [index]);

  const step = steps[index];

  const quantityLabel = useMemo(() => {
    if (data.quantityUnknown || !data.quantityValue.trim()) return "Je ne sais pas";
    return formatQuantity(data.quantityValue, data.quantityUnit);
  }, [data.quantityValue, data.quantityUnit, data.quantityUnknown]);

  const canContinue = () => publicStepError(step, data) === null;
  const blockedReason = () => publicStepError(step, data);

  const toggle = (key: "materials" | "accessDetails", value: string) => {
    const arr = data[key];
    set({ [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] } as Partial<Draft>);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: Draft["photos"] = [];
      if (editor) {
        for (const file of Array.from(files).slice(0, Math.max(0, 20 - data.photos.length))) {
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4000000) throw Error("Photo refusée : JPEG, PNG ou WebP, 4 Mo maximum.");
          const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
          added.push({url, category:photoCategory});
        }
        set({photos:[...data.photos,...added]}); return;
      }
      for (const file of Array.from(files).slice(0, 6)) {
        const ext = file.name.split(".").pop();
        const safeExt = (ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        const path = `submissions/${crypto.randomUUID()}/${Date.now()}.${safeExt}`;
        const { error: upErr } = await supabase.storage.from("lead-photos").upload(path, file);
        if (!upErr) {
          const { data: pub } = supabase.storage.from("lead-photos").getPublicUrl(path);
          added.push({ url: pub.publicUrl, category: photoCategory });
        }
      }
      if (added.length) set({ photos: [...data.photos, ...added] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo non ajoutée.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = {
          variant,
          address: data.address,
          postal_code: data.postalCode,
          materials: data.materials,
          other_material: data.otherMaterial,
          project_usage: data.projectUsage || null,
          quantity_label: quantityLabel,
          quantity_value: data.quantityUnknown ? null : parseQuantityValue(data.quantityValue),
          quantity_unit: data.quantityUnknown ? "inconnu" : data.quantityUnit,
          truck_type: data.truckType || null,
          desired_date: data.desiredDate || null,
          timeframe: data.timeframe || null,
          access_heavy_truck: data.accessHeavyTruck || null,
          access_details: data.accessDetails,
          photos: data.photos,
          contact: {
            name: data.name,
            phone: data.phone,
            email: data.email,
            // Le résumé de l'assistant n'est ajouté que si le drapeau est actif.
            notes: assistantOn
              ? [
                  data.notes,
                  assistantNotes({
                    description: data.materialDescription,
                    materials: data.materials,
                    refused: data.refusedMaterials,
                    environment: data.soilCharacterized as EnvironmentAnswer,
                    environmentDetails: data.soilCharacterizedDetails,
                  }),
                ].filter(Boolean).join("\n").trim()
              : data.notes,
          },
          website: honeypot.current?.value ?? "",
          form_started_at: startedAt.current,
          attribution: getAttribution(),
        };
      lastBody.current = body;
      const { data: res, error: fnError } = await supabase.functions.invoke("submit-parcours", { body });
      if (fnError) throw fnError;
      if (!res?.ok) throw new Error(res?.message || "Envoi impossible.");
      // Continuité : on conserve l'ID RÉEL retourné par `submissions`.
      const ho = buildHandoff({
        submissionId: res?.submission_id ? String(res.submission_id) : null,
        // Valeurs réellement enregistrées dans `submissions` : l'adresse
        // normalisée et les coordonnées géocodées côté serveur priment sur
        // la saisie locale. Rien n'est inventé si le géocodage a échoué.
        address: (res?.formatted_address as string | null) || data.address,
        lat: typeof res?.latitude === "number" ? res.latitude : data.lat,
        lng: typeof res?.longitude === "number" ? res.longitude : data.lng,
        materials: data.materials,
        quantityValue: data.quantityValue,
        quantityUnit: data.quantityUnit,
        quantityLabel: quantityLabel,
        truckType: data.truckType,
        desiredDate: data.desiredDate,
        timeframe: data.timeframe,
        accessHeavyTruck: data.accessHeavyTruck,
        accessDetails: data.accessDetails,
      });
      if (variant === "evacuation") {
        setHandoff(ho);
        saveHandoff(ho);
      }
      setEmailStatus(res?.email_status ?? null);
      setDone(true);
      trackEvent("lead_created", { form: "parcours", variant });
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Envoi impossible pour le moment.";
      setError(msg);
      toast({ title: "Envoi impossible", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Confirmation ----------
  // Nouvelle tentative du courriel : même formulaire → même dossier (anti-doublon),
  // jamais une deuxième demande.
  const resendConfirmation = async () => {
    if (!lastBody.current || resending) return;
    setResending(true);
    try {
      const { data: res } = await supabase.functions.invoke("submit-parcours", {
        body: { ...lastBody.current, resend_confirmation: true },
      });
      setEmailStatus(res?.ok && res?.email_status ? res.email_status : "failed");
    } catch {
      setEmailStatus("failed");
    } finally {
      setResending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden />
        <h2 className="mt-3 font-display text-2xl font-extrabold text-foreground">
          Votre demande a été reçue.
        </h2>
        <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
          Vrac Québec vérifiera les solutions disponibles pour votre secteur et vous reviendra
          avec les informations. Aucun site, aucune disponibilité, aucun prix et aucun délai
          ne sont confirmés à cette étape.
        </p>
        {emailStatus === "queued" && (
          <p role="status" className="mt-3 font-body text-sm text-foreground">
            Le courriel contenant votre lien personnel de suivi a été accepté par notre service d’envoi.
            Vérifiez aussi vos courriels indésirables.
          </p>
        )}
        {emailStatus === "failed" && (
          <div role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="font-body text-sm text-foreground">
              Votre demande est bien enregistrée, mais le courriel avec votre lien de suivi n’a pas pu être envoyé.
            </p>
            <button
              type="button"
              onClick={resendConfirmation}
              disabled={resending}
              className="mt-3 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 font-display text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {resending ? "Nouvel essai…" : "Réessayer l’envoi du courriel"}
            </button>
          </div>
        )}
        {variant === "evacuation" && user && (
          <button
            type="button"
            onClick={() =>
              navigate("/entrepreneur/comparateur", {
                state: {
                  vqPrefill: handoff
                    ? {
                        ...handoff,
                        submissionId: handoff.submissionId,
                        trips: tripsFromHandoff(handoff),
                      }
                    : undefined,
                },
              })
            }
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground"
          >
            Comparer les sites disponibles <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  // Grille de cartes historique — inchangée, réutilisée par l'assistant.
  const renderManualMaterials = () => (
    <div className="space-y-5">
      <p className="font-body text-sm text-muted-foreground">
        {variant === "reception"
          ? "Sélectionnez le ou les matériaux qui pourraient convenir. Le choix final dépend des disponibilités."
          : "Sélectionnez le ou les matériaux à sortir de votre chantier."}
      </p>
      {REMBLAI_MATERIAL_CATEGORIES.map((cat) => (
        <div key={cat.title}>
          <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {cat.title}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cat.materials.map((m) => {
              const active = data.materials.includes(m);
              return (
                <button key={m} type="button" aria-pressed={active} onClick={() => toggle("materials", m)}
                  className={`group flex h-full flex-col overflow-hidden rounded-xl border-4 bg-card text-left font-body transition-all ${
                    active ? "border-primary bg-primary/5 shadow-lg shadow-primary/20" : "border-border hover:border-primary/60"
                  }`}>
                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                    <img src={REMBLAI_MATERIAL_IMAGES[m]} alt={`Matériau : ${m}`} loading="lazy"
                      width={480} height={480} className="h-full w-full object-cover" />
                    {active && (
                      <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-4 w-4" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 px-3 py-2.5">
                    <span className="block text-sm font-semibold leading-tight text-foreground">{m}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {REMBLAI_MATERIAL_DESCRIPTIONS[m]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {(data.materials.includes("Autre") || data.materials.includes("Je ne suis pas certain")) && (
        <input
          value={data.otherMaterial}
          onChange={(e) => set({ otherMaterial: e.target.value })}
          placeholder="Précisez votre matériau"
          className={inputCls}
        />
      )}
    </div>
  );

  // ---------- Étapes ----------
  const renderStep = () => {
    switch (step) {
      case "address":
        return (
          <div className="space-y-3">
            <GooglePlaceAutocomplete
              value={data.address}
              onChange={(v) => set({ address: v, lat: null, lng: null })}
              onSelect={(p) =>
                set({
                  address: p.formattedAddress,
                  postalCode: p.postalCode ?? data.postalCode,
                  lat: p.lat ?? null,
                  lng: p.lng ?? null,
                })
              }
              placeholder="123 rue Principale, Québec"
              className={inputCls}
            />
            {data.lat != null && (
              <p className="flex items-center gap-1.5 font-body text-sm font-semibold text-primary">
                <Check className="h-4 w-4" aria-hidden /> Adresse validée
              </p>
            )}
            <input
              value={data.postalCode}
              onChange={(e) => set({ postalCode: e.target.value })}
              placeholder="Code postal (optionnel)"
              className={inputCls}
              autoComplete="postal-code"
            />
          </div>
        );

      case "quantity":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                type="tel"
                inputMode="decimal"
                value={data.quantityValue}
                onChange={(e) => set({ quantityValue: e.target.value.replace(/[^0-9.,]/g, ""), quantityUnknown: false })}
                placeholder="Ex : 3"
                className={inputCls}
              />
              <select
                value={data.quantityUnit}
                onChange={(e) => set({ quantityUnit: e.target.value })}
                className={`${inputCls} w-auto`}
                aria-label="Unité"
              >
                {SELECTABLE_QUANTITY_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>{u.label}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => set({ quantityUnknown: true, quantityValue: "" })}
              className={choiceCls(data.quantityUnknown)}>
              Je ne sais pas
            </button>
            <a
              href="/calculateur"
              className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-primary underline"
            >
              Calculer ma quantité
            </a>
          </div>
        );

      case "project":
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {PROJECT_USAGE_OPTIONS.map((p) => (
              <button key={p} type="button" onClick={() => set({ projectUsage: data.projectUsage === p ? "" : p })}
                className={choiceCls(data.projectUsage === p)}>
                {p}
              </button>
            ))}
          </div>
        );

      case "material":
        if (assistantOn) {
          return (
            <MaterialAssistantStep
              variant={variant}
              value={{
                description: data.materialDescription,
                materials: data.materials,
                refused: data.refusedMaterials,
                environment: data.soilCharacterized as EnvironmentAnswer,
                environmentDetails: data.soilCharacterizedDetails,
              }}
              onChange={(patch) =>
                set({
                  ...(patch.description !== undefined ? { materialDescription: patch.description } : {}),
                  ...(patch.materials !== undefined ? { materials: patch.materials } : {}),
                  ...(patch.refused !== undefined ? { refusedMaterials: patch.refused } : {}),
                  ...(patch.environment !== undefined ? { soilCharacterized: patch.environment } : {}),
                  ...(patch.environmentDetails !== undefined
                    ? { soilCharacterizedDetails: patch.environmentDetails }
                    : {}),
                })
              }
              onGoToPhotos={() => {
                const i = steps.indexOf("photos");
                if (i >= 0) setIndex(i);
              }}
              renderManual={renderManualMaterials}
            />
          );
        }
        return renderManualMaterials();

      case "truck":
        return (
          <div className="grid gap-2">
            {BULK_TRUCK_TYPES.map((t) => (
              <button key={t.key} type="button"
                onClick={() => set({ truckType: data.truckType === t.key ? "" : t.key })}
                className={choiceCls(data.truckType === t.key)}>
                <span className="flex-1">
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
              </button>
            ))}
            <button type="button" onClick={() => set({ truckType: "inconnu" })}
              className={choiceCls(data.truckType === "inconnu")}>
              Je ne sais pas
            </button>
          </div>
        );

      case "date":
        return (
          <div className="space-y-3">
            <label className="block font-display text-sm font-semibold text-foreground">
              Date souhaitée (optionnel)
            </label>
            <input type="date" value={data.desiredDate} onChange={(e) => set({ desiredDate: e.target.value })}
              className={inputCls} />
            <div className="grid gap-2">
              {REMBLAI_TIMEFRAME_OPTIONS.map((t) => (
                <button key={t} type="button" onClick={() => set({ timeframe: data.timeframe === t ? "" : t })}
                  className={choiceCls(data.timeframe === t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        );

      case "access":
        return (
          <div className="space-y-3">
            <p className="font-body text-sm text-muted-foreground">
              Un camion lourd peut-il accéder facilement au terrain ?
            </p>
            <div className="grid gap-2">
              {HEAVY_TRUCK_ACCESS.map((o) => (
                <button key={o.key} type="button"
                  onClick={() => set({ accessHeavyTruck: data.accessHeavyTruck === o.key ? "" : o.key })}
                  className={choiceCls(data.accessHeavyTruck === o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
            {data.accessHeavyTruck && (
              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                {ACCESS_CRITERIA.map((o) => (
                  <button key={o.key} type="button" onClick={() => toggle("accessDetails", o.key)}
                    className={choiceCls(data.accessDetails.includes(o.key))}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-primary text-xs">
                      {data.accessDetails.includes(o.key) ? "✓" : ""}
                    </span>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case "photos":
        return (
          <div className="space-y-3">
            <p className="font-body text-sm text-muted-foreground">
              Aucune photo n'est obligatoire. Choisissez d'abord la catégorie, puis ajoutez vos photos.
            </p>
            <div className="flex flex-wrap gap-2">
              {PHOTO_CATEGORY_DEFS.map((c) => (
                <button key={c.key} type="button" onClick={() => setPhotoCategory(c.key)}
                  className={`rounded-full border-2 px-3 py-2 font-body text-sm ${
                    photoCategory === c.key ? "border-primary bg-primary/10 font-semibold text-foreground" : "border-border text-muted-foreground"
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-5 hover:border-primary/50">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              <span className="font-body text-sm font-semibold">
                {uploading ? "Téléversement..." : `Ajouter des photos — ${PHOTO_CATEGORY_DEFS.find((c) => c.key === photoCategory)?.label}`}
              </span>
              <input type="file" accept="image/*" multiple capture="environment" className="hidden"
                onChange={(e) => uploadPhotos(e.target.files)} />
            </label>
            {data.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {data.photos.map((p, i) => (
                  <div key={p.url} className="relative">
                    <img src={p.signedUrl ?? p.url} alt={p.category} className="h-20 w-full rounded object-cover" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-foreground/70 px-1 py-0.5 text-[10px] text-background">
                      {p.category}
                    </span>
                    <button type="button" onClick={() => set({ photos: data.photos.filter((_, j) => j !== i) })}
                      aria-label="Retirer la photo"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/80 text-background">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "contact":
        return (
          <div className="space-y-3">
            <input value={data.name} onChange={(e) => set({ name: e.target.value })}
              placeholder="Nom complet *" autoComplete="name" className={inputCls} />
            <input type="tel" inputMode="tel" value={data.phone} onChange={(e) => set({ phone: e.target.value })}
              placeholder="Téléphone *" autoComplete="tel" className={inputCls} />
            <input readOnly={!!editor} aria-label="Courriel *" type="email" inputMode="email" value={data.email} onChange={(e) => set({ email: e.target.value })}
              placeholder="Courriel *" autoComplete="email" className={inputCls} />
            <textarea value={data.notes} onChange={(e) => set({ notes: e.target.value })} rows={3}
              placeholder="Précisions (optionnel)" className={`${inputCls} resize-none`} />
            <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off"
              aria-hidden className="hidden" />
            {error && <p className="font-body text-sm text-destructive">{error}</p>}
          </div>
        );
    }
  };

  const isLast = index === steps.length - 1;

  return (
    <div ref={topRef} className="scroll-mt-20 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Étape {index + 1} sur {steps.length}
        </p>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      <h2 className="font-display text-xl font-extrabold text-foreground sm:text-2xl">
        {TITLES[step][variant]}
      </h2>

      {restoredDraft && index === 0 && (
        <div role="status" className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3 font-body text-sm text-foreground">
          Vos réponses précédentes ont été conservées. Vous reprenez à l'étape 1 pour les revoir : touchez « Continuer » pour avancer.
          <button type="button" className="ml-2 font-semibold text-primary underline"
            onClick={() => { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } setData(emptyDraft); setRestoredDraft(false); }}>
            Recommencer à neuf
          </button>
        </div>
      )}

      <div className="mt-4">{renderStep()}</div>

      {error && editor && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      {editor && step === "contact" && <p className="mt-3 text-sm text-muted-foreground">Le courriel associé à votre lien personnel ne peut pas être modifié ici.</p>}
      {blockedReason() && (
        <p role="status" className="mt-4 font-body text-sm text-destructive">{blockedReason()}</p>
      )}

      <div className="mt-6 flex gap-2">
        {index > 0 && (
          <button type="button" onClick={() => setIndex((i) => i - 1)}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border px-4 py-3.5 font-display text-sm font-bold text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
        )}
        <button
          type="button"
          disabled={!canContinue() || loading || uploading || editor?.busy}
          onClick={() => (isLast ? editor ? editor.onSave(data) : void submit() : setIndex((i) => i + 1))}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 font-display text-base font-bold uppercase tracking-wide text-primary-foreground shadow-lg disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isLast ? <Send className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
          {isLast ? editor ? "Enregistrer ma demande" : "Envoyer ma demande" : "Continuer"}
        </button>
      </div>

      {editor && <Button variant="outline" className="mt-3" disabled={editor.busy} onClick={editor.onCancel}>Annuler</Button>}
      <p className="mt-3 flex items-start gap-1.5 font-body text-xs text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        Vos réponses sont conservées si vous revenez en arrière. Aucun engagement.
      </p>
    </div>
  );
};

export default ParcoursForm;
