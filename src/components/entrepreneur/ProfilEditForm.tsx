// ============================================================
// « MODIFIER MON PROFIL » — édition contrôlée, mobile-first.
// Seule la fiche du compte connecté peut être modifiée (RLS).
// ============================================================
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const set = (k: keyof ProfilEdits, v: string | string[]) =>
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
    const res = await saveMyProfil(form);
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
    key: Exclude<keyof ProfilEdits, "truck_types">,
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
      {field("address", "Adresse", "Visible par vous seulement.")}

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
