// ============================================================
// Étapes du parcours « Acheter du matériel en vrac » — interface seulement.
// Aucun calcul de prix, aucune règle de transport, aucun fournisseur.
// ============================================================
import { Check, CalendarDays, Clock, HelpCircle, MapPin, Ruler, Truck, Weight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { VracDraft, VracMaterial } from "@/lib/vrac/catalog";

type Setter = (patch: Partial<VracDraft>) => void;

/* ---------------------- Étape 1 — Matériau ---------------------- */
export function StepMaterial({
  materials, value, onSelect,
}: { materials: VracMaterial[]; value: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {materials.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(m.id)}
            className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              active
                ? "border-[3px] border-primary shadow-lg -translate-y-0.5"
                : "border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            }`}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
              <img
                src={m.image}
                alt={m.name}
                loading="lazy"
                width={1024}
                height={1024}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              {active && (
                <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="font-semibold leading-tight text-foreground">{m.name}</h3>
              <p className="text-sm leading-snug text-muted-foreground">{m.description}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {m.uses.map((u) => (
                  <span key={u} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {u}
                  </span>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------- Étape 2 — Quantité ---------------------- */
const MODES = [
  { key: "tonnes", label: "En tonnes", hint: "Je connais le tonnage", icon: Weight },
  { key: "voyages", label: "En voyages", hint: "Je connais le nombre de voyages", icon: Truck },
  { key: "dimensions", label: "Par dimensions", hint: "Longueur × largeur × épaisseur", icon: Ruler },
  { key: "inconnu", label: "Je ne sais pas", hint: "Notre équipe évalue pour vous", icon: HelpCircle },
] as const;

export function StepQuantity({ draft, set }: { draft: VracDraft; set: Setter }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MODES.map(({ key, label, hint, icon: Icon }) => {
          const active = draft.quantityMode === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => set({ quantityMode: key })}
              className={`rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                active ? "border-[3px] border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:shadow-sm"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <p className="mt-2 text-sm font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </button>
          );
        })}
      </div>

      {draft.quantityMode === "tonnes" && (
        <Field label="Quantité approximative (tonnes)">
          <Input inputMode="decimal" placeholder="ex. 12" value={draft.tonnes}
            onChange={(e) => set({ tonnes: e.target.value })} />
        </Field>
      )}

      {draft.quantityMode === "voyages" && (
        <Field label="Nombre de voyages souhaités">
          <Input inputMode="numeric" placeholder="ex. 2" value={draft.trips}
            onChange={(e) => set({ trips: e.target.value })} />
        </Field>
      )}

      {draft.quantityMode === "dimensions" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Longueur (pi)">
            <Input inputMode="decimal" placeholder="ex. 30" value={draft.dims.length}
              onChange={(e) => set({ dims: { ...draft.dims, length: e.target.value } })} />
          </Field>
          <Field label="Largeur (pi)">
            <Input inputMode="decimal" placeholder="ex. 20" value={draft.dims.width}
              onChange={(e) => set({ dims: { ...draft.dims, width: e.target.value } })} />
          </Field>
          <Field label="Épaisseur (po)">
            <Input inputMode="decimal" placeholder="ex. 4" value={draft.dims.depth}
              onChange={(e) => set({ dims: { ...draft.dims, depth: e.target.value } })} />
          </Field>
        </div>
      )}

      {draft.quantityMode === "inconnu" && (
        <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
          Aucun souci : décrivez simplement votre projet à l'étape des coordonnées, nous déterminerons la quantité exacte pour vous.
        </p>
      )}
    </div>
  );
}

/* ---------------------- Étape 3 — Livraison ---------------------- */
export function StepDelivery({ draft, set }: { draft: VracDraft; set: Setter }) {
  return (
    <div className="space-y-5">
      <Field label="Adresse de livraison" icon={<MapPin className="h-4 w-4 text-primary" />}>
        <Input placeholder="123 rue Principale, Québec, QC" value={draft.address}
          onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <Field label="Précisions d'accès (optionnel)">
        <Textarea rows={3} placeholder="Accès par la cour arrière, portail étroit, etc."
          value={draft.addressNotes} onChange={(e) => set({ addressNotes: e.target.value })} />
      </Field>
    </div>
  );
}

/* ---------------------- Étape 4 — Date ---------------------- */
const DATE_MODES = [
  { key: "precise", label: "Date précise", icon: CalendarDays },
  { key: "flexible", label: "Je suis flexible", icon: Clock },
  { key: "urgent", label: "Le plus tôt possible", icon: Truck },
] as const;

export function StepDate({ draft, set }: { draft: VracDraft; set: Setter }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {DATE_MODES.map(({ key, label, icon: Icon }) => {
          const active = draft.dateMode === key;
          return (
            <button key={key} type="button" aria-pressed={active}
              onClick={() => set({ dateMode: key, date: key === "precise" ? draft.date : "" })}
              className={`flex items-center gap-2 rounded-2xl border p-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                active ? "border-[3px] border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}>
              <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
              {label}
            </button>
          );
        })}
      </div>
      {draft.dateMode === "precise" && (
        <Field label="Date souhaitée">
          <Input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

/* ---------------------- Étape 5 — Coordonnées ---------------------- */
export function StepContact({ draft, set }: { draft: VracDraft; set: Setter }) {
  const c = draft.contact;
  const patch = (p: Partial<VracDraft["contact"]>) => set({ contact: { ...c, ...p } });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Nom complet"><Input value={c.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Votre nom" /></Field>
      <Field label="Téléphone"><Input value={c.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="(581) 000-0000" inputMode="tel" /></Field>
      <Field label="Courriel"><Input value={c.email} onChange={(e) => patch({ email: e.target.value })} placeholder="vous@exemple.com" inputMode="email" /></Field>
      <Field label="Entreprise (optionnel)"><Input value={c.company} onChange={(e) => patch({ company: e.target.value })} placeholder="Nom de l'entreprise" /></Field>
      <div className="sm:col-span-2">
        <Field label="Détails de votre projet (optionnel)">
          <Textarea rows={3} value={c.comments} onChange={(e) => patch({ comments: e.target.value })}
            placeholder="Décrivez brièvement vos travaux." />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-medium text-foreground">{icon}{label}</Label>
      {children}
    </div>
  );
}
