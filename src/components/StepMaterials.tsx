import { useState } from "react";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";

interface Props {
  selected: string[];
  onSelect: (materials: string[]) => void;
}

const StepMaterials = ({ selected, onSelect }: Props) => {
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
        <p className="text-muted-foreground mt-2">Sélectionnez un ou plusieurs matériaux</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MATERIAL_TYPES.map((mat) => (
          <button
            key={mat.id}
            type="button"
            onClick={() => toggle(mat.id)}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
              selected.includes(mat.id)
                ? "border-primary bg-primary/10 shadow-md"
                : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
            }`}
          >
            <span className="text-3xl">{mat.icon}</span>
            <span className="font-display font-semibold text-sm text-foreground">{mat.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default StepMaterials;
