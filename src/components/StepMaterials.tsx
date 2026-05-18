import { MATERIAL_TYPES } from "@/lib/questionnaire-data";
import { PenLine, HelpCircle } from "lucide-react";

interface Props {
  selected: string[];
  otherMaterial: string;
  onSelect: (materials: string[]) => void;
  onOtherChange: (value: string) => void;
}

const StepMaterials = ({ selected, otherMaterial, onSelect, onOtherChange }: Props) => {
  const toggle = (id: string) => {
    onSelect(
      selected.includes(id)
        ? selected.filter((m) => m !== id)
        : [...selected, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Quel matériel recherchez-vous?
        </h2>
        <p className="text-muted-foreground mt-2">Pas certain du bon matériel ? On vous guide.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MATERIAL_TYPES.map((mat) => (
          <button
            key={mat.id}
            type="button"
            onClick={() => toggle(mat.id)}
            className={`relative flex flex-col items-center gap-2 rounded-xl border-2 overflow-hidden transition-all duration-200 cursor-pointer ${
              selected.includes(mat.id)
                ? "border-primary shadow-md ring-2 ring-primary/30"
                : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
            }`}
          >
            {mat.image ? (
              <div className="w-full aspect-square overflow-hidden">
                <img
                  src={mat.image}
                  alt={mat.label}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-full aspect-square overflow-hidden bg-muted flex flex-col items-center justify-center p-2 text-center">
                {mat.id === "ne-sais-pas" ? (
                  <>
                    <HelpCircle className="w-8 h-8 text-muted-foreground mb-1" />
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      On vous guide pour choisir le bon matériel
                    </span>
                  </>
                ) : (
                  <PenLine className="w-10 h-10 text-muted-foreground" />
                )}
              </div>
            )}
            <span className="font-display font-semibold text-sm text-foreground pb-3">{mat.label}</span>
            {selected.includes(mat.id) && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {selected.includes("autre") && (
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">
            Décrivez le matériel désiré
          </label>
          <input
            value={otherMaterial}
            onChange={(e) => onOtherChange(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow font-body"
            placeholder="Ex: Pierre décorative, terre végétale..."
          />
        </div>
      )}
    </div>
  );
};

export default StepMaterials;
