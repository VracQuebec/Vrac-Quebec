// ============================================================
// ASSISTANT D'ACHAT DE MATÉRIAUX EN VRAC — Vrac Québec
// Parcours utilisateur + branchement du moteur de calcul unique.
// Aucun prix, aucune carrière, aucun camion, aucun tarif ici :
// tout provient des paramètres administrateur via quote-engine.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Calculator, Check, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import TransportBanner from "@/components/TransportBanner";
import {
  DeliveryDateNotice, Notice, StepContact, StepDelivery, StepMaterial, StepQuantity,
} from "@/components/vrac/VracSteps";
import {
  EMPTY_VRAC_DRAFT, findVracMaterial, getActiveVracMaterials, loadVracDraft,
  saveVracDraft, type VracDraft,
} from "@/lib/vrac/catalog";
import QuoteCard from "@/components/vrac/QuoteCard";
import CatalogPicker from "@/components/vrac/CatalogPicker";
import { buildQuoteRequest, useVracEstimate } from "@/lib/vrac/estimate";
import { useQuoteSubmit } from "@/lib/vrac/submit";
import { useUnsavedChangesGuard } from "@/lib/navigation/unsavedChanges";
import {
  recommendedTruckId, unitLabel, unitsForSlug, useMaterialUnits, usePublicTrucks, useTruckCapacity,
} from "@/lib/vrac/units";

const STEPS = ["Matériau", "Quantité", "Livraison", "Coordonnées", "Résumé et estimation"] as const;

