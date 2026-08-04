// ============================================================
// ASSISTANT D'ACHAT DE MATÉRIAUX EN VRAC — Vrac Québec
// Étape 1 du développement : architecture et parcours utilisateur seulement.
// Aucun moteur de calcul, aucun prix, aucune règle de transport ni fournisseur.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import TransportBanner from "@/components/TransportBanner";
import {
  StepContact, StepDate, StepDelivery, StepMaterial, StepQuantity,
} from "@/components/vrac/VracSteps";
import {
  EMPTY_VRAC_DRAFT, findVracMaterial, getActiveVracMaterials, loadVracDraft,
  saveVracDraft, type VracDraft,
} from "@/lib/vrac/catalog";
import { useUnsavedChangesGuard } from "@/lib/navigation/unsavedChanges";

const STEPS = ["Matériau", "Quantité", "Livraison", "Date", "Coordonnées", "Estimation"] as const;

export default function AchatVrac() {
  const materials = useMemo(() => getActiveVracMaterials(), []);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<VracDraft>(EMPTY_VRAC_DRAFT);

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
    draft.dateMode !== "precise" || !!draft.date,
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
          {step === 3 && <StepDate draft={draft} set={set} />}
          {step === 4 && <StepContact draft={draft} set={set} />}
          {step === 5 && <Recap draft={draft} />}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Retour
            </Button>
            {step < STEPS.length - 1 ? (
            <Button
              size="lg"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canContinue}
              className={`transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] ${
                canContinue
                  ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.45)] hover:bg-primary/90"
                  : ""
              }`}
            >
              Continuer <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            ) : (
              <Button size="lg" asChild>
                <a href="tel:15819947717"><Phone className="mr-2 h-4 w-4" /> Parler à un conseiller</a>
              </Button>
            )}
          </div>
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
    "Quand souhaitez-vous la livraison ?",
    "Vos coordonnées",
    "Résumé de votre demande",
  ][step];
}

function stepHint(step: number) {
  return [
    "Choisissez le matériau qui correspond le mieux à votre projet. Nous vous guiderons ensuite pour calculer automatiquement la quantité, le transport et votre estimation.",
    "Une approximation suffit, nous validerons avec vous.",
    "L'adresse nous permet de planifier la livraison.",
    "Une date précise ou une plage flexible, à votre choix.",
    "Pour vous transmettre votre estimation.",
    "Vérifiez vos informations avant l'envoi.",
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

/** Résumé du parcours. Le calcul de l'estimation sera branché à l'étape suivante du projet. */
function Recap({ draft }: { draft: VracDraft }) {
  const material = findVracMaterial(draft.materialId);
  const quantity =
    draft.quantityMode === "tonnes" ? `${draft.tonnes} tonnes`
      : draft.quantityMode === "voyages" ? `${draft.trips} voyage(s)`
        : draft.quantityMode === "dimensions"
          ? `${draft.dims.length} pi × ${draft.dims.width} pi × ${draft.dims.depth} po`
          : "À déterminer avec notre équipe";
  const when = draft.dateMode === "precise" ? draft.date || "—"
    : draft.dateMode === "flexible" ? "Flexible" : "Le plus tôt possible";

  const rows: [string, string][] = [
    ["Matériau", material?.name ?? "—"],
    ["Quantité", quantity],
    ["Livraison", draft.address || "—"],
    ["Date", when],
    ["Contact", draft.contact.name || "—"],
    ["Téléphone", draft.contact.phone || "—"],
    ["Courriel", draft.contact.email || "—"],
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <dl className="space-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="rounded-2xl bg-primary/5 p-4 text-sm text-muted-foreground">
        Le calcul automatique du prix livré (matériau, transport et taxes) sera activé prochainement.
        D'ici là, un conseiller Vrac Québec confirme votre estimation directement avec vous.
      </p>
      <Button variant="outline" asChild className="w-full sm:w-auto">
        <Link to="/">Retour à l'accueil</Link>
      </Button>
    </div>
  );
}
