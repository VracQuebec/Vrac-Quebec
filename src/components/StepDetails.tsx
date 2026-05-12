import {
  PROJECT_TYPES,
  PROJECT_SIZES,
  TRUCK_ACCESS_OPTIONS,
  CONTAMINATION_OPTIONS,
  DELIVER_OR_REMOVE_OPTIONS,
  DELIVERY_FLEXIBILITY_OPTIONS,
  MATERIAL_TYPES,
  isRemblaiRequest,
  type QuestionnaireData,
} from "@/lib/questionnaire-data";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";

interface Props {
  data: QuestionnaireData;
  onChange: (updates: Partial<QuestionnaireData>) => void;
}

const StepDetails = ({ data, onChange }: Props) => {
  const [uploading, setUploading] = useState(false);
  const isRemblai = isRemblaiRequest(data.materials, data.propertyType);
  const selectedMaterialLabels = data.materials
    .filter((id) => id !== "autre" && id !== "ne-sais-pas")
    .map((id) => ({
      id,
      label: MATERIAL_TYPES.find((m) => m.id === id)?.label || id,
    }));

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

  const labelClass = "block text-sm font-semibold text-foreground mb-2 font-display";
  const inputClass =
    "w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow font-body";

  const optionBtn = (active: boolean) =>
    `w-full text-left px-4 py-3 rounded-lg border-2 transition-all font-body text-sm ${
      active
        ? "border-primary bg-primary/5 text-foreground font-semibold"
        : "border-border bg-card text-foreground hover:border-primary/50"
    }`;

  const handleBudgetChange = (value: string) => {
    onChange({ budgetMax: value.replace(/[^0-9]/g, "") });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full mb-3 font-display">
          <span>⏱️</span>
          Estimation rapide — aucun engagement
        </div>
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Détails de votre projet
        </h2>
        <p className="text-muted-foreground mt-2">
          Répondez à quelques questions simples (30 secondes)
        </p>
      </div>

      <div>
        <label className={labelClass}>Quel est votre projet ?</label>
        <div className="grid grid-cols-1 gap-2">
          {PROJECT_TYPES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange({ propertyType: p.value })}
              className={`${optionBtn(data.propertyType === p.value)} !py-3`}
            >
              <div className="flex items-center gap-3">
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.value}
                    loading="lazy"
                    width={512}
                    height={512}
                    className="w-14 h-14 object-cover rounded shrink-0"
                  />
                ) : (
                  <span className="text-2xl w-14 text-center shrink-0">{p.emoji}</span>
                )}
                <span>{p.value}</span>
              </div>
            </button>
          ))}
        </div>
        {data.propertyType === "Autre" && (
          <input
            value={data.projectDescription}
            onChange={(e) => onChange({ projectDescription: e.target.value })}
            className={`${inputClass} mt-3`}
            placeholder="Décrivez votre projet"
          />
        )}
      </div>

      <div>
        <label className={labelClass}>Quelle est la taille de votre projet ?</label>
        <div className="grid grid-cols-1 gap-2">
          {PROJECT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ quantity: s })}
              className={optionBtn(data.quantity === s)}
            >
              {s}
            </button>
          ))}
        </div>
        {data.quantity === "Autre" && (
          <input
            value={data.quantityOther}
            onChange={(e) => onChange({ quantityOther: e.target.value })}
            className={`${inputClass} mt-3`}
            placeholder="Nombre de voyages ou quantité estimée"
          />
        )}
      </div>

      {selectedMaterialLabels.length > 0 && (
        <div>
          <label className={labelClass}>Quantité désirée pour chaque matériau</label>
          <div className="space-y-4">
            {selectedMaterialLabels.map((m) => (
              <div key={m.id}>
                <label className="block text-base font-bold text-foreground mb-2 font-display">
                  {m.label}
                </label>
                <input
                  value={data.materialQuantities?.[m.id] || ""}
                  onChange={(e) =>
                    onChange({
                      materialQuantities: {
                        ...(data.materialQuantities || {}),
                        [m.id]: e.target.value,
                      },
                    })
                  }
                  className={inputClass}
                  placeholder="Ex: 2 voyages, 10 tonnes, je ne sais pas..."
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={labelClass}>
          Pour quelle date aimeriez-vous recevoir le matériel ?{" "}
          <span className="text-destructive">*</span>
        </label>
        <input
          type="date"
          required
          value={data.deliveryDeadline}
          min={new Date().toISOString().split("T")[0]}
          onChange={(e) => onChange({ deliveryDeadline: e.target.value })}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-2 mt-3">
          {DELIVERY_FLEXIBILITY_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange({ deliveryFlexibility: opt })}
              className={optionBtn(data.deliveryFlexibility === opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {isRemblai && (
        <div>
          <label className={labelClass}>
            Combien êtes-vous prêt à payer par voyage ?{" "}
            <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="flex min-w-0 overflow-hidden rounded-lg border border-border bg-card focus-within:ring-2 focus-within:ring-ring transition-shadow">
              <span className="flex items-center px-3 text-muted-foreground font-body border-r border-border bg-muted/40 select-none">
                $
              </span>
              <input
                id="budget-max"
                name="budgetMax"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                value={data.budgetMax}
                onInput={(e) => handleBudgetChange(e.currentTarget.value)}
                onChange={(e) => handleBudgetChange(e.target.value)}
                className="w-full min-w-0 px-4 py-3 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none font-body text-base"
                placeholder="Ex : 250"
                required
              />
            </div>
            <select
              value={data.budgetUnit}
              onChange={(e) => onChange({ budgetUnit: e.target.value })}
              className={`${inputClass} w-auto`}
            >
              <option value="">/ unité</option>
              <option value="/ voyage">/ voyage</option>
              <option value="/ tonne">/ tonne</option>
              <option value="total">total</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Indiquez votre budget approximatif par voyage de camion.
          </p>
        </div>
      )}

      <div>
        <label className={labelClass}>Quel camion peut accéder à votre terrain ?</label>
        <div className="grid grid-cols-1 gap-2">
          {TRUCK_ACCESS_OPTIONS.map((t) => {
            const active = data.accessibility.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                onClick={() =>
                  onChange({
                    accessibility: active
                      ? data.accessibility.filter((v) => v !== t.value)
                      : [...data.accessibility, t.value],
                  })
                }
                className={`${optionBtn(active)} !py-0.5 !px-2`}
              >
                <div className="flex items-center gap-2">
                  {t.image ? (
                    <img
                      src={t.image}
                      alt={t.value}
                      loading="lazy"
                      width={512}
                      height={512}
                      className="w-24 h-16 object-contain shrink-0"
                    />
                  ) : (
                    <span className="text-3xl w-24 text-center shrink-0">{t.emoji}</span>
                  )}
                  <span>{t.value}</span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          💡 12 roues = meilleur rapport volume / prix
        </p>
      </div>

      <div>
        <label className={labelClass}>
          Avez-vous de la machinerie pour étendre le matériel ?{" "}
          <span className="text-muted-foreground font-normal">(sinon, on peut s'en occuper)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ machineryAvailable: true })}
            className={optionBtn(data.machineryAvailable === true)}
          >
            Oui
          </button>
          <button
            type="button"
            onClick={() => onChange({ machineryAvailable: false, machineryDescription: "" })}
            className={optionBtn(data.machineryAvailable === false)}
          >
            Non
          </button>
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Connaissez-vous les dimensions de votre projet ?{" "}
          <span className="text-muted-foreground font-normal">(optionnel)</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            min="0"
            value={data.lengthFt}
            onChange={(e) => onChange({ lengthFt: e.target.value })}
            className={inputClass}
            placeholder="Long. (pi)"
          />
          <input
            type="number"
            min="0"
            value={data.widthFt}
            onChange={(e) => onChange({ widthFt: e.target.value })}
            className={inputClass}
            placeholder="Larg. (pi)"
          />
          <input
            type="number"
            min="0"
            value={data.depthIn}
            onChange={(e) => onChange({ depthIn: e.target.value })}
            className={inputClass}
            placeholder="Prof. (po)"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          On peut calculer automatiquement la quantité pour vous.<br />
          Vous verrez une estimation en tonnes et en nombre de voyages.
        </p>
      </div>

      {isRemblai && (
        <div className="space-y-5 p-4 rounded-xl bg-amber-500/5 border border-amber-500/30">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚧</span>
            <span className="font-display font-bold text-foreground">Demande de remblai / dépôt</span>
          </div>

          <div>
            <label className={labelClass}>S'agit-il de matériel à livrer ou à sortir du chantier ?</label>
            <div className="grid grid-cols-1 gap-2">
              {DELIVER_OR_REMOVE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange({ deliverOrRemove: opt })}
                  className={optionBtn(data.deliverOrRemove === opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Présence de contamination connue ?</label>
            <div className="grid grid-cols-3 gap-2">
              {CONTAMINATION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange({ contamination: opt })}
                  className={optionBtn(data.contamination === opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Photos du matériel <span className="text-muted-foreground font-normal">(optionnel)</span>
            </label>
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border bg-card cursor-pointer hover:border-primary/50 transition-colors">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="text-sm font-body">{uploading ? "Téléversement..." : "Ajouter des photos"}</span>
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
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-foreground/80 text-background flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StepDetails;