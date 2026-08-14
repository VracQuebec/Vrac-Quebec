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
import {
  REMBLAI_MATERIAL_CATEGORIES,
  REMBLAI_MATERIAL_IMAGES,
  REMBLAI_MATERIAL_DESCRIPTIONS,
  REMBLAI_TIMEFRAME_OPTIONS,
  ACCESS_DETAIL_OPTIONS,
  ACCESS_TRUCK_SIMPLE_OPTIONS,
  PROJECT_USAGE_OPTIONS,
  QUANTITY_UNIT_OPTIONS,
  PHOTO_CATEGORIES,
} from "@/lib/questionnaire-data";
import { BULK_TRUCK_TYPES } from "@/lib/trucks/catalog";
import { buildHandoff, saveHandoff, tripsFromHandoff, type ParcoursHandoff } from "@/lib/parcours/handoff";

export type ParcoursVariant = "reception" | "evacuation";

interface PhotoEntry { url: string; category: string }

interface Draft {
  address: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
  quantityValue: string;
  quantityUnit: string;
  quantityUnknown: boolean;
  projectUsage: string;
  materials: string[];
  otherMaterial: string;
  truckType: string;
  desiredDate: string;
  timeframe: string;
  accessHeavyTruck: string;
  accessDetails: string[];
  photos: PhotoEntry[];
  name: string;
  phone: string;
  email: string;
  notes: string;
}

const emptyDraft: Draft = {
  address: "", postalCode: "", lat: null, lng: null,
  quantityValue: "", quantityUnit: "voyages", quantityUnknown: false,
  projectUsage: "", materials: [], otherMaterial: "", truckType: "",
  desiredDate: "", timeframe: "", accessHeavyTruck: "", accessDetails: [],
  photos: [], name: "", phone: "", email: "", notes: "",
};

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

