// Étapes de l'Assistant intelligent de soumission.
// Interface uniquement : aucune règle métier, aucun calcul de prix.
import { useState } from "react";
import { Loader2, Ruler, Sparkles, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import type {
  AssistantCategory, AssistantMaterial, AssistantRecommendation, AssistantTruck,
} from "@/lib/jsc/assistant";

export const CARD =
  "w-full rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md";
export const CARD_ON = "border-primary ring-2 ring-primary/30 shadow-md";

/* ---------------- Étape 1 — catégorie ou aide ---------------- */
export function StepCategory({
  categories, materials, value, onSelect, onNeedHelp,
}: {
  categories: AssistantCategory[];
  materials: AssistantMaterial[];
  value: string | null;
  onSelect: (id: string) => void;
  onNeedHelp: () => void;
}) {
  const count = (id: string) => materials.filter((m) => m.category_id === id).length;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => onSelect(c.id)}
            className={`${CARD} ${value === c.id ? CARD_ON : ""}`}>
            <p className="font-semibold text-foreground">{c.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.description || `${count(c.id)} option${count(c.id) > 1 ? "s" : ""} disponible${count(c.id) > 1 ? "s" : ""}`}
            </p>
          </button>
        ))}
      </div>
      <button type="button" onClick={onNeedHelp}
        className={`${CARD} flex items-center gap-3 bg-muted/40`}>
        <HelpCircle className="h-5 w-5 shrink-0 text-primary" />
        <span>
          <span className="block font-semibold text-foreground">Je ne sais pas quel matériau choisir</span>
          <span className="block text-sm text-muted-foreground">Répondez à 3 questions, on vous recommande le bon.</span>
        </span>
      </button>
    </div>
  );
}

/* ---------------- Conseiller ---------------- */
const ADVISOR_QUESTIONS = [
  { key: "projet", label: "Quel est votre projet ?", placeholder: "ex. entrée de garage, drainage, aménagement paysager" },
  { key: "surface", label: "Où sera utilisé le matériau ?", placeholder: "ex. sous une dalle, autour d'une piscine, terrain" },
  { key: "contrainte", label: "Une contrainte particulière ?", placeholder: "ex. circulation lourde, esthétique, budget serré" },
];

