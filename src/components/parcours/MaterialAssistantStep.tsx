// ============================================================
// Étape « matériaux » — version assistée (feature flag
// material_assistant_v2). Elle N'ENLÈVE RIEN : le choix manuel
// existant reste disponible sous « Plus de précision ».
// Aucune analyse d'image, aucune classification environnementale
// automatique, aucun terme technique affiché au client.
// ============================================================
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Sparkles, Wand2, X } from "lucide-react";
import {
  interpretForParcours,
  RECEPTION_FAMILIES,
  SIMPLE_FAMILIES,
  RESTRICTION_OPTIONS,
  type AssistantSelection,
  type EnvironmentAnswer,
} from "@/lib/parcours/assistant-materiaux";

const PLACEHOLDERS = [
  "Ex. Terre avec un peu de roche",
  "Ex. 20 voyages de sable terreux",
  "Ex. Terre, sable et petits cailloux",
  "Ex. Je ne sais pas exactement ce que c'est",
];

export interface AssistantValue {
  description: string;
  materials: string[];
  refused: string[];
  environment: EnvironmentAnswer;
  environmentDetails: string;
}

interface Props {
  variant: "reception" | "evacuation";
  value: AssistantValue;
  onChange: (patch: Partial<AssistantValue>) => void;
  /** Grille de cartes déjà en production, réutilisée telle quelle. */
  renderManual: () => ReactNode;
  /** Étape photo existante (l'utilisateur y est simplement invité). */
  onGoToPhotos?: () => void;
}

const box = "rounded-xl border-2 border-border bg-background";
const btn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 font-display text-sm font-bold";

