import {
  PROJECT_TYPES,
  PROJECT_SIZES,
  TRUCK_ACCESS_OPTIONS,
  type QuestionnaireData,
} from "@/lib/questionnaire-data";

interface Props {
  data: QuestionnaireData;
  onChange: (updates: Partial<QuestionnaireData>) => void;
}

const StepDetails = ({ data, onChange }: Props) => {
  const labelClass = "block text-sm font-semibold text-foreground mb-2 font-display";
  const inputClass =
    "w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow font-body";

  const optionBtn = (active: boolean) =>
    `w-full text-left px-4 py-3 rounded-lg border-2 transition-all font-body text-sm ${
      active
        ? "border-primary bg-primary/5 text-foreground font-semibold"
        : "border-border bg-card text-foreground hover:border-primary/50"
    }`;

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
              className={optionBtn(data.propertyType === p.value)}
            >
              <div className="flex items-center gap-2">
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.value}
                    loading="lazy"
                    width={512}
                    height={512}
                    className="w-8 h-8 object-cover rounded shrink-0"
                  />
                ) : (
                  <span className="text-lg w-8 text-center shrink-0">{p.emoji}</span>
                )}
                <span>{p.value}</span>
              </div>
            </button>
          ))}
        </div>
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
      </div>

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
                className={optionBtn(active)}
              >
                <div className="flex items-center gap-3">
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
          Pas certain ? Aucun problème, on peut vous conseiller.
        </p>
      </div>

      <div>
        <label className={labelClass}>
          Avez-vous de la machinerie pour étendre le matériel ?
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
          On peut calculer automatiquement la quantité pour vous.
        </p>
      </div>
    </div>
  );
};

export default StepDetails;