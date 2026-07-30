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
  AssistantCategory, AssistantMaterial, AssistantRecommendation,
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
export function StepQuantity({
  material, mode, setMode, tonnes, setTonnes, dims, setDims,
}: {
  material: AssistantMaterial | null;
  mode: "tonnes" | "volume";
  setMode: (m: "tonnes" | "volume") => void;
  tonnes: string;
  setTonnes: (v: string) => void;
  dims: { length: string; width: string; depth: string };
  setDims: (d: { length: string; width: string; depth: string }) => void;
}) {
  const volume = ["length", "width", "depth"].every((k) => Number(dims[k as keyof typeof dims]) > 0)
    ? Number(dims.length) * Number(dims.width) * Number(dims.depth)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant={mode === "tonnes" ? "default" : "outline"} onClick={() => setMode("tonnes")}>
          Je connais le tonnage
        </Button>
        <Button type="button" variant={mode === "volume" ? "default" : "outline"} onClick={() => setMode("volume")}>
          <Ruler className="mr-2 h-4 w-4" /> Calculer par dimensions
        </Button>
      </div>

      {mode === "tonnes" ? (
        <div className="space-y-1.5">
          <Label htmlFor="tonnes">Quantité (tonnes métriques)</Label>
          <Input id="tonnes" type="number" min="0.5" step="0.5" inputMode="decimal"
            value={tonnes} onChange={(e) => setTonnes(e.target.value)} placeholder="ex. 20" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {([["length", "Longueur (m)"], ["width", "Largeur (m)"], ["depth", "Profondeur (m)"]] as const).map(([k, label]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`dim-${k}`}>{label}</Label>
                <Input id={`dim-${k}`} type="number" min="0" step="0.1" inputMode="decimal"
                  value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {volume > 0
              ? `Volume estimé : ${volume.toFixed(2)} m³. La conversion en tonnes est réalisée par notre moteur selon la densité du matériau${material ? ` « ${material.name} »` : ""}.`
              : "Entrez les trois dimensions pour calculer le volume."}
          </p>
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