export default function AchatVrac() {
  const materials = useMemo(() => getActiveVracMaterials(), []);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<VracDraft>(EMPTY_VRAC_DRAFT);
  const [searchParams] = useSearchParams();
  const estimate = useVracEstimate();
  const submission = useQuoteSubmit();

  // Sauvegarde automatique + pré-remplissage depuis le calculateur
  // (?material=<slug>&qty=<nombre>&unit=tonne|m3|verge).
  useEffect(() => {
    const saved = loadVracDraft();
    const slug = searchParams.get("material");
    const qty = Number(searchParams.get("qty"));
    const unit = searchParams.get("unit");
    const truck = searchParams.get("truck");
    const preset = slug ? getActiveVracMaterials().find((m) => m.slug === slug) : null;
    if (!preset) { setDraft(saved); return; }
    const validUnit = unit === "m3" || unit === "verge" ? unit : "tonne";
    setDraft({
      ...saved,
      materialId: preset.id,
      quantityMode: qty > 0 ? "tonnes" : saved.quantityMode,
      quantityUnit: qty > 0 ? validUnit : saved.quantityUnit,
      tonnes: qty > 0 ? String(qty) : saved.tonnes,
      // Camion choisi dans le calculateur : évite une seconde saisie.
      truckId: truck || saved.truckId,
    });
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { saveVracDraft(draft); }, [draft]);

  const set = (patch: Partial<VracDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const material = findVracMaterial(draft.materialId);
  const unitsMap = useMaterialUnits();
  const availableUnits = unitsForSlug(unitsMap, material?.slug ?? null);
  const truckCapacity = useTruckCapacity();
  const trucks = usePublicTrucks();
  // Tonnage connu côté client (sert uniquement à suggérer un camion).
  const knownTonnage =
    draft.quantityMode === "tonnes" && draft.quantityUnit === "tonne" && Number(draft.tonnes) > 0
      ? Number(draft.tonnes)
      : null;
  const recommendedId = recommendedTruckId(trucks, knownTonnage);
  const selectedTruck = trucks.find((t) => t.id === (draft.truckId ?? recommendedId)) ?? null;
  const quoteContext = {
    // Un « voyage » correspond à la capacité du camion choisi par le client.
    truckCapacityTonnes: selectedTruck?.capacity_tonnes ?? truckCapacity,
    hasDensity: material ? unitsMap[material.slug]?.hasDensity : undefined,
  };

  // Si le matériau choisi n'accepte pas l'unité en mémoire, on revient aux tonnes.
  useEffect(() => {
    if (!availableUnits.includes(draft.quantityUnit)) set({ quantityUnit: "tonne" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.materialId, availableUnits.join(",")]);

  useUnsavedChangesGuard(step > 0 || !!draft.materialId);

  // Changement de camion : le prix, les voyages et le temps sont recalculés
  // immédiatement, sans recharger la page.
  useEffect(() => {
    if (estimate.quote) void estimate.calculate(draft, quoteContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.truckId]);

  // Tout changement de matériau, quantité, unité ou destination efface l'ancien prix.
  useEffect(() => {
    estimate.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.materialId, draft.quantityMode, draft.quantityUnit, draft.tonnes, draft.trips,
      draft.dims.length, draft.dims.width, draft.dims.depth, draft.address, draft.addressLat, draft.addressLng]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const onDemand = !material && (!!draft.catalog || (draft.customMaterial ?? "").trim().length > 3);
  const canContinue = [
    !!material || onDemand,
    draft.quantityMode === "inconnu"
      || (draft.quantityMode === "tonnes" && Number(draft.tonnes) > 0)
      || (draft.quantityMode === "voyages" && Number(draft.trips) > 0)
      || (draft.quantityMode === "dimensions"
        && Number(draft.dims.length) > 0 && Number(draft.dims.width) > 0 && Number(draft.dims.depth) > 0),
    draft.address.trim().length > 5 && draft.addressLat != null && draft.addressLng != null,
    draft.contact.name.trim().length > 1
      && draft.contact.phone.replace(/\D/g, "").length >= 10
      && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.contact.email.trim()),
    true,
  ][step];

  const blockingMessage = [
    "Choisissez un matériau pour continuer.",
    "Indiquez la quantité approximative pour continuer.",
    "Choisissez une adresse proposée par Google pour continuer.",
    "Complétez votre nom, votre téléphone (10 chiffres) et votre courriel pour continuer.",
    "",
  ][step];

  // Certaines quantités (voyages, quantité inconnue) sont confirmées par notre équipe.
  const estimateBlocked = step === 4 ? buildQuoteRequest(draft, quoteContext) : null;
  const manualReview = !!estimateBlocked && "unsupported" in estimateBlocked;
  const blockedReason = estimateBlocked && "unsupported" in estimateBlocked ? estimateBlocked.unsupported : null;
  const blockedStep = estimateBlocked && "unsupported" in estimateBlocked ? estimateBlocked.fixStep ?? 0 : 0;

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
            <>
              <StepMaterial materials={materials} value={draft.materialId}
                onSelect={(id) => { set({ materialId: id, catalog: null, customMaterial: "" }); setStep(1); }} />
              <CatalogPicker
                value={draft.catalog}
                customMaterial={draft.customMaterial ?? ""}
                onPick={(sel, jscName) => {
                  // Produit tarifé déjà présent dans le parcours : calcul automatique inchangé.
                  const featured = jscName ? materials.find((m) => m.name === jscName) : null;
                  set({ materialId: featured?.id ?? null, catalog: sel, customMaterial: "" });
                  setStep(1);
                }}
                onCustom={(text) => set({ customMaterial: text, materialId: null, catalog: null })}
              />
            </>
          )}
          {step === 1 && (
            <StepQuantity
              draft={draft} set={set} availableUnits={availableUnits}
              trucks={trucks} recommendedId={recommendedId} tonnage={knownTonnage}
            />
          )}
          {step === 2 && <StepDelivery draft={draft} set={set} />}
          {step === 3 && <StepContact draft={draft} set={set} />}
          {/* Champ piège anti-robot : invisible et jamais rempli par un humain. */}
          <input
            type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={submission.honeypot} onChange={(e) => submission.setHoneypot(e.target.value)}
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />
          {step === 4 && onDemand && (
            <ManualRequest draft={draft} submission={submission} />
          )}
          {step === 4 && !onDemand && (
            estimate.quote ? (
              <QuoteCard
                quote={estimate.quote}
                address={draft.address}
                onEmail={() => submission.send(draft, "submit", quoteContext)}
                onCallback={() => submission.send(draft, "callback", quoteContext)}
                onEdit={() => setStep(0)}
                pending={submission.pending}
                result={submission.result}
                error={submission.error}
              />
            ) : (
              <Recap
                draft={draft}
                loading={estimate.loading}
                error={estimate.error}
                manualReview={manualReview}
                blockedReason={blockedReason}
                onFix={() => setStep(blockedStep)}
              />
            )
          )}

          <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Retour
            </Button>
            {step < STEPS.length - 1 ? (
            <Button
              size="lg"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canContinue}
              className={`w-full transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] sm:w-auto ${
                canContinue
                  ? "bg-primary text-primary-foreground shadow-[0_12px_32px_-10px_hsl(var(--primary)/0.55)] hover:bg-primary/90 hover:shadow-[0_16px_40px_-12px_hsl(var(--primary)/0.65)]"
                  : ""
              }`}
            >
              Continuer <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            ) : estimate.quote || manualReview || onDemand ? null : (
              <Button
                size="lg"
                onClick={() => estimate.calculate(draft, quoteContext)}
                disabled={estimate.loading}
                className="w-full bg-primary text-primary-foreground shadow-[0_12px_32px_-10px_hsl(var(--primary)/0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_16px_40px_-12px_hsl(var(--primary)/0.65)] active:scale-[0.98] sm:w-auto"
              >
                {estimate.loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calcul en cours…</>
                  : <><Calculator className="mr-2 h-4 w-4" /> Calculer mon estimation</>}
              </Button>
            )}
          </div>

          {!canContinue && blockingMessage && (
            <p role="status" className="mt-3 text-center text-xs text-muted-foreground sm:text-right">
              {blockingMessage}
            </p>
          )}

          {step === STEPS.length - 1 && (
            <p className="mt-3 text-right text-xs text-muted-foreground">
              Les prix sont calculés automatiquement selon nos tarifs, le matériau choisi,
              la distance de livraison et le camion recommandé.
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
          <li key={label} aria-current={active ? "step" : undefined}
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
function Recap({ draft, loading, error, manualReview, blockedReason, onFix }: {
  draft: VracDraft; loading: boolean; error: string | null; manualReview?: boolean;
  blockedReason?: string | null; onFix?: () => void;
}) {
  const material = findVracMaterial(draft.materialId);
  const quantity =
    draft.quantityMode === "tonnes" ? `${draft.tonnes} ${unitLabel(draft.quantityUnit)}`
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

      {manualReview ? (
        <div className="space-y-3">
          <Notice>
            <strong className="font-semibold text-foreground">Estimation impossible pour le moment.</strong>
            <br />
            {blockedReason ?? "Une information essentielle est manquante."}
            <br />
            Corrigez cette information pour obtenir votre prix instantané, ou appelez-nous au 581-994-7717.
          </Notice>
          {onFix && (
            <Button onClick={onFix} className="w-full sm:w-auto">
              Corriger cette information
            </Button>
          )}
        </div>
      ) : (
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
      )}

      {!manualReview && (
        <p className="rounded-2xl bg-primary/5 p-4 text-sm text-muted-foreground">
          Notre assistant analyse votre demande afin de calculer automatiquement le meilleur prix
          selon le matériau choisi, la quantité et l'adresse de livraison.
        </p>
      )}

      <Button variant="outline" asChild className="w-full sm:w-auto">
        <Link to="/">Retour à l'accueil</Link>
      </Button>
    </div>
  );
}

/** Matériau « Sur demande » ou introuvable : transmis pour traitement manuel, sans montant. */
function ManualRequest({ draft, submission }: { draft: VracDraft; submission: ReturnType<typeof useQuoteSubmit> }) {
  const label = draft.catalog
    ? [draft.catalog.name, draft.catalog.variantLabel].filter(Boolean).join(" — ")
    : `Autre : ${draft.customMaterial}`;
  if (submission.result) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 text-sm">
        <p className="font-semibold text-foreground">Demande transmise {submission.result.request_number ?? ""}</p>
        <p className="mt-1 text-muted-foreground">Soumission à confirmer : notre équipe vous contactera avec un prix.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-2xl border border-border p-5 text-sm">
      <div>
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-muted-foreground">Adresse : {draft.address}</p>
      </div>
      <p className="rounded-xl bg-muted p-3 text-foreground">
        <strong>Sur demande — Soumission à confirmer.</strong> Le prix de ce matériau n'est pas encore calculable
        automatiquement. Votre demande est enregistrée et notre équipe vous transmettra une soumission.
      </p>
      {submission.error && <p className="text-destructive">{submission.error}</p>}
      <Button size="lg" className="w-full sm:w-auto" disabled={!!submission.pending} onClick={() => submission.sendManual(draft)}>
        {submission.pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Transmettre ma demande
      </Button>
    </div>
  );
}
