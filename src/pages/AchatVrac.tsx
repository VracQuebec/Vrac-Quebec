// ============================================================
// ASSISTANT D'ACHAT DE MATÉRIAUX EN VRAC — Vrac Québec
// Parcours utilisateur + branchement du moteur de calcul unique.
// Aucun prix, aucune carrière, aucun camion, aucun tarif ici :
// tout provient des paramètres administrateur via quote-engine.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Calculator, Check, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import TransportBanner from "@/components/TransportBanner";
import {
  DeliveryDateNotice, StepContact, StepDelivery, StepMaterial, StepQuantity,
} from "@/components/vrac/VracSteps";
import {
  EMPTY_VRAC_DRAFT, findVracMaterial, getActiveVracMaterials, loadVracDraft,
  saveVracDraft, type VracDraft,
} from "@/lib/vrac/catalog";
import QuoteCard from "@/components/vrac/QuoteCard";
import { useVracEstimate } from "@/lib/vrac/estimate";
import { useQuoteSubmit } from "@/lib/vrac/submit";
import type { PublicQuote } from "@/lib/jsc/engine";
import { useUnsavedChangesGuard } from "@/lib/navigation/unsavedChanges";

const STEPS = ["Matériau", "Quantité", "Livraison", "Coordonnées", "Résumé et estimation"] as const;

export default function AchatVrac() {
  const materials = useMemo(() => getActiveVracMaterials(), []);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<VracDraft>(EMPTY_VRAC_DRAFT);
  const estimate = useVracEstimate();
  const submission = useQuoteSubmit();

  // Sauvegarde automatique : on peut revenir en arrière sans rien reperdre.
  useEffect(() => { setDraft(loadVracDraft()); }, []);
  useEffect(() => { saveVracDraft(draft); }, [draft]);

  const set = (patch: Partial<VracDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const material = findVracMaterial(draft.materialId);

  useUnsavedChangesGuard(step > 0 || !!draft.materialId);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const canContinue = [
    !!material,
    draft.quantityMode === "inconnu"
      || (draft.quantityMode === "tonnes" && Number(draft.tonnes) > 0)
      || (draft.quantityMode === "voyages" && Number(draft.trips) > 0)
      || (draft.quantityMode === "dimensions"
        && Number(draft.dims.length) > 0 && Number(draft.dims.width) > 0 && Number(draft.dims.depth) > 0),
    draft.address.trim().length > 5,
    draft.contact.name.trim().length > 1
      && draft.contact.phone.replace(/\D/g, "").length >= 10
      && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.contact.email.trim()),
    true,
  ][step];

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Acheter des matériaux en vrac livrés | Vrac Québec</title>
        <meta name="description" content="Terre tamisée, sable, pierre concassée ou poussière de pierre livrées chez vous. Assistant simple en quelques étapes pour obtenir votre estimation." />
        <link rel="canonical" href="https://vracquebec.ca/acheter-materiaux" />
      </Helmet>
      <TransportBanner />

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
        <header className="mb-8 text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" /> Assistant d'achat de matériaux
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Vos matériaux livrés, sans casse-tête
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Quelques questions simples. Nous nous occupons du reste : quantité, camion et livraison.
          </p>
        </header>

        <Progress step={step} />

        <section className="mt-8 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <div className="mb-8 space-y-4">
            <h2 className="text-xl font-semibold text-foreground">{stepTitle(step)}</h2>
            <p className="text-sm text-muted-foreground">{stepHint(step)}</p>
          </div>

          {step === 0 && (
            <StepMaterial materials={materials} value={draft.materialId}
              onSelect={(id) => { set({ materialId: id }); setStep(1); }} />
          )}
          {step === 1 && <StepQuantity draft={draft} set={set} />}
          {step === 2 && <StepDelivery draft={draft} set={set} />}
          {step === 3 && <StepContact draft={draft} set={set} />}
          {step === 4 && (
            estimate.quote ? (
              <QuoteCard
                quote={estimate.quote}
                address={draft.address}
                onEmail={() => submission.send(draft, "submit")}
                onCallback={() => submission.send(draft, "callback")}
                onEdit={() => setStep(0)}
                pending={submission.pending}
                result={submission.result}
                error={submission.error}
              />
            ) : (
              <Recap draft={draft} loading={estimate.loading} error={estimate.error} />
            )
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Retour
            </Button>
            {step < STEPS.length - 1 ? (
            <Button
              size="lg"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canContinue}
              className={`transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] ${
                canContinue
                  ? "bg-primary text-primary-foreground shadow-[0_12px_32px_-10px_hsl(var(--primary)/0.55)] hover:bg-primary/90 hover:shadow-[0_16px_40px_-12px_hsl(var(--primary)/0.65)]"
                  : ""
              }`}
            >
              Continuer <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            ) : estimate.quote ? null : (
              <Button
                size="lg"
                onClick={() => estimate.calculate(draft)}
                disabled={estimate.loading}
                className="bg-primary text-primary-foreground shadow-[0_12px_32px_-10px_hsl(var(--primary)/0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_16px_40px_-12px_hsl(var(--primary)/0.65)] active:scale-[0.98]"
              >
                {estimate.loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calcul en cours…</>
                  : <><Calculator className="mr-2 h-4 w-4" /> Calculer mon estimation</>}
              </Button>
            )}
          </div>

          {step === STEPS.length - 1 && (
            <p className="mt-3 text-right text-xs text-muted-foreground">
              Les prix sont calculés automatiquement selon nos tarifs, les matériaux sélectionnés,
              la distance de transport et le camion recommandé.
            </p>
          )}
        </section>

        <p className="mt-4 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Vos réponses sont conservées sur cet appareil pendant votre saisie.
        </p>
      </main>
    </div>
  );
}

