import { type QuestionnaireData } from "@/lib/questionnaire-data";

interface Props {
  data: QuestionnaireData;
  onChange: (updates: Partial<QuestionnaireData>) => void;
}

const StepContact = ({ data, onChange }: Props) => {
  const inputClass =
    "w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow font-body";
  const labelClass = "block text-sm font-semibold text-foreground mb-1.5 font-display";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Recevez votre prix rapidement
        </h2>
        <p className="text-muted-foreground mt-2">On vous répond en moins de 30 minutes</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Nom *</label>
          <input
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputClass}
            placeholder="Jean Tremblay"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Courriel *</label>
            <input
              type="email"
              value={data.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className={inputClass}
              placeholder="jean@exemple.com"
            />
          </div>
          <div>
            <label className={labelClass}>Téléphone *</label>
            <input
              value={data.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              className={inputClass}
              placeholder="(418) 555-1234"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Adresse ou secteur de livraison *</label>
          <input
            value={data.address}
            onChange={(e) => onChange({ address: e.target.value })}
            className={inputClass}
            placeholder="123 Rue Principale, Québec, QC"
          />
        </div>

        <div>
          <label className={labelClass}>Code postal *</label>
          <input
            value={data.postalCode}
            onChange={(e) => onChange({ postalCode: e.target.value })}
            className={inputClass}
            placeholder="G1A 1A1"
          />
        </div>

        <div>
          <label className={labelClass}>Notes additionnelles</label>
          <textarea
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Accès difficile ? Détails importants ? Précisez ici."
          />
        </div>
      </div>
    </div>
  );
};

export default StepContact;
