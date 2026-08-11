import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X, Loader2, Truck, Info, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  REMBLAI_MATERIAL_OPTIONS,
  REMBLAI_MATERIAL_IMAGES,
  REMBLAI_MATERIAL_DESCRIPTIONS,
  REMBLAI_MATERIAL_CATEGORIES,
  REMBLAI_TRUCK_OPTIONS,
  REMBLAI_MACHINERY_OPTIONS,
  REMBLAI_TIMEFRAME_OPTIONS,
  ACCESS_HEAVY_TRUCK_OPTIONS,
  ACCESS_DETAIL_OPTIONS,
  type QuestionnaireData,
} from "@/lib/questionnaire-data";

type RemblaiMaterial = (typeof REMBLAI_MATERIAL_OPTIONS)[number];

interface Props {
  data: QuestionnaireData;
  onChange: (updates: Partial<QuestionnaireData>) => void;
  onSubmit: () => void;
  loading: boolean;
  /** Habillage seulement : « recherche » (matériel de remplissage) ou « disposition » (site de dépôt). */
  variant?: "recherche" | "disposition";
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

const RemblaiForm = ({ data, onChange, onSubmit, loading, variant = "recherche" }: Props) => {
  const copy = variant === "disposition"
    ? {
        badge: "🚛 Disposer de mon remblai",
        title: "Trouvez un site de dépôt",
        subtitle: "Remplissez ce formulaire en moins d'une minute",
        type: "✅ J'ai du remblai à faire disposer",
      }
    : {
        badge: "🚧 Demande de remblai",
        title: "Recevez du remblai rapidement",
        subtitle: "Remplissez ce formulaire en moins d'une minute",
        type: "✅ Je cherche du remblai / remplissage",
      };
  const [uploading, setUploading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const selectedVisibleMaterials = (data.materials || []).filter((m): m is RemblaiMaterial =>
    (REMBLAI_MATERIAL_OPTIONS as readonly string[]).includes(m)
  );

  const toggleArr = (key: "materials" | "accessibility" | "machineryList" | "accessDetails", v: string) => {
    const arr = (data[key] as string[] | undefined) || [];
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
    materials: selectedVisibleMaterials.length === 0,
    quantity: !data.quantity.trim() || Number(data.quantity) <= 0,
    accessibility: (data.accessibility || []).length === 0,
    machineryList: (data.machineryList || []).length === 0,
    deliveryTimeframe: !data.deliveryTimeframe,
    budgetMax: !data.budgetMax || !data.budgetMax.trim() || Number(data.budgetMax) <= 0,
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

  const handleBudgetChange = (value: string) => {
    onChange({ budgetMax: value.replace(/[^0-9]/g, "") });
  };

  return (
    <div className="max-w-2xl mx-auto px-3 md:px-4 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="text-center py-4">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3 font-display">
          {copy.badge}
        </div>
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          {copy.title}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm md:text-base">
          {copy.subtitle}
        </p>
      </div>

      {/* Section 1 - Type de demande */}
      <Section number={1} title="Type de demande">
        <div className="px-4 py-4 rounded-lg border-2 border-primary bg-primary/5 font-display font-semibold text-foreground flex items-center gap-2">
          {copy.type}
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
      <Section number={3} title="Type de matériau souhaité *">
        <div className="flex items-center gap-2 -mt-1 mb-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Aide sur le choix du matériau"
                className="inline-flex items-center gap-1.5 text-sm text-primary font-body rounded-md px-2 py-1 hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Info className="w-4 h-4" />
                Aide
              </button>
            </PopoverTrigger>
            <PopoverContent className="max-w-xs text-sm font-body">
              Sélectionnez le ou les types de matériaux que vous souhaitez faire disposer.
              Si vous n'êtes pas certain, choisissez l'option la plus représentative ou
              sélectionnez « Autre ».
            </PopoverContent>
          </Popover>
          <span aria-live="polite" className="text-sm font-body text-muted-foreground">
            Matériaux sélectionnés : <span className="font-bold text-foreground">{selectedVisibleMaterials.length}</span>
          </span>
        </div>
        <div data-error={showErrors && errors.materials} className="space-y-5">
          {REMBLAI_MATERIAL_CATEGORIES.map((cat) => (
            <div key={cat.title}>
              <p className="text-xs uppercase tracking-wide font-display font-bold text-muted-foreground mb-2">
                {cat.title}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {cat.materials.map((m) => {
                  const active = data.materials.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleArr("materials", m)}
                      className={`group relative h-full flex flex-col overflow-hidden rounded-xl text-left font-body bg-card transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                        active
                          ? "border-4 border-primary bg-primary/5 shadow-lg shadow-primary/25 -translate-y-0.5"
                          : "border-4 border-border hover:border-primary/60 hover:shadow-md hover:-translate-y-0.5"
                      }`}
                    >
                      <div className="relative w-full aspect-square overflow-hidden bg-muted">
                        <img
                          src={REMBLAI_MATERIAL_IMAGES[m]}
                          alt={`Matériau : ${m}`}
                          loading="lazy"
                          width={640}
                          height={640}
                          className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                        />
                        <span
                          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all duration-200 ${
                            active
                              ? "bg-primary text-primary-foreground scale-100 opacity-100"
                              : "bg-background/80 text-transparent scale-75 opacity-0"
                          }`}
                        >
                          <Check className="w-5 h-5" strokeWidth={3} />
                        </span>
                      </div>
                      <div className="flex flex-col justify-start flex-1 px-3 py-2.5 min-h-[4.5rem]">
                        <span className={`block text-sm leading-tight ${active ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>
                          {m}
                        </span>
                        <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
                          {REMBLAI_MATERIAL_DESCRIPTIONS[m]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {(data.materials.includes("Autre") || data.materials.includes("Je ne suis pas certain")) && (
          <div>
            <label htmlFor="remblai-autre-materiau" className="block text-sm font-semibold text-foreground mb-1.5 font-display">
              Décrivez votre matériau
            </label>
            <input
              id="remblai-autre-materiau"
              value={data.otherMaterial}
              onChange={(e) => onChange({ otherMaterial: e.target.value })}
              className={inputClass}
              placeholder="Ex : terre avec un peu de béton..."
            />
          </div>
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

      {/* Section budget */}
      <Section number={5} title="Combien êtes-vous prêt à payer par voyage ? *">
        <div data-error={showErrors && errors.budgetMax}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className={`flex min-w-0 overflow-hidden rounded-lg border-2 bg-background focus-within:border-primary transition-colors ${errClass(errors.budgetMax) || "border-border"}`}>
              <span className="flex items-center px-3 text-muted-foreground font-body border-r border-border bg-muted/40 select-none">
                $
              </span>
              <input
                id="remblai-budget-max"
                name="budgetMax"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                value={data.budgetMax}
                onInput={(e) => handleBudgetChange(e.currentTarget.value)}
                onChange={(e) => handleBudgetChange(e.target.value)}
                className="w-full min-w-0 px-4 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none font-body text-base"
                placeholder="Ex : 250"
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
          {showErrors && errors.budgetMax && (
            <p className="text-sm text-destructive font-body mt-2">
              ⚠ Indiquez votre budget par voyage
            </p>
          )}
        </div>
      </Section>

      {/* Section 5 - Accessibilité */}
      <Section number={6} title="Accessibilité du terrain *">
        <p className="text-sm text-muted-foreground mb-2">
          Cochez tous les types de camions qui peuvent accéder au terrain.
        </p>
        <div data-error={showErrors && errors.accessibility} className="grid grid-cols-1 gap-2">
          {REMBLAI_TRUCK_OPTIONS.map((t) => {
            const active = data.accessibility.includes(t);
            return (
              <button key={t} type="button" onClick={() => toggleArr("accessibility", t)} className={checkboxRow(active)}>
                <span className="w-5 h-5 rounded border-2 border-primary flex items-center justify-center shrink-0">
                  {active ? "✓" : ""}
                </span>
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span>{t}</span>
              </button>
            );
          })}
        </div>
        {showErrors && errors.accessibility && (
          <p className="text-sm text-destructive font-body">⚠ Sélectionnez au moins une option</p>
        )}
      </Section>

      {/* Section 7 - Machinerie disponible */}
      <Section number={7} title="Machinerie disponible sur place *">
        <div data-error={showErrors && errors.machineryList} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REMBLAI_MACHINERY_OPTIONS.map((m) => {
            const active = data.machineryList.includes(m);
            return (
              <button key={m} type="button" onClick={() => toggleArr("machineryList", m)} className={checkboxRow(active)}>
                <span className="w-5 h-5 rounded border-2 border-primary flex items-center justify-center shrink-0">
                  {active ? "✓" : ""}
                </span>
                <span>{m}</span>
              </button>
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

      {/* Section 8 - Délai souhaité */}
      <Section number={8} title="Délai souhaité *">
        <div data-error={showErrors && errors.deliveryTimeframe} className="grid grid-cols-1 gap-2">
          {REMBLAI_TIMEFRAME_OPTIONS.map((t) => {
            const active = data.deliveryTimeframe === t;
            return (
              <button key={t} type="button" onClick={() => onChange({ deliveryTimeframe: t })} className={checkboxRow(active)}>
                <span className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                  {active ? "•" : ""}
                </span>
                <span>{t}</span>
              </button>
            );
          })}
        </div>
        {showErrors && errors.deliveryTimeframe && (
          <p className="text-sm text-destructive font-body">⚠ Sélectionnez un délai</p>
        )}
      </Section>

      {/* Section 9 - Photos */}
      <Section number={9} title="Photos de l'emplacement (optionnel)">
        <p className="text-sm text-muted-foreground mb-2">
          Les photos les plus utiles : l'entrée du terrain, le chemin d'accès, l'espace de recul et
          la zone de chargement ou de déchargement.
        </p>
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

      {/* Section 10 - Accès au chantier */}
      <Section number={10} title="Accès au chantier (optionnel)">
        <p className="text-sm text-muted-foreground mb-2">
          Ces précisions évitent un déplacement inutile et aident à choisir le bon camion.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {ACCESS_HEAVY_TRUCK_OPTIONS.map((o) => {
            const active = data.accessHeavyTruck === o;
            return (
              <button key={o} type="button" onClick={() => onChange({ accessHeavyTruck: active ? "" : o })}
                className={checkboxRow(active)}>
                <span className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                  {active ? "•" : ""}
                </span>
                <span>{o}</span>
              </button>
            );
          })}
        </div>
        {data.accessHeavyTruck && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            {ACCESS_DETAIL_OPTIONS.map((o) => {
              const active = (data.accessDetails || []).includes(o);
              return (
                <button key={o} type="button" onClick={() => toggleArr("accessDetails", o)} className={checkboxRow(active)}>
                  <span className="w-5 h-5 rounded border-2 border-primary flex items-center justify-center shrink-0">
                    {active ? "✓" : ""}
                  </span>
                  <span>{o}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* Section 11 - Commentaires */}
      <Section number={11} title="Commentaires / précisions (optionnel)">
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