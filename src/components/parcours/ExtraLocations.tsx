import { Check, MapPin, Plus, Trash2 } from "lucide-react";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import { Button } from "@/components/ui/button";
import { REMBLAI_MATERIAL_CATEGORIES } from "@/lib/questionnaire-data";
import { SELECTABLE_QUANTITY_UNITS } from "@/lib/parcours/normalisation";
import { MAX_LOCATIONS, locationLetter, newLocation, type LocationDraft } from "@/lib/parcours/multi-sites";

const VEHICLES = ["Camion 6 roues", "Camion 10 roues", "Camion 12 roues", "Semi-remorque 2 essieux", "Semi-remorque 3 essieux", "Semi-remorque 4 essieux"];
const ALL_MATERIALS = REMBLAI_MATERIAL_CATEGORIES.flatMap((c) => c.materials);
const field = "w-full min-h-11 rounded-lg border border-input bg-background px-3 py-2 font-body text-sm";

interface Props { items: LocationDraft[]; onChange: (items: LocationDraft[]) => void; errors: Record<string, string> }

/** Emplacements B, C… (A = adresse principale du formulaire). Contact jamais redemandé. */
export default function ExtraLocations({ items, onChange, errors }: Props) {
  const upd = (key: string, patch: Partial<LocationDraft>) => onChange(items.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const canAdd = items.length + 1 < MAX_LOCATIONS;
  return (
    <section aria-labelledby="extra-loc" className="space-y-3 border-t border-border pt-4">
      <h3 id="extra-loc" className="font-display text-base font-semibold">Où souhaitez-vous recevoir du remblai ?</h3>
      <p className="font-body text-sm text-muted-foreground">
        L’adresse ci-dessus est l’emplacement A. Facultatif : ajoutez d’autres adresses (maximum {MAX_LOCATIONS} au total). Chacune aura sa propre fiche.
      </p>
      {items.map((l, i) => (
        <div key={l.key} className="space-y-3 rounded-xl border border-border bg-card p-4" data-testid={`loc-${locationLetter(i + 1)}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-display text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" aria-hidden />Emplacement {locationLetter(i + 1)}</p>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onChange(items.filter((x) => x.key !== l.key))}>
              <Trash2 className="mr-1 h-4 w-4" aria-hidden />Retirer
            </Button>
          </div>
          <GooglePlaceAutocomplete value={l.address} className={field} placeholder="Adresse complète du chantier"
            onChange={(v) => upd(l.key, { address: v, lat: null, lng: null, geocoded: false })}
            onSelect={(p) => upd(l.key, { address: p.formattedAddress, lat: p.lat ?? null, lng: p.lng ?? null, geocoded: p.lat != null && p.lng != null })} />
          {l.geocoded && <p className="flex items-center gap-1.5 text-sm font-semibold text-primary"><Check className="h-4 w-4" aria-hidden />Adresse validée</p>}
          <fieldset><legend className="mb-2 text-sm font-semibold">Matériaux recherchés</legend>
            <div className="grid gap-2 sm:grid-cols-2">{ALL_MATERIALS.map((m) => (
              <label key={m} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                <input type="checkbox" checked={l.materials.includes(m)} onChange={() => upd(l.key, { materials: toggle(l.materials, m) })} />{m}
              </label>))}</div>
          </fieldset>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input inputMode="decimal" aria-label={`Quantité emplacement ${locationLetter(i + 1)}`} placeholder="Quantité (facultatif)" className={field}
              value={l.quantityValue} onChange={(e) => upd(l.key, { quantityValue: e.target.value })} />
            <select aria-label="Unité" className={field} value={l.quantityUnit} onChange={(e) => upd(l.key, { quantityUnit: e.target.value })}>
              {SELECTABLE_QUANTITY_UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
            </select>
          </div>
          <fieldset><legend className="mb-2 text-sm font-semibold">Quels types de camions peuvent accéder à ce terrain ?</legend>
            <div className="grid gap-2 sm:grid-cols-2">{VEHICLES.map((v) => (
              <label key={v} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                <input type="checkbox" checked={l.vehicles.includes(v)} onChange={() => upd(l.key, { vehicles: toggle(l.vehicles, v) })} />{v}
              </label>))}</div>
          </fieldset>
          <textarea className={field} rows={2} maxLength={1000} placeholder="Conditions, consignes ou contraintes propres à cet emplacement"
            value={l.notes} onChange={(e) => upd(l.key, { notes: e.target.value })} />
          {errors[l.key] && <p role="alert" className="text-sm font-semibold text-destructive">{errors[l.key]}</p>}
        </div>
      ))}
      <Button type="button" variant="outline" className="min-h-11" disabled={!canAdd}
        onClick={() => onChange([...items, newLocation(crypto.randomUUID())])}>
        <Plus className="mr-1 h-4 w-4" aria-hidden />Ajouter une adresse
      </Button>
      {!canAdd && <p className="text-sm text-muted-foreground">Maximum de {MAX_LOCATIONS} adresses atteint.</p>}
    </section>
  );
}
