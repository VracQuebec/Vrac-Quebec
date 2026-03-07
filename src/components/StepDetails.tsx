import {
  PROPERTY_TYPES,
  TRIP_VOYAGE_OPTIONS,
  TONNAGE_OPTIONS,
  BUDGET_UNITS,
  BUDGET_OPTIONS,
  MACHINERY_OPTIONS,
  ACCESSIBILITY_OPTIONS,
  type QuestionnaireData,
} from "@/lib/questionnaire-data";

interface Props {
  data: QuestionnaireData;
  onChange: (updates: Partial<QuestionnaireData>) => void;
}

const StepDetails = ({ data, onChange }: Props) => {
  const selectClass =
    "w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow font-body appearance-none";
  const labelClass = "block text-sm font-semibold text-foreground mb-1.5 font-display";
  const checkboxLabelClass = "flex items-center gap-2.5 cursor-pointer text-sm text-foreground font-body";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Détails de votre besoin
        </h2>
        <p className="text-muted-foreground mt-2">Précisez les quantités et contraintes</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className={labelClass}>Type de propriété</label>
          <select
            value={data.propertyType}
            onChange={(e) => onChange({ propertyType: e.target.value })}
            className={selectClass}
          >
            <option value="">Sélectionner...</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Nombre de voyages estimé</label>
            <select
              value={data.quantity}
              onChange={(e) => onChange({ quantity: e.target.value })}
              className={selectClass}
            >
              <option value="">Sélectionner...</option>
              {TRIP_VOYAGE_OPTIONS.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Tonnage estimé</label>
            <select
              value={data.tonnage}
              onChange={(e) => onChange({ tonnage: e.target.value })}
              className={selectClass}
            >
              <option value="">Sélectionner...</option>
              {TONNAGE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Budget — unité</label>
            <select
              value={data.budgetUnit}
              onChange={(e) => onChange({ budgetUnit: e.target.value, budgetMax: "" })}
              className={selectClass}
            >
              <option value="">Sélectionner...</option>
              {BUDGET_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          {data.budgetUnit && (
            <div>
              <label className={labelClass}>Montant maximum</label>
              <select
                value={data.budgetMax}
                onChange={(e) => onChange({ budgetMax: e.target.value })}
                className={selectClass}
              >
                <option value="">Sélectionner...</option>
                {BUDGET_OPTIONS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Machinerie disponible sur place</label>
          <div className="flex gap-4 mt-2">
            {MACHINERY_OPTIONS.map((m) => (
              <label key={m} className={checkboxLabelClass}>
                <input
                  type="radio"
                  name="machinery"
                  value={m}
                  checked={data.machineryAvailable === m}
                  onChange={() => onChange({ machineryAvailable: m })}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
                {m}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Accessibilité du terrain</label>
          <p className="text-xs text-muted-foreground mb-2">Véhicules pouvant accéder au terrain</p>
          <div className="grid grid-cols-2 gap-2">
            {ACCESSIBILITY_OPTIONS.map((a) => (
              <label key={a} className={checkboxLabelClass}>
                <input
                  type="checkbox"
                  checked={data.accessibility.includes(a)}
                  onChange={() =>
                    onChange({
                      accessibility: data.accessibility.includes(a)
                        ? data.accessibility.filter((v) => v !== a)
                        : [...data.accessibility, a],
                    })
                  }
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
                {a}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepDetails;
