import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TripBudgetReference from "@/components/parcours/TripBudgetReference";
import { BUDGET_PER_TRIP_LABEL, budgetPerTripError, formatClientTripBudget } from "@/lib/remblai/public-form";

type Saved = { choice: "montant"; amount: string } | { choice: "sans_contribution" };

/**
 * Proposition facultative d'une contribution par voyage, APRÈS l'enregistrement de la demande.
 * Met à jour exactement la demande envoyée (identifiant + jeton secret); une erreur n'annule jamais la demande.
 */
export default function TripBudgetOffer({ submissionId, budgetToken }: { submissionId: string; budgetToken: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const lock = useRef(false);

  const save = async (choice: "montant" | "sans_contribution") => {
    if (lock.current) return; // double clic : une seule requête à la fois
    if (choice === "montant") {
      const err = budgetPerTripError(value);
      if (err) { setError(err.replace(" (inscrivez 0 $ si vous souhaitez uniquement du remblai gratuit)", "")); return; }
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("submit-parcours", {
        body: { action: "set_trip_budget", submission_id: submissionId, budget_token: budgetToken, choice, amount: choice === "montant" ? value : null },
      });
      if (fnErr || !data?.ok) throw new Error(data?.message || "Le budget n'a pas pu être enregistré.");
      setSaved(choice === "montant" ? { choice, amount: value } : { choice });
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Le budget n'a pas pu être enregistré."} Votre demande, elle, reste bien enregistrée.`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <div role="status" className="mt-5 rounded-xl border border-border bg-background p-4 text-left">
        <p className="font-body text-sm text-foreground">
          {saved.choice === "montant"
            ? <>Budget proposé enregistré : <strong>{formatClientTripBudget(saved.amount)}</strong></>
            : <>Votre demande est conservée <strong>sans contribution</strong>.</>}
        </p>
        <p className="mt-1 font-body text-xs text-muted-foreground">
          Ce montant est une proposition. Tout prix devra être convenu avec l’entrepreneur avant la livraison. Aucun paiement n’est effectué ici.
        </p>
      </div>
    );
  }

  return (
    <>
      <TripBudgetReference />
      <section aria-labelledby="vq-contrib-title" className="mt-5 rounded-xl border border-border bg-background p-4 text-left sm:p-5">
      <h3 id="vq-contrib-title" className="font-display text-lg font-bold text-foreground">
        Souhaitez-vous proposer une contribution par voyage reçu?
      </h3>
      <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">
        Recevoir du remblai implique du transport, du temps de camion et de la manutention. Proposer un budget par voyage peut rendre votre demande plus intéressante pour les entrepreneurs et favoriser une livraison plus rapide, selon les matériaux disponibles et votre secteur. Vous pouvez aussi conserver votre demande sans contribution. Aucune livraison ni aucun délai ne sont garantis.
      </p>
      <label htmlFor="vq-contrib-amount" className="mt-4 block font-display text-sm font-bold text-foreground">
        {BUDGET_PER_TRIP_LABEL}
      </label>
      <div className="mt-2 flex items-stretch overflow-hidden rounded-xl border-2 border-border bg-background focus-within:border-primary">
        <input
          id="vq-contrib-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => { setValue(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 10)); setError(null); }}
          aria-describedby="vq-contrib-note"
          aria-invalid={!!error}
          className="min-w-0 flex-1 bg-transparent px-4 py-3.5 font-body text-base text-foreground focus:outline-none"
        />
        <span className="flex shrink-0 items-center border-l-2 border-border bg-muted px-3 font-display text-sm font-bold text-foreground">$ CA / voyage</span>
      </div>
      {error && <p role="alert" className="mt-2 font-body text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => save("montant")}
          disabled={busy}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-4 font-display text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Enregistrement…" : "Enregistrer mon budget"}
        </button>
        <button
          type="button"
          onClick={() => save("sans_contribution")}
          disabled={busy}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-border bg-background px-4 font-display text-sm font-bold text-foreground disabled:opacity-60"
        >
          Continuer sans contribution
        </button>
      </div>
      <p id="vq-contrib-note" className="mt-3 font-body text-xs text-muted-foreground">
        Ce montant est une proposition. Tout prix devra être convenu avec l’entrepreneur avant la livraison. Aucun paiement n’est effectué ici.
      </p>
    </section>
  );
}
