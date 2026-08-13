// ============================================================
// « MODIFIER MON PROFIL » — édition contrôlée, mobile-first.
// Seule la fiche du compte connecté peut être modifiée (RLS).
// ============================================================
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import {
  normalizeAddress,
  normalizePlaceSelection,
  localisationLabel,
  type Localisation,
} from "@/lib/parcours/localisation";
import {
  MAX_LEN,
  TRUCK_TYPE_OPTIONS,
  saveMyProfil,
  validateProfilEdits,
  type ProfilEdits,
  type ProfilErrors,
} from "@/lib/parcours/profil";

interface Props {
  initial: ProfilEdits;
  onCancel: () => void;
  onSaved: () => void;
}

export default function ProfilEditForm({ initial, onCancel, onSaved }: Props) {
  const [form, setForm] = useState<ProfilEdits>(initial);
  const [errors, setErrors] = useState<ProfilErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Autocomplétion : activée uniquement si Google Maps est réellement chargeable.
  const [placesReady, setPlacesReady] = useState(false);
  const [reco, setReco] = useState<Localisation | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => { if (!cancelled) setPlacesReady(true); })
      .catch(() => { if (!cancelled) setPlacesReady(false); });
    return () => { cancelled = true; };
  }, []);

  const set = (k: keyof ProfilEdits, v: string | string[] | boolean) =>
    setForm((prev) => ({ ...prev, [k]: v }) as ProfilEdits);

  const toggleTruck = (t: string) =>
    setForm((prev) => ({
      ...prev,
      truck_types: prev.truck_types.includes(t)
        ? prev.truck_types.filter((x) => x !== t)
        : [...prev.truck_types, t],
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const next = validateProfilEdits(form);
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    // `reco` = localisation issue d'une sélection Google Places structurée.
    const res = await saveMyProfil(form, undefined, reco);
    setSaving(false);
    if (res.state === "ok") { onSaved(); return; }
    if (res.state === "invalid") { setErrors(res.errors); return; }
    setFailure(
      res.state === "unauthorized"
        ? "Votre session a expiré. Reconnectez-vous pour enregistrer."
        : res.message,
    );
  };

  const field = (
    key: Exclude<keyof ProfilEdits, "truck_types" | "is_network_visible">,
    label: string,
    hint?: string,
  ) => (
    <div>
      <Label htmlFor={`profil-${key}`} className="font-body text-xs">{label}</Label>
      <Input
        id={`profil-${key}`}
        value={form[key]}
        maxLength={MAX_LEN[key]}
        inputMode={key === "truck_count" ? "numeric" : undefined}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={!!errors[key]}
        className="mt-1 h-11"
      />
      {errors[key] ? (
        <p className="mt-1 font-body text-xs text-destructive">{errors[key]}</p>
      ) : hint ? (
        <p className="mt-1 font-body text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Modifier mon profil">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("company", "Entreprise *")}
        {field("contact_name", "Personne-ressource")}
        {field("phone", "Téléphone", "Format : 418-555-1234")}
        {field("truck_count", "Nombre de camions")}
      </div>

      <div>
        <Label htmlFor="profil-address" className="font-body text-xs">Adresse</Label>
        {placesReady ? (
          <GooglePlaceAutocomplete
            value={form.address}
            onChange={(v) => { set("address", v); setReco(null); }}
            placeholder="Commencez à taper votre adresse…"
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 font-body text-sm"
            onSelect={(d) => {
              const addr = d.formattedAddress.slice(0, MAX_LEN.address);
              set("address", addr);
              setReco(normalizePlaceSelection(d.components, addr));
            }}
          />
        ) : (
          <Input
            id="profil-address"
            value={form.address}
            maxLength={MAX_LEN.address}
            onChange={(e) => { set("address", e.target.value); setReco(null); }}
            aria-invalid={!!errors.address}
            className="mt-1 h-11"
          />
        )}
        {errors.address ? (
          <p className="mt-1 font-body text-xs text-destructive">{errors.address}</p>
        ) : (
          <p className="mt-1 font-body text-[11px] text-muted-foreground">
            Visible par vous seulement.
            {placesReady ? " Sélectionnez une suggestion pour une localisation fiable." : ""}
          </p>
        )}
        {(() => {
          const loc = reco ?? (form.address.trim() ? normalizeAddress(form.address) : null);
          if (!loc) return null;
          const label = localisationLabel(loc);
          return (
            <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="font-body text-[11px] text-muted-foreground">
                Localisation reconnue :{" "}
                <span className="font-semibold text-foreground">{label ?? "non déterminée"}</span>
                {loc.region ? ` · ${loc.region}` : ""}
              </p>
              <p className="mt-1 font-body text-[11px] text-muted-foreground">{loc.message}</p>
              {reco ? (
                <button
                  type="button"
                  onClick={() => { set("address", ""); setReco(null); }}
                  className="mt-2 font-body text-[11px] font-semibold text-primary underline"
                >
                  Reprendre la saisie
                </button>
              ) : null}
            </div>
          );
        })()}
      </div>

      <fieldset>
        <legend className="font-body text-xs">Types de camions</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from(new Set([...TRUCK_TYPE_OPTIONS, ...form.truck_types])).map((t) => {
            const on = form.truck_types.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTruck(t)}
                className={`rounded-full border px-3 py-2 font-body text-xs transition-colors ${
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        {errors.truck_types ? (
          <p className="mt-1 font-body text-xs text-destructive">{errors.truck_types}</p>
        ) : null}
      </fieldset>

      {failure ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 font-body text-xs text-destructive">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={saving} className="h-11 sm:w-auto">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Enregistrer
        </Button>
        <Button type="button" variant="outline" className="h-11 sm:w-auto" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
      </div>

      <p className="font-body text-[11px] text-muted-foreground">
        Vos informations administratives (courriel, facturation, taxes, notes internes) ne sont pas
        modifiables ici et ne sont jamais partagées.
      </p>
    </form>
  );
}