const ParcoursForm = ({ variant }: { variant: ParcoursVariant }) => {
  const storageKey = `vq_parcours_${variant}_v1`;
  const navigate = useNavigate();
  const { user } = useAuthReady();
  const steps = STEPS[variant];
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<Draft>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...emptyDraft, ...JSON.parse(raw) } : emptyDraft;
    } catch { return emptyDraft; }
  });
  const [uploading, setUploading] = useState(false);
  const [photoCategory, setPhotoCategory] = useState<string>(PHOTO_CATEGORIES[0]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [handoff, setHandoff] = useState<ParcoursHandoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const topRef = useRef<HTMLDivElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Draft>) => setData((d) => ({ ...d, ...patch }));

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* quota */ }
  }, [data, storageKey]);

  useEffect(() => {
    if (index === 0) return;
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [index]);

  const step = steps[index];

  const quantityLabel = useMemo(() => {
    if (data.quantityUnknown || !data.quantityValue.trim()) return "Je ne sais pas";
    const unit = QUANTITY_UNIT_OPTIONS.find((u) => u.value === data.quantityUnit)?.label ?? data.quantityUnit;
    return `${data.quantityValue.trim()} ${unit}`;
  }, [data.quantityValue, data.quantityUnit, data.quantityUnknown]);

  const canContinue = (): boolean => {
    switch (step) {
      case "address": return data.address.trim().length >= 5;
      case "material": return data.materials.length > 0;
      case "contact":
        return (
          data.name.trim().length > 1 &&
          data.phone.replace(/\D/g, "").length >= 10 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())
        );
      default: return true; // quantité, projet, camion, date, accès et photos restent facultatifs
    }
  };

  const toggle = (key: "materials" | "accessDetails", value: string) => {
    const arr = data[key];
    set({ [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] } as Partial<Draft>);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: PhotoEntry[] = [];
      for (const file of Array.from(files).slice(0, 6)) {
        const ext = file.name.split(".").pop();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("lead-photos").upload(path, file);
        if (!upErr) {
          const { data: pub } = supabase.storage.from("lead-photos").getPublicUrl(path);
          added.push({ url: pub.publicUrl, category: photoCategory });
        }
      }
      if (added.length) set({ photos: [...data.photos, ...added] });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("submit-parcours", {
        body: {
          variant,
          address: data.address,
          postal_code: data.postalCode,
          materials: data.materials,
          other_material: data.otherMaterial,
          project_usage: data.projectUsage || null,
          quantity_label: quantityLabel,
          truck_type: data.truckType || null,
          desired_date: data.desiredDate || null,
          timeframe: data.timeframe || null,
          access_heavy_truck: data.accessHeavyTruck || null,
          access_details: data.accessDetails,
          photos: data.photos,
          contact: { name: data.name, phone: data.phone, email: data.email, notes: data.notes },
          website: honeypot.current?.value ?? "",
          form_started_at: startedAt.current,
          attribution: getAttribution(),
        },
      });
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
      setDone(true);
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
                {QUANTITY_UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
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
        return (
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

      case "truck":
        return (
          <div className="grid gap-2">
            {BULK_TRUCK_TYPES.map((t) => (
              <button key={t.key} type="button"
                onClick={() => set({ truckType: data.truckType === t.label ? "" : t.label })}
                className={choiceCls(data.truckType === t.label)}>
                <span className="flex-1">
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
              </button>
            ))}
            <button type="button" onClick={() => set({ truckType: "Je ne sais pas" })}
              className={choiceCls(data.truckType === "Je ne sais pas")}>
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
              {ACCESS_TRUCK_SIMPLE_OPTIONS.map((o) => (
                <button key={o} type="button"
                  onClick={() => set({ accessHeavyTruck: data.accessHeavyTruck === o ? "" : o })}
                  className={choiceCls(data.accessHeavyTruck === o)}>
                  {o}
                </button>
              ))}
            </div>
            {data.accessHeavyTruck && (
              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                {ACCESS_DETAIL_OPTIONS.map((o) => (
                  <button key={o} type="button" onClick={() => toggle("accessDetails", o)}
                    className={choiceCls(data.accessDetails.includes(o))}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-primary text-xs">
                      {data.accessDetails.includes(o) ? "✓" : ""}
                    </span>
                    {o}
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
              {PHOTO_CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => setPhotoCategory(c)}
                  className={`rounded-full border-2 px-3 py-2 font-body text-sm ${
                    photoCategory === c ? "border-primary bg-primary/10 font-semibold text-foreground" : "border-border text-muted-foreground"
                  }`}>
                  {c}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-5 hover:border-primary/50">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              <span className="font-body text-sm font-semibold">
                {uploading ? "Téléversement..." : `Ajouter des photos — ${photoCategory}`}
              </span>
              <input type="file" accept="image/*" multiple capture="environment" className="hidden"
                onChange={(e) => uploadPhotos(e.target.files)} />
            </label>
            {data.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {data.photos.map((p, i) => (
                  <div key={p.url} className="relative">
                    <img src={p.url} alt={p.category} className="h-20 w-full rounded object-cover" />
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
            <input type="email" inputMode="email" value={data.email} onChange={(e) => set({ email: e.target.value })}
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

      <div className="mt-4">{renderStep()}</div>

      <div className="mt-6 flex gap-2">
        {index > 0 && (
          <button type="button" onClick={() => setIndex((i) => i - 1)}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border px-4 py-3.5 font-display text-sm font-bold text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
        )}
        <button
          type="button"
          disabled={!canContinue() || loading}
          onClick={() => (isLast ? void submit() : setIndex((i) => i + 1))}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 font-display text-base font-bold uppercase tracking-wide text-primary-foreground shadow-lg disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isLast ? <Send className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
          {isLast ? "Envoyer ma demande" : "Continuer"}
        </button>
      </div>

      <p className="mt-3 flex items-start gap-1.5 font-body text-xs text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        Vos réponses sont conservées si vous revenez en arrière. Aucun engagement.
      </p>
    </div>
  );
};

export default ParcoursForm;