const MaterialAssistantStep = ({ variant, value, onChange, renderManual, onGoToPhotos }: Props) => {
  const [placeholder, setPlaceholder] = useState(0);
  const [result, setResult] = useState<AssistantSelection | null>(null);
  const [detailed, setDetailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setPlaceholder((p) => (p + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(id);
  }, []);

  const families = variant === "reception" ? RECEPTION_FAMILIES : SIMPLE_FAMILIES;

  const toggleFamily = (materials: string[]) => {
    const active = materials.every((m) => value.materials.includes(m));
    const next = active
      ? value.materials.filter((m) => !materials.includes(m))
      : [...new Set([...value.materials, ...materials])];
    onChange({ materials: next });
  };

  const toggleRefused = (label: string) =>
    onChange({
      refused: value.refused.includes(label)
        ? value.refused.filter((r) => r !== label)
        : [...value.refused, label],
    });

  const identify = () => {
    if (!value.description.trim()) return;
    const r = interpretForParcours(
      value.description,
      variant === "reception" ? "RECEPTION" : "EVACUATION",
    );
    setResult(r);
    setConfirmed(false);
  };

  const accept = () => {
    if (!result) return;
    onChange({
      materials: [...new Set([...value.materials, ...result.materials])],
      refused: [...new Set([...value.refused, ...result.refused])],
    });
    setConfirmed(true);
  };

  const title = useMemo(
    () =>
      variant === "reception"
        ? "Qu'est-ce que vous pouvez recevoir ?"
        : "Qu'est-ce que vous avez à sortir ?",
    [variant],
  );

  return (
    <div className="space-y-6">
      {/* 1 — Texte libre, jamais obligatoire */}
      <div className={`${box} p-4`}>
        <h3 className="font-display text-base font-extrabold text-foreground">Décrivez votre matériel</h3>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Écrivez-le comme vous le diriez normalement. Ce champ est facultatif.
        </p>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder={PLACEHOLDERS[placeholder]}
          className="mt-3 w-full resize-none rounded-xl border-2 border-border bg-background px-4 py-3 font-body text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={identify}
          disabled={!value.description.trim()}
          className={`${btn} mt-3 w-full bg-primary text-primary-foreground disabled:opacity-40`}
        >
          <Sparkles className="h-4 w-4" /> Identifier mon matériel
        </button>
      </div>

      {/* 2 — Confirmation très simple */}
      {result && (
        <div className={`${box} p-4`}>
          <h3 className="font-display text-base font-extrabold text-foreground">Voici ce que j'ai compris</h3>
          <ul className="mt-3 space-y-2">
            {result.lines.map((l) => (
              <li key={l.label} className="flex items-start gap-2 font-body text-base text-foreground">
                {l.state === "REFUSE" ? (
                  <X className="mt-1 h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                )}
                <span>
                  {l.label}
                  {l.state === "REFUSE" && <span className="block text-sm text-muted-foreground">À ne pas recevoir</span>}
                  {l.state === "ACCEPTE" && l.display && (
                    <span className="block text-sm text-muted-foreground">{l.display}</span>
                  )}
                  {l.state === "INCONNU" && (
                    <span className="block text-sm text-muted-foreground">À confirmer</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {result.quantityText && (
            <p className="mt-3 font-body text-base text-foreground">
              Quantité : <strong>{result.quantityText}</strong>
            </p>
          )}
          {result.granulometry.length > 0 && (
            <p className="mt-1 font-body text-sm text-muted-foreground">Grosseur : {result.granulometry.join(", ")}</p>
          )}
          {result.conditions.length > 0 && (
            <p className="mt-1 font-body text-sm text-muted-foreground">Précisions : {result.conditions.join(", ")}</p>
          )}
          {result.truck && (
            <p className="mt-1 font-body text-sm text-muted-foreground">Camion : {result.truck}</p>
          )}

          {result.needsHelp && (
            <div className="mt-4 rounded-xl bg-muted p-3">
              <p className="font-body text-sm font-semibold text-foreground">
                J'ai besoin d'un peu plus d'information.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {onGoToPhotos && (
                  <button type="button" onClick={onGoToPhotos} className={`${btn} border-2 border-border`}>
                    Ajouter une photo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => document.getElementById("assistant-precision")?.focus()}
                  className={`${btn} border-2 border-border`}
                >
                  Écrire une précision
                </button>
                <button type="button" onClick={() => setDetailed(true)} className={`${btn} border-2 border-border`}>
                  Choisir moi-même
                </button>
                <button type="button" onClick={accept} className={`${btn} border-2 border-border`}>
                  Continuer quand même
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={accept} className={`${btn} flex-1 bg-primary text-primary-foreground`}>
              C'est exact
            </button>
            <button
              type="button"
              onClick={() => setDetailed(true)}
              className={`${btn} flex-1 border-2 border-border text-foreground`}
            >
              Modifier
            </button>
          </div>
          {confirmed && (
            <p className="mt-2 font-body text-sm text-primary">Merci ! Vos matériaux ont été ajoutés.</p>
          )}
        </div>
      )}

      {/* 3 — Grandes familles (simple, multi-sélection) */}
      <div>
        <h3 className="font-display text-base font-extrabold text-foreground">{title}</h3>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          {variant === "reception"
            ? "Cochez tout ce que vous pouvez recevoir. Plus il y en a, plus vous avez d'options."
            : "Cochez ce que vous avez à sortir."}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {families.map((f) => {
            const active = f.materials.every((m) => value.materials.includes(m));
            return (
              <button
                key={f.label}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFamily(f.materials)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left font-body text-base ${
                  active ? "border-primary bg-primary/5 font-semibold" : "border-border bg-background"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 — Restrictions : conditions, jamais des matériaux */}
      <div>
        <h3 className="font-display text-base font-extrabold text-foreground">
          {variant === "reception"
            ? "Y a-t-il quelque chose que vous ne voulez pas recevoir ?"
            : "Y a-t-il quelque chose qu'il ne faut pas mélanger ?"}
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RESTRICTION_OPTIONS.map((r) => {
            const active = value.refused.includes(r);
            return (
              <button
                key={r}
                type="button"
                aria-pressed={active}
                onClick={() => toggleRefused(r)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left font-body text-base ${
                  active ? "border-destructive bg-destructive/5 font-semibold" : "border-border bg-background"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                    active ? "border-destructive bg-destructive text-destructive-foreground" : "border-border"
                  }`}
                >
                  {active && <X className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5 — Environnement : question simple, aucune déduction */}
      <div>
        <h3 className="font-display text-base font-extrabold text-foreground">
          Savez-vous si le sol a été caractérisé ?
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["oui", "non", "je ne sais pas"] as EnvironmentAnswer[]).map((opt) => (
            <button
              key={opt}
              type="button"
              aria-pressed={value.environment === opt}
              onClick={() => onChange({ environment: value.environment === opt ? "" : opt })}
              className={`min-h-12 rounded-xl border-2 px-4 py-3 font-body text-base capitalize ${
                value.environment === opt ? "border-primary bg-primary/5 font-semibold" : "border-border bg-background"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        {value.environment === "oui" && (
          <textarea
            value={value.environmentDetails}
            onChange={(e) => onChange({ environmentDetails: e.target.value })}
            rows={2}
            placeholder="Informations disponibles (facultatif)"
            className="mt-2 w-full resize-none rounded-xl border-2 border-border bg-background px-4 py-3 font-body text-base focus:border-primary focus:outline-none"
          />
        )}
      </div>

      {/* 6 — Précision libre + mode détaillé (entrepreneurs) */}
      <div>
        <label htmlFor="assistant-precision" className="font-body text-sm text-muted-foreground">
          Une précision à ajouter ?
        </label>
        <input
          id="assistant-precision"
          defaultValue=""
          onBlur={(e) => {
            const extra = e.target.value.trim();
            if (!extra) return;
            onChange({ description: `${value.description} ${extra}`.trim() });
            e.target.value = "";
          }}
          placeholder="Ex. il y a des grosses roches par endroits"
          className="mt-1 w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-body text-base focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setDetailed((d) => !d)}
          className="mt-3 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-primary underline"
        >
          <Wand2 className="h-4 w-4" /> {detailed ? "Masquer les détails" : "Plus de précision"}
        </button>
      </div>

      {detailed && <div className="border-t border-border pt-4">{renderManual()}</div>}
    </div>
  );
};

export default MaterialAssistantStep;