function stepTitle(step: number) {
  return [
    "Quel matériau souhaitez-vous faire livrer ?",
    "De quelle quantité avez-vous besoin ?",
    "Où doit-on livrer ?",
    "Vos coordonnées",
    "Résumé de votre demande",
  ][step];
}

function stepHint(step: number) {
  return [
    "Choisissez le matériau qui correspond le mieux à votre projet. Nous vous guiderons ensuite pour calculer automatiquement la quantité, le transport et votre estimation.",
    "Une approximation suffit, nous validerons avec vous.",
    "L'adresse nous permet de planifier la livraison.",
    "Pour vous transmettre votre estimation.",
    "Vérifiez les informations ci-dessous avant de calculer votre prix.",
  ][step];
}

function Progress({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center justify-center gap-2">
      {STEPS.map((label, i) => {
        const done = i < step, active = i === step;
        return (
          <li key={label}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-primary text-primary-foreground"
                : done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
            {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span>{i + 1}</span>}
            {label}
          </li>
        );
      })}
    </ol>
  );
}

/** Résumé du parcours avant le calcul. Aucune donnée interne n'est affichée. */
function Recap({ draft, loading, error }: {
  draft: VracDraft; loading: boolean; error: string | null;
}) {
  const material = findVracMaterial(draft.materialId);
  const quantity =
    draft.quantityMode === "tonnes" ? `${draft.tonnes} tonnes`
      : draft.quantityMode === "voyages" ? `${draft.trips} voyage(s)`
        : draft.quantityMode === "dimensions"
          ? `${draft.dims.length} pi × ${draft.dims.width} pi × ${draft.dims.depth} po`
          : "À déterminer avec notre équipe";
  const summary: [string, string][] = [
    ["Matériau", material?.name ?? "—"],
    ["Quantité", quantity],
    ["Adresse de livraison", draft.address || "—"],
    ["Date de livraison", "À confirmer avec notre équipe"],
    ["Nom", draft.contact.name || "—"],
    ["Téléphone", draft.contact.phone || "—"],
    ["Courriel", draft.contact.email || "—"],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {summary.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-muted/30 p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="mt-1 break-words text-base font-semibold text-foreground">{v}</dd>
          </div>
        ))}
      </div>

      <DeliveryDateNotice />

      <div className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Votre soumission instantanée</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {loading
            ? "Calcul de votre estimation en cours…"
            : "Lancez le calcul : vous obtenez immédiatement votre prix livré, toutes taxes incluses."}
        </p>

        {error && (
          <p className="mt-4 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{error}</p>
        )}
      </div>

      <p className="rounded-2xl bg-primary/5 p-4 text-sm text-muted-foreground">
        Notre assistant analyse votre demande afin de calculer automatiquement le meilleur prix
        selon le matériau choisi, la quantité et l'adresse de livraison.
      </p>

      <Button variant="outline" asChild className="w-full sm:w-auto">
        <Link to="/">Retour à l'accueil</Link>
      </Button>
    </div>
  );
}