export function AdvisorPanel({
  onPick, onCancel,
}: {
  onPick: (material: AssistantMaterial) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AssistantRecommendation[] | null>(null);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const { askAdvisor } = await import("@/lib/jsc/assistant");
      const { recommendations } = await askAdvisor(answers);
      setResults(recommendations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conseil indisponible.");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4">
      {!results && (
        <>
          {ADVISOR_QUESTIONS.map((q) => (
            <div key={q.key} className="space-y-1.5">
              <Label htmlFor={`adv-${q.key}`}>{q.label}</Label>
              <Input id={`adv-${q.key}`} placeholder={q.placeholder}
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} />
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={run} disabled={loading || Object.values(answers).every((v) => !v?.trim())}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Obtenir une recommandation
            </Button>
            <Button variant="ghost" onClick={onCancel}>Retour aux catégories</Button>
          </div>
        </>
      )}

      {results && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Nos recommandations pour votre projet</p>
          {results.length === 0 && <p className="text-sm text-muted-foreground">Aucune recommandation disponible pour l'instant.</p>}
          {results.map((r) => (
            <button key={r.material.id} type="button" onClick={() => onPick(r.material)} className={CARD}>
              <p className="font-semibold text-foreground">{r.material.name}</p>
              {r.reason && <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>}
            </button>
          ))}
          <Button variant="ghost" onClick={() => setResults(null)}>Modifier mes réponses</Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Étape 2 — matériau précis ---------------- */
export function StepMaterial({
  materials, value, onSelect,
}: { materials: AssistantMaterial[]; value: string | null; onSelect: (m: AssistantMaterial) => void }) {
  if (!materials.length) {
    return <p className="text-sm text-muted-foreground">Aucun matériau disponible dans cette catégorie pour le moment.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {materials.map((m) => (
        <button key={m.id} type="button" onClick={() => onSelect(m)}
          className={`${CARD} ${value === m.id ? CARD_ON : ""}`}>
          <p className="font-semibold text-foreground">{m.name}{m.code ? ` · ${m.code}` : ""}</p>
          {m.public_description && <p className="mt-1 text-sm text-muted-foreground">{m.public_description}</p>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Étape 3 — quantité ---------------- */
export type QuantityMode = "tonnes" | "voyages" | "volume";
export type DimUnit = "pi" | "po" | "m" | "cm";

/** Conversion géométrique pure (aucune donnée métier) : tout est ramené en mètres. */
export const DIM_UNITS: { value: DimUnit; label: string; toMeters: number }[] = [
  { value: "pi", label: "pieds", toMeters: 0.3048 },
  { value: "po", label: "pouces", toMeters: 0.0254 },
  { value: "m", label: "mètres", toMeters: 1 },
  { value: "cm", label: "centimètres", toMeters: 0.01 },
];

export function dimsToCubicMeters(
  dims: { length: string; width: string; depth: string },
  units: { length: DimUnit; width: DimUnit; depth: DimUnit },
): number {
  const factor = (k: keyof typeof dims) =>
    (DIM_UNITS.find((u) => u.value === units[k])?.toMeters ?? 1) * Number(dims[k] || 0);
  const v = factor("length") * factor("width") * factor("depth");
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function StepQuantity({
  material, mode, setMode, tonnes, setTonnes, dims, setDims,
  dimUnits, setDimUnits, trips, setTrips, truckId, setTruckId, trucks,
}: {
  material: AssistantMaterial | null;
  mode: QuantityMode;
  setMode: (m: QuantityMode) => void;
  tonnes: string;
  setTonnes: (v: string) => void;
  dims: { length: string; width: string; depth: string };
  setDims: (d: { length: string; width: string; depth: string }) => void;
  dimUnits: { length: DimUnit; width: DimUnit; depth: DimUnit };
  setDimUnits: (u: { length: DimUnit; width: DimUnit; depth: DimUnit }) => void;
  trips: string;
  setTrips: (v: string) => void;
  truckId: string | null;
  setTruckId: (v: string) => void;
  trucks: AssistantTruck[];
}) {
  const volume = dimsToCubicMeters(dims, dimUnits);
  const density = material?.density_kg_per_m3 ?? null;
  const approxTonnes = volume > 0 && density ? (volume * density) / 1000 : 0;
  const suggested = approxTonnes > 0
    ? [...trucks].filter((t) => t.capacity_tonnes > 0).sort((a, b) => a.capacity_tonnes - b.capacity_tonnes)
    : [];
  const bestTruck = suggested.find((t) => t.capacity_tonnes >= approxTonnes) ?? suggested[suggested.length - 1];

  const OPTIONS: { value: QuantityMode; label: string }[] = [
    { value: "tonnes", label: "Je connais le nombre de tonnes" },
    { value: "voyages", label: "Je connais le nombre de voyages" },
    { value: "volume", label: "Je connais seulement les dimensions de mon projet" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" onClick={() => setMode(o.value)}
            className={`${CARD} text-sm ${mode === o.value ? CARD_ON : ""}`}>
            <span className="font-medium text-foreground">{o.label}</span>
          </button>
        ))}
      </div>

      {mode === "tonnes" && (
        <div className="space-y-1.5">
          <Label htmlFor="tonnes">Quantité (tonnes métriques)</Label>
          <Input id="tonnes" type="number" min="0.5" step="0.5" inputMode="decimal"
            value={tonnes} onChange={(e) => setTonnes(e.target.value)} placeholder="ex. 20" />
        </div>
      )}

      {mode === "voyages" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="voyages">Nombre de voyages</Label>
            <Input id="voyages" type="number" min="1" step="1" inputMode="numeric" className="max-w-xs"
              value={trips} onChange={(e) => setTrips(e.target.value)} placeholder="ex. 3" />
          </div>
          {trucks.length > 0 ? (
            <div className="space-y-2">
              <Label>Type de camion</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {trucks.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTruckId(t.id)}
                    className={`${CARD} ${truckId === t.id ? CARD_ON : ""}`}>
                    <p className="font-semibold text-foreground">{t.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.truck_type ? `${t.truck_type} · ` : ""}{t.capacity_tonnes} t par voyage
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun camion configuré pour le moment : indiquez plutôt un tonnage ou vos dimensions.
            </p>
          )}
        </div>
      )}

      {mode === "volume" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {([["length", "Longueur"], ["width", "Largeur"], ["depth", "Profondeur"]] as const).map(([k, label]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`dim-${k}`}>{label}</Label>
                <div className="flex gap-2">
                  <Input id={`dim-${k}`} type="number" min="0" step="0.1" inputMode="decimal"
                    value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: e.target.value })} />
                  <select
                    aria-label={`Unité ${label}`}
                    className="rounded-md border border-border bg-background px-2 text-sm text-foreground"
                    value={dimUnits[k]}
                    onChange={(e) => setDimUnits({ ...dimUnits, [k]: e.target.value as DimUnit })}
                  >
                    {DIM_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 text-foreground">
              <Ruler className="h-4 w-4 text-primary" />
              {volume > 0 ? `Volume estimé : ${volume.toFixed(2)} m³` : "Entrez les trois dimensions."}
            </p>
            {approxTonnes > 0 && (
              <p className="mt-1">
                Environ {approxTonnes.toFixed(1)} tonnes pour « {material?.name} »
                {bestTruck ? ` — camion suggéré : ${bestTruck.name} (${bestTruck.capacity_tonnes} t).` : "."}
              </p>
            )}
            <p className="mt-1">
              La conversion officielle est réalisée par notre moteur selon la densité du matériau.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Étape 4 — adresse ---------------- */
export function StepAddress({ address, setAddress }: { address: string; setAddress: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="adresse">Adresse de livraison</Label>
      <GooglePlaceAutocomplete value={address} onChange={setAddress}
        onSelect={(d) => setAddress(d.formattedAddress)}
        placeholder="Numéro, rue, ville, province" />
      <p className="text-sm text-muted-foreground">
        Nous sélectionnons automatiquement la meilleure logistique pour votre secteur. Vous n'avez aucun choix technique à faire.
      </p>
    </div>
  );
}

/* ---------------- Étape 5 — date ---------------- */
export function StepDate({ date, setDate }: { date: string; setDate: (v: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-2">
      <Label htmlFor="date">Date de livraison souhaitée</Label>
      <Input id="date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="max-w-xs" />
      <p className="text-sm text-muted-foreground">L'heure précise sera confirmée avec vous par notre équipe.</p>
    </div>
  );
}

/* ---------------- Étape 6 — coordonnées ---------------- */
export interface ContactState { name: string; phone: string; email: string; company: string; comments: string }

export function StepContact({
  contact, setContact,
}: { contact: ContactState; setContact: (c: ContactState) => void }) {
  const set = (k: keyof ContactState) => (e: { target: { value: string } }) =>
    setContact({ ...contact, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="c-name">Nom complet *</Label>
        <Input id="c-name" value={contact.name} onChange={set("name")} maxLength={160} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-phone">Téléphone *</Label>
        <Input id="c-phone" type="tel" value={contact.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-email">Courriel *</Label>
        <Input id="c-email" type="email" value={contact.email} onChange={set("email")} maxLength={200} autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-company">Entreprise (optionnel)</Label>
        <Input id="c-company" value={contact.company} onChange={set("company")} maxLength={160} autoComplete="organization" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="c-comments">Commentaires (optionnel)</Label>
        <Textarea id="c-comments" rows={3} value={contact.comments} onChange={set("comments")} maxLength={2000}
          placeholder="Accès au chantier, précisions utiles…" />
      </div>
    </div>
  );
}
