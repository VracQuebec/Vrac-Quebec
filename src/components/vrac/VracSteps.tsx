// ============================================================
// Étapes du parcours « Acheter du matériel en vrac » — interface seulement.
// Aucun calcul de prix, aucune règle de transport, aucun fournisseur.
// ============================================================
import { cloneElement, isValidElement, useId } from "react";
import { Check, CalendarDays, CheckCircle2, HelpCircle, Info, MapPin, Ruler, Truck, Weight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import type { VracDraft, VracMaterial } from "@/lib/vrac/catalog";

type Setter = (patch: Partial<VracDraft>) => void;

/* ---------------------- Étape 1 — Matériau ---------------------- */
export function StepMaterial({
  materials, value, onSelect,
}: { materials: VracMaterial[]; value: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {materials.map((m) => {
        const active = value === m.id;
        const tagline = m.uses.slice(0, 2).join(" • ");
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(m.id)}
            className={`group relative flex min-h-[84px] w-full items-center gap-4 overflow-hidden rounded-2xl border bg-card p-4 text-left transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              active
                ? "border-[3px] border-primary bg-primary/[0.05] shadow-sm"
                : "border-border hover:border-primary/40 hover:shadow-sm"
            }`}
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              <img
                src={m.image}
                alt={m.name}
                loading="lazy"
                width={256}
                height={256}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
              />
            </div>
            <div className="min-w-0 flex-1 pr-7">
              <h3 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">{m.name}</h3>
              <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{tagline}</p>
            </div>
            <span
              aria-hidden
              className={`absolute right-3.5 top-3.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-300 ${
                active ? "scale-100 opacity-100" : "scale-75 opacity-0"
              }`}
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
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
  const tonnesValue = Number(draft.tonnes);
  const tripsValue = Number(draft.trips);
  const dimError = (v: string) => (v.trim() !== "" && !(Number(v) > 0) ? "Entrez un nombre supérieur à 0." : undefined);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map(({ key, label, hint, icon: Icon }) => {
          const active = draft.quantityMode === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => set({ quantityMode: key })}
              className={`min-h-11 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
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
        <Field
          label="Quantité approximative (tonnes)"
          hint="Une approximation suffit : notre équipe valide la quantité avec vous."
          error={draft.tonnes.trim() !== "" && !(tonnesValue > 0) ? "Entrez un nombre de tonnes supérieur à 0." : undefined}
        >
          <Input inputMode="decimal" placeholder="ex. 12" value={draft.tonnes}
            onChange={(e) => set({ tonnes: e.target.value })} />
        </Field>
      )}

      {draft.quantityMode === "voyages" && (
        <div className="space-y-4">
          <Field
            label="Nombre de voyages souhaités"
            error={draft.trips.trim() !== "" && !(tripsValue > 0) ? "Entrez un nombre de voyages supérieur à 0." : undefined}
          >
            <Input inputMode="numeric" placeholder="ex. 2" value={draft.trips}
              onChange={(e) => set({ trips: e.target.value })} />
          </Field>
          <Notice>
            Le nombre de tonnes dépend du camion retenu. Nous confirmons la quantité exacte avec vous;
            votre demande est transmise à notre équipe sans estimation automatique.
          </Notice>
        </div>
      )}

      {draft.quantityMode === "dimensions" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Longueur (pi)" error={dimError(draft.dims.length)}>
              <Input inputMode="decimal" placeholder="ex. 30" value={draft.dims.length}
                onChange={(e) => set({ dims: { ...draft.dims, length: e.target.value } })} />
            </Field>
            <Field label="Largeur (pi)" error={dimError(draft.dims.width)}>
              <Input inputMode="decimal" placeholder="ex. 20" value={draft.dims.width}
                onChange={(e) => set({ dims: { ...draft.dims, width: e.target.value } })} />
            </Field>
            <Field label="Épaisseur (po)" error={dimError(draft.dims.depth)}>
              <Input inputMode="decimal" placeholder="ex. 4" value={draft.dims.depth}
                onChange={(e) => set({ dims: { ...draft.dims, depth: e.target.value } })} />
            </Field>
          </div>
          <Notice>Nous convertissons ces dimensions en tonnes pour vous : aucun calcul de votre part.</Notice>
        </div>
      )}

      {draft.quantityMode === "inconnu" && (
        <Notice>
          Aucun souci : décrivez simplement votre projet à l'étape des coordonnées. Notre équipe
          détermine la quantité exacte, puis vous transmet votre estimation.
        </Notice>
      )}
    </div>
  );
}

/* ---------------------- Étape 3 — Livraison ---------------------- */
export function StepDelivery({ draft, set }: { draft: VracDraft; set: Setter }) {
  const address = draft.address.trim();
  const validated = draft.addressLat != null && draft.addressLng != null;
  return (
    <div className="space-y-5">
      <Field
        label="Adresse de livraison"
        icon={<MapPin className="h-4 w-4 text-primary" aria-hidden />}
        hint={validated ? undefined : "Commencez à écrire, puis choisissez une adresse proposée par Google."}
        error={!validated && address.length > 2 ? "Sélectionnez une adresse proposée par Google pour valider la localisation." : undefined}
      >
        <GooglePlaceAutocomplete
          value={draft.address}
          placeholder="123 rue Principale, Québec, QC"
          className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onChange={(val) => set({ address: val, addressLat: null, addressLng: null, addressPlaceId: null })}
          onSelect={(p) =>
            set({
              address: p.formattedAddress,
              addressLat: p.lat ?? null,
              addressLng: p.lng ?? null,
              addressPlaceId: p.placeId || null,
            })
          }
        />
      </Field>
      {validated && (
        <p className="-mt-3 flex items-center gap-2 text-sm font-medium text-primary" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Adresse validée
        </p>
      )}
      <Field label="Précisions d'accès (optionnel)">
        <Textarea rows={3} placeholder="Accès par la cour arrière, portail étroit, etc."
          value={draft.addressNotes} onChange={(e) => set({ addressNotes: e.target.value })} />
      </Field>
      <DeliveryDateNotice />
    </div>
  );
}

/* ------------- Encadré informatif — date de livraison ------------- */
export function DeliveryDateNotice() {
  return (
    <div className="flex gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-foreground">Date de livraison</p>
        <p className="mt-1 text-sm text-muted-foreground">
          La date de livraison sera confirmée avec vous par notre équipe après réception de votre demande.
          Nous communiquerons avec vous rapidement afin de planifier la livraison selon nos disponibilités.
        </p>
      </div>
    </div>
  );
}

/* ---------------------- Étape 5 — Coordonnées ---------------------- */
export function StepContact({ draft, set }: { draft: VracDraft; set: Setter }) {
  const c = draft.contact;
  const patch = (p: Partial<VracDraft["contact"]>) => set({ contact: { ...c, ...p } });
  const phoneDigits = c.phone.replace(/\D/g, "");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim());
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field
        label="Nom complet"
        error={c.name.trim().length > 0 && c.name.trim().length < 2 ? "Entrez votre nom complet." : undefined}
      >
        <Input value={c.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Votre nom" autoComplete="name" />
      </Field>
      <Field
        label="Téléphone"
        hint="Pour confirmer la livraison avec vous."
        error={phoneDigits.length > 0 && phoneDigits.length < 10 ? "Entrez un numéro à 10 chiffres." : undefined}
      >
        <Input value={c.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="(581) 000-0000" inputMode="tel" autoComplete="tel" />
      </Field>
      <Field
        label="Courriel"
        hint="Votre soumission vous est envoyée à cette adresse."
        error={c.email.trim().length > 0 && !emailOk ? "Entrez une adresse courriel valide." : undefined}
      >
        <Input value={c.email} onChange={(e) => patch({ email: e.target.value })} placeholder="vous@exemple.com" inputMode="email" type="email" autoComplete="email" />
      </Field>
      <Field label="Entreprise (optionnel)">
        <Input value={c.company} onChange={(e) => patch({ company: e.target.value })} placeholder="Nom de l'entreprise" autoComplete="organization" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Détails de votre projet (optionnel)">
          <Textarea rows={3} value={c.comments} onChange={(e) => patch({ comments: e.target.value })}
            placeholder="Décrivez brièvement vos travaux." />
        </Field>
      </div>
    </div>
  );
}

/** Encadré informatif neutre, ton Vrac Québec. */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Field({
  label, icon, hint, error, children,
}: {
  label: string; icon?: React.ReactNode; hint?: string; error?: string; children: React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        className: `${(children.props as { className?: string }).className ?? ""} ${
          error ? "border-destructive focus-visible:ring-destructive" : ""
        }`.trim() || undefined,
      })
    : children;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-foreground">{icon}{label}</Label>
      {control}
      {hint && !error && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
