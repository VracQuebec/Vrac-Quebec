import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X, Loader2, Truck } from "lucide-react";
import {
  REMBLAI_MATERIAL_OPTIONS,
  REMBLAI_TRUCK_OPTIONS,
  REMBLAI_MACHINERY_OPTIONS,
  REMBLAI_TIMEFRAME_OPTIONS,
  type QuestionnaireData,
} from "@/lib/questionnaire-data";

interface Props {
  data: QuestionnaireData;
  onChange: (updates: Partial<QuestionnaireData>) => void;
  onSubmit: () => void;
  loading: boolean;
}

const Section = ({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="bg-card border-l-4 border-primary rounded-lg shadow-sm p-5 md:p-6">
    <div className="flex items-baseline gap-2 mb-4">
      <span className="text-primary font-display font-bold text-base">
        {number}.
      </span>
      <h3 className="text-base md:text-lg font-display font-bold text-foreground">
        {title}
      </h3>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const inputClass =
  "w-full px-4 py-4 text-base rounded-lg border-2 border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors font-body";

const checkboxRow = (active: boolean) =>
  `flex items-center gap-3 px-4 py-4 rounded-lg border-2 cursor-pointer transition-colors font-body text-base ${
    active
      ? "border-primary bg-primary/5 font-semibold text-foreground"
      : "border-border bg-background text-foreground hover:border-primary/50"
  }`;

const RemblaiForm = ({ data, onChange, onSubmit, loading }: Props) => {
  const [uploading, setUploading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const toggleArr = (key: "materials" | "accessibility" | "machineryList", v: string) => {
    const arr = (data[key] as string[]) || [];
    onChange({
      [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v],
    } as Partial<QuestionnaireData>);
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("lead-photos").upload(path, file);
        if (!error) {
          const { data: pub } = supabase.storage.from("lead-photos").getPublicUrl(path);
          urls.push(pub.publicUrl);
        }
      }
      onChange({ photos: [...(data.photos || []), ...urls] });
    } finally {
      setUploading(false);
    }
  };

  const errors = {
    name: !data.name.trim(),
    phone: !data.phone.trim(),
    email: !data.email.trim(),
    address: !data.address.trim(),
    postalCode: !data.postalCode.trim(),
    materials: data.materials.length === 0,
    quantity: !data.quantity.trim() || Number(data.quantity) <= 0,
    accessibility: data.accessibility.length === 0,
    machineryList: data.machineryList.length === 0,
    deliveryTimeframe: !data.deliveryTimeframe,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = () => {
    setShowErrors(true);
    if (hasErrors) {
      const firstError = document.querySelector("[data-error='true']");
      firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onSubmit();
  };

  const errClass = (isErr: boolean) =>
    showErrors && isErr ? "border-destructive" : "";

  return (
    <div className="max-w-2xl mx-auto px-3 md:px-4 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="text-center py-4">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3 font-display">
          🚧 Demande de remblai
        </div>
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Recevez du remblai rapidement
        </h2>
        <p className="text-muted-foreground mt-2 text-sm md:text-base">
          Remplissez ce formulaire en moins d'une minute
        </p>
      </div>

      {/* Section 1 - Type de demande */}
      <Section number={1} title="Type de demande">
        <div className="px-4 py-4 rounded-lg border-2 border-primary bg-primary/5 font-display font-semibold text-foreground flex items-center gap-2">
          ✅ Je cherche du remblai / remplissage
        </div>
      </Section>

      {/* Section 2 - Coordonnées */}
      <Section number={2} title="Vos coordonnées">
        <div data-error={showErrors && errors.name}>
          <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">
            Nom complet *
          </label>
          <input
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={`${inputClass} ${errClass(errors.name)}`}
            placeholder="Jean Tremblay"
            autoComplete="name"
          />
        </div>
        <div data-error={showErrors && errors.phone}>
          <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">
            Téléphone *
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            className={`${inputClass} ${errClass(errors.phone)}`}
            placeholder="(418) 555-1234"
            autoComplete="tel"
          />
        </div>
        <div data-error={showErrors && errors.email}>
          <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">
            Courriel *
          </label>
          <input
            type="email"
            inputMode="email"
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
            className={`${inputClass} ${errClass(errors.email)}`}
            placeholder="jean@exemple.com"
            autoComplete="email"
          />
        </div>
        <div data-error={showErrors && errors.address}>
          <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">
            Adresse civique *
          </label>
          <input
            value={data.address}
            onChange={(e) => onChange({ address: e.target.value })}
            className={`${inputClass} ${errClass(errors.address)}`}
            placeholder="123 Rue Principale, Québec"
            autoComplete="street-address"
          />
        </div>
        <div data-error={showErrors && errors.postalCode}>
          <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">
            Code postal *
          </label>
          <input
            value={data.postalCode}
            onChange={(e) => onChange({ postalCode: e.target.value })}
            className={`${inputClass} ${errClass(errors.postalCode)}`}
            placeholder="G1A 1A1"
            autoComplete="postal-code"
          />
        </div>
      </Section>

      {/* Section 3 - Type de matériel */}
      <Section number={3} title="Type de matériel souhaité *">
        <div data-error={showErrors && errors.materials} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REMBLAI_MATERIAL_OPTIONS.map((m) => {
            const active = data.materials.includes(m);
            return (
              <label key={m} className={checkboxRow(active)}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleArr("materials", m)}
                  className="w-5 h-5 accent-primary"
                />
                <span>{m}</span>
              </label>
            );
          })}
        </div>
        {data.materials.includes("Autre") && (
          <input
            value={data.otherMaterial}
            onChange={(e) => onChange({ otherMaterial: e.target.value })}
            className={inputClass}
            placeholder="Précisez le matériel..."
          />
        )}
        {showErrors && errors.materials && (
          <p className="text-sm text-destructive font-body">⚠ Sélectionnez au moins un matériel</p>
        )}
      </Section>

      {/* Section 4 - Quantité */}
      <Section number={4} title="Quantité approximative *">
        <div data-error={showErrors && errors.quantity}>
          <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">
            Nombre de voyages désirés
          </label>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={data.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className={`${inputClass} ${errClass(errors.quantity)}`}
            placeholder="Ex : 3"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Indiquez environ combien de voyages de camion vous prévoyez recevoir.
          </p>
        </div>
      </Section>

      {/* Section 5 - Accessibilité */}
      <Section number={5} title="Accessibilité du terrain *">
        <p className="text-sm text-muted-foreground mb-2">
          Cochez tous les types de camions qui peuvent accéder au terrain.
        </p>
        <div data-error={showErrors && errors.accessibility} className="grid grid-cols-1 gap-2">
          {REMBLAI_TRUCK_OPTIONS.map((t) => {
            const active = data.accessibility.includes(t);
            return (
              <label key={t} className={checkboxRow(active)}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleArr("accessibility", t)}
                  className="w-5 h-5 accent-primary"
                />
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span>{t}</span>
              </label>
            );
          })}
        </div>
        {showErrors && errors.accessibility && (
          <p className="text-sm text-destructive font-body">⚠ Sélectionnez au moins une option</p>
        )}
      </Section>

      {/* Section 6 - Machinerie disponible */}
      <Section number={6} title="Machinerie disponible sur place *">
        <div data-error={showErrors && errors.machineryList} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REMBLAI_MACHINERY_OPTIONS.map((m) => {
            const active = data.machineryList.includes(m);
            return (
              <label key={m} className={checkboxRow(active)}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleArr("machineryList", m)}
                  className="w-5 h-5 accent-primary"
                />
                <span>{m}</span>
              </label>
            );
          })}
        </div>
        {data.machineryList.includes("Autre") && (
          <input
            value={data.machineryDescription}
            onChange={(e) => onChange({ machineryDescription: e.target.value })}
            className={inputClass}
            placeholder="Précisez la machinerie..."
          />
        )}
        {showErrors && errors.machineryList && (
          <p className="text-sm text-destructive font-body">⚠ Sélectionnez au moins une option</p>
        )}
      </Section>

      {/* Section 7 - Délai souhaité */}
      <Section number={7} title="Délai souhaité *">
        <div data-error={showErrors && errors.deliveryTimeframe} className="grid grid-cols-1 gap-2">
          {REMBLAI_TIMEFRAME_OPTIONS.map((t) => {
            const active = data.deliveryTimeframe === t;
            return (
              <label key={t} className={checkboxRow(active)}>
                <input
                  type="radio"
                  name="timeframe"
                  checked={active}
                  onChange={() => onChange({ deliveryTimeframe: t })}
                  className="w-5 h-5 accent-primary"
                />
                <span>{t}</span>
              </label>
            );
          })}
        </div>
        {showErrors && errors.deliveryTimeframe && (
          <p className="text-sm text-destructive font-body">⚠ Sélectionnez un délai</p>
        )}
      </Section>

      {/* Section 8 - Photos */}
      <Section number={8} title="Photos de l'emplacement (optionnel)">
        <label className="flex items-center justify-center gap-2 px-4 py-5 rounded-lg border-2 border-dashed border-border bg-background cursor-pointer hover:border-primary/50 transition-colors">
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          <span className="text-sm font-body font-semibold">
            {uploading ? "Téléversement..." : "📷 Ajouter des photos"}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handlePhotoUpload(e.target.files)}
          />
        </label>
        {data.photos && data.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {data.photos.map((url, i) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="w-full h-20 object-cover rounded" />
                <button
                  type="button"
                  onClick={() => onChange({ photos: data.photos.filter((_, j) => j !== i) })}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground/80 text-background flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Section 9 - Commentaires */}
      <Section number={9} title="Commentaires / précisions (optionnel)">
        <textarea
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className={`${inputClass} resize-none`}
          rows={4}
          placeholder="Ex : portail étroit, présence de fils électriques, etc."
        />
      </Section>

      {/* Submit */}
      {showErrors && hasErrors && (
        <div className="bg-destructive/10 border border-destructive text-destructive rounded-lg p-4 text-sm font-body text-center">
          ⚠ Veuillez remplir tous les champs obligatoires avant d'envoyer.
        </div>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-6 py-5 rounded-xl bg-primary text-primary-foreground font-display font-bold text-lg shadow-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>🚛</span>}
        {loading ? "Envoi en cours..." : "Envoyer ma demande"}
      </button>
      <p className="text-center text-xs text-muted-foreground pb-6">
        Réponse rapide • Aucun engagement • Service Vrac Québec
      </p>
    </div>
  );
};

export default RemblaiForm;