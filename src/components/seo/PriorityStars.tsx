import { Star, Lock, Unlock } from "lucide-react";
import { useState } from "react";

export default function PriorityStars({
  value, locked, editable = false, onChange, size = "sm",
}: {
  value: number; locked?: boolean; editable?: boolean;
  onChange?: (value: number, locked: boolean) => void;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  const dim = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <div className="inline-flex items-center gap-1">
      <div className="inline-flex" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            disabled={!editable}
            onMouseEnter={() => editable && setHover(i)}
            onClick={() => editable && onChange?.(i, true)}
            className={`${editable ? "cursor-pointer" : "cursor-default"} p-0.5`}
            aria-label={`Priorité ${i}/5`}
          >
            <Star className={`${dim} ${i <= shown ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
          </button>
        ))}
      </div>
      {editable && (
        <button
          type="button"
          onClick={() => onChange?.(value, !locked)}
          title={locked ? "Priorité verrouillée (auto désactivé)" : "Priorité calculée automatiquement"}
          className="p-0.5 text-muted-foreground hover:text-foreground"
        >
          {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}

export function priorityLabel(v: number): string {
  return v >= 5 ? "Très prioritaire"
    : v === 4 ? "Prioritaire"
    : v === 3 ? "Moyenne"
    : v === 2 ? "Faible"
    : "Très faible";
}