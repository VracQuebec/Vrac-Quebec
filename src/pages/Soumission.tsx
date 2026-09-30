// ============================================================
// ASSISTANT INTELLIGENT DE SOUMISSION — Vrac Québec
// Interface seulement. Toute l'intelligence (choix du fournisseur,
// du lieu de chargement, du transporteur, du camion, des prix et
// des taxes) provient du Decision Engine et du Calculation Engine
// via l'API `quote-assistant`. Le module Remblai reste indépendant.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, ShieldCheck, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import TransportBanner from "@/components/TransportBanner";
import { toast } from "@/hooks/use-toast";
import {
  AdvisorPanel, StepAddress, StepCategory, StepContact, StepDate,
  StepMaterial, StepQuantity, type ContactState,
  dimsToCubicMeters, type DimUnit, type QuantityMode,
} from "@/components/soumission/AssistantSteps";
import {
  confirmEstimate, fetchCatalog, requestEstimate,
  type AssistantCategory, type AssistantMaterial, type AssistantTruck,
} from "@/lib/jsc/assistant";
import type { PublicQuote } from "@/lib/jsc/engine";
import { useUnsavedChangesGuard } from "@/lib/navigation/unsavedChanges";
import { useDraft } from "@/lib/drafts/useDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { getAttribution } from "@/lib/analytics/attribution";
import { trackEvent } from "@/lib/analytics/ga4";

const STEPS = ["Matériau", "Type", "Quantité", "Livraison", "Date", "Coordonnées", "Estimation"];
const money = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

const delay = (minutes: number) => {
  const h = Math.round((minutes / 60) * 10) / 10;
  return h < 1 ? `${Math.max(minutes, 15)} minutes sur place` : `environ ${h} h d'opération`;
};

export default function Soumission() {
  // NAV-01 : l'étape vit dans l'historique (?etape=) — Précédent/Retour natif reviennent
  // à l'étape précédente sans rien effacer; les frappes n'ajoutent aucune entrée.
  const [params, setParams] = useSearchParams();
  const step = Math.min(Math.max(Number(params.get("etape") || 1) - 1, 0), STEPS.length - 1);
  const setStep = (v: number | ((s: number) => number)) => {
    const n = typeof v === "function" ? v(step) : v;
    if (n === step) return;
    setParams((p) => { const q = new URLSearchParams(p); if (n === 0) q.delete("etape"); else q.set("etape", String(n + 1)); return q; }, { state: { vqStep: true } });
  };
  const location = useLocation(); const navigate = useNavigate();
  // Précédent = même effet que le Retour natif quand l'étape précédente est dans l'historique (aucune boucle).
  const goPrev = () => {
    if ((location.state as { vqStep?: boolean } | null)?.vqStep) navigate(-1);
    else setParams((p) => { const q = new URLSearchParams(p); if (step <= 1) q.delete("etape"); else q.set("etape", String(step)); return q; }, { replace: true });
  };
  const [categories, setCategories] = useState<AssistantCategory[]>([]);
  const [materials, setMaterials] = useState<AssistantMaterial[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [advisor, setAdvisor] = useState(false);
  const [material, setMaterial] = useState<AssistantMaterial | null>(null);
  const [mode, setMode] = useState<QuantityMode>("tonnes");
  const [tonnes, setTonnes] = useState("");
  const [dims, setDims] = useState({ length: "", width: "", depth: "" });
  const [dimUnits, setDimUnits] = useState<{ length: DimUnit; width: DimUnit; depth: DimUnit }>(
    { length: "pi", width: "pi", depth: "po" },
  );
  const [trips, setTrips] = useState("");
  const [truckId, setTruckId] = useState<string | null>(null);
  const [trucks, setTrucks] = useState<AssistantTruck[]>([]);
  const [address, setAddress] = useState("");
  const [date, setDate] = useState("");
  const [contact, setContact] = useState<ContactState>({ name: "", phone: "", email: "", company: "", comments: "" });

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ number: string; quote: PublicQuote } | null>(null);
  // Verrou synchrone : un double clic ne peut jamais déclencher deux envois.
  const sending = useRef(false);
  const [honeypot, setHoneypot] = useState("");
  const startedAt = useRef<number>(Date.now());

  // NAV-01 : brouillon local (même navigateur) — champs déclarés, aucun secret.
  const [pendingMaterialId, setPendingMaterialId] = useState<string | null>(null);
  const draftData = { categoryId, materialId: material?.id ?? pendingMaterialId, mode, tonnes, dims, dimUnits, trips, truckId, address, date, contact };
  const draft = useDraft({
    id: loadingCatalog ? null : { module: "soumission-publique", form: "assistant", owner: "anon" },
    data: draftData,
    isEmpty: (d) => !d.categoryId && !d.materialId && !d.tonnes && !d.trips && !d.address && !d.contact.name && !d.contact.phone && !d.contact.email,
    onRestore: (d) => {
      setCategoryId(d.categoryId); setMode(d.mode); setTonnes(d.tonnes); setDims(d.dims); setDimUnits(d.dimUnits);
      setTrips(d.trips); setTruckId(d.truckId); setAddress(d.address); setDate(d.date); setContact(d.contact);
      const m = materials.find((x) => x.id === d.materialId) ?? null;
      setMaterial(m); setPendingMaterialId(m ? null : d.materialId);
    },
  });
  const startOver = () => {
    draft.discard();
    setCategoryId(null); setMaterial(null); setPendingMaterialId(null); setMode("tonnes"); setTonnes(""); setDims({ length: "", width: "", depth: "" });
    setTrips(""); setTruckId(null); setAddress(""); setDate(""); setContact({ name: "", phone: "", email: "", company: "", comments: "" });
    setQuote(null); setStep(0);
  };
  // Arrivée directe sur une étape impossible : on rejoint une étape valable, brouillon conservé.
  useEffect(() => {
    if (loadingCatalog || confirmation || !draft.ready || pendingMaterialId) return;
    if (step >= 2 && !material) setParams((p) => { const q = new URLSearchParams(p); q.set("etape", categoryId ? "2" : "1"); if (!categoryId) q.delete("etape"); return q; }, { replace: true });
  }, [step, material, loadingCatalog, draft.ready, pendingMaterialId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retour sur l'étape Estimation (rechargement, Avance natif) : estimation recalculée, jamais inventée.
  useEffect(() => {
    if (step === 6 && material && quantityPayload && !quote && !quoting && !quoteError && !confirmation) void runEstimate();
  }, [step, material]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bandeau de navigation universel : prévient avant de quitter une saisie en cours.
  useUnsavedChangesGuard(
    !confirmation && (step > 0 || !!material || !!address || !!contact.name || !!contact.phone),
  );

  useEffect(() => {
    fetchCatalog()
      .then(({ categories, materials, trucks }) => {
        setCategories(categories); setMaterials(materials); setTrucks(trucks ?? []);
      })
      .catch((e) => setCatalogError(e instanceof Error ? e.message : "Catalogue indisponible."))
      .finally(() => setLoadingCatalog(false));
  }, []);

  const inCategory = useMemo(
    () => materials.filter((m) => (categoryId ? m.category_id === categoryId : true)),
    [materials, categoryId],
  );

  const quantityPayload = useMemo(() => {
    if (mode === "tonnes") {
      const q = Number(tonnes);
      return q > 0 ? { quantity: q, unit: "tonne" as const } : null;
    }
    if (mode === "voyages") {
      const n = Number(trips);
      const truck = trucks.find((t) => t.id === truckId);
      // La capacité vient du panneau administrateur : aucune valeur en dur.
      return n > 0 && truck && truck.capacity_tonnes > 0
        ? { quantity: Number((n * truck.capacity_tonnes).toFixed(3)), unit: "tonne" as const }
        : null;
    }
    const v = dimsToCubicMeters(dims, dimUnits);
    return v > 0 ? { quantity: Number(v.toFixed(3)), unit: "m3" as const } : null;
  }, [mode, tonnes, dims, dimUnits, trips, truckId, trucks]);

  const canContinue = [
    Boolean(categoryId) || Boolean(material),
    Boolean(material),
    Boolean(quantityPayload),
    address.trim().length > 5,
    true,
    contact.name.trim().length > 1 && contact.phone.replace(/\D/g, "").length >= 10 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim()),
    true,
  ][step];

  const runEstimate = async () => {
    if (!material || !quantityPayload) return;
    setQuoting(true); setQuoteError(null); setQuote(null);
    try {
      const { quote } = await requestEstimate({
        material_id: material.id, ...quantityPayload, address: address.trim(),
      });
      setQuote(quote.public);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Estimation indisponible.");
    } finally { setQuoting(false); }
  };

  const next = async () => {
    if (step === 5) { setQuote(null); setQuoteError(null); setStep(6); return; } // estimation lancée par l'effet de l'étape 6
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!material || !quantityPayload || sending.current) return;
    sending.current = true;
    setSubmitting(true);
    try {
      const res = await confirmEstimate({
        material_id: material.id,
        ...quantityPayload,
        address: address.trim(),
        desired_date: date || null,
        contact: {
          name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email.trim(),
          company: contact.company.trim() || undefined, comments: contact.comments.trim() || undefined,
        },
        attribution: getAttribution(),
        website: honeypot,
        form_started_at: startedAt.current,
      });
      setConfirmation({ number: res.request_number, quote: res.quote.public });
      draft.finalize(); // demande confirmée : le brouillon ne peut plus revenir
      trackEvent("lead_created", { form: "soumission" });
    } catch (e) {
      sending.current = false;
      toast({
        title: "Envoi impossible",
        description: e instanceof Error ? e.message : "Veuillez réessayer.",
        variant: "destructive",
      });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Estimation de matériaux en vrac | Vrac Québec</title>
        <meta name="description" content="Obtenez en moins de 60 secondes une estimation de livraison de terre, sable, pierre concassée ou enrochement partout au Québec." />
        <link rel="canonical" href="https://vracquebec.ca/soumission" />
      </Helmet>
      <TransportBanner />

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        {confirmation ? (
          <section className="rounded-3xl border border-primary/40 bg-card p-6 text-center shadow-lg sm:p-10">
            <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
            <h1 className="mt-4 text-2xl font-bold text-foreground">Votre demande est enregistrée</h1>
            <p className="mt-2 text-muted-foreground">
              Référence <span className="font-semibold text-foreground">{confirmation.number}</span>.
              Un conseiller Vrac Québec valide votre estimation et vous contacte rapidement.
            </p>
            <div className="mt-6"><QuoteCard quote={confirmation.quote} /></div>
            <Button asChild className="mt-6"><Link to="/">Retour à l'accueil</Link></Button>
          </section>
        ) : (
          <>
            <header className="mb-6">
              <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <Truck className="h-4 w-4" /> Assistant intelligent de soumission
              </p>
              <h1 className="mt-3 text-3xl font-bold text-foreground">Votre estimation en moins de 60 secondes</h1>
              <p className="mt-2 text-muted-foreground">
                Répondez à quelques questions simples : nous nous occupons de toute la logistique.
              </p>
            </header>

            <Progress step={step} />
            <div className="mt-3"><DraftStatusBar status={draft.status} savedAt={draft.savedAt} restored={!!draft.restoredMeta} onDiscard={startOver} scope="ce navigateur" /></div>

            <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Étape {step + 1} · {STEPS[step]}
              </h2>

              {loadingCatalog && step < 2 && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement du catalogue…
                </p>
              )}
              {catalogError && <p className="text-sm text-destructive">{catalogError}</p>}

              {!loadingCatalog && step === 0 && (
                advisor ? (
                  <AdvisorPanel
                    onCancel={() => setAdvisor(false)}
                    onPick={(m) => { setMaterial(m); setCategoryId(m.category_id); setAdvisor(false); setStep(2); }}
                  />
                ) : categories.length === 0 && materials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Le catalogue de matériaux est en cours de configuration. Contactez-nous et notre équipe préparera votre estimation.
                  </p>
                ) : categories.length === 0 ? (
                  // Aucun regroupement configuré : on présente directement les matériaux
                  // pour ne jamais laisser l'étape 1 sans choix possible.
                  <div className="space-y-3">
                    <StepMaterial materials={materials} value={material?.id ?? null}
                      onSelect={(m) => { setMaterial(m); setCategoryId(m.category_id); setStep(2); }} />
                    <button type="button" onClick={() => setAdvisor(true)}
                      className="w-full rounded-2xl border-2 border-border bg-muted/40 px-4 py-4 text-left transition hover:border-primary/50">
                      <span className="block font-semibold text-foreground">Je ne sais pas quel matériau choisir</span>
                      <span className="block text-sm text-muted-foreground">Répondez à 3 questions, on vous recommande le bon.</span>
                    </button>
                  </div>
                ) : (
                  <StepCategory categories={categories} materials={materials} value={categoryId}
                    onSelect={(id) => { setCategoryId(id); setMaterial(null); setStep(1); }}
                    onNeedHelp={() => setAdvisor(true)} />
                )
              )}

              {step === 1 && (
                <StepMaterial materials={inCategory} value={material?.id ?? null}
                  onSelect={(m) => { setMaterial(m); setStep(2); }} />
              )}

              {step === 2 && (
                <StepQuantity material={material} mode={mode} setMode={setMode}
                  tonnes={tonnes} setTonnes={setTonnes} dims={dims} setDims={setDims}
                  dimUnits={dimUnits} setDimUnits={setDimUnits}
                  trips={trips} setTrips={setTrips}
                  truckId={truckId} setTruckId={setTruckId} trucks={trucks} />
              )}

              {step === 3 && <StepAddress address={address} setAddress={setAddress} />}
              {step === 4 && <StepDate date={date} setDate={setDate} />}
              {step === 5 && <StepContact contact={contact} setContact={setContact} />}
              {/* Champ piège anti-robot : invisible, jamais rempli par un humain. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off"
                value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
                aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />

              {step === 6 && (
                <div className="space-y-4">
                  {quoting && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Notre moteur calcule votre estimation…
                    </p>
                  )}
                  {quoteError && (
                    <div className="space-y-3">
                      <p className="text-sm text-destructive">{quoteError}</p>
                      <Button variant="outline" onClick={runEstimate}>Réessayer</Button>
                    </div>
                  )}
                  {quote && (
                    <>
                      <QuoteCard quote={quote} />
                      <Button className="w-full" size="lg" onClick={submit} disabled={submitting}>
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        Confirmer ma demande
                      </Button>
                    </>
                  )}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={goPrev} disabled={step === 0 || submitting}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Retour
                </Button>
                {step < 6 && (
                  <Button onClick={next} disabled={!canContinue}>
                    Continuer <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </section>

            <p className="mt-4 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Vos informations servent uniquement à préparer votre livraison.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((label, i) => (
        <li key={label}
          className={`rounded-full px-3 py-1 font-medium ${
            i === step ? "bg-primary text-primary-foreground"
              : i < step ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}>
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

/** Résultat public : aucune donnée interne (fournisseur, transporteur, coût, marge). */
function QuoteCard({ quote }: { quote: PublicQuote }) {
  const rows: [string, string][] = [
    ["Matériau", quote.material.name],
    ["Quantité", `${quote.tonnage} tonnes`],
    ["Nombre de voyages", `${quote.trips}`],
    ["Livraison", quote.delivery_address ?? "—"],
    ["Estimation avant taxes", money(quote.subtotal)],
    ...quote.taxes.map((t) => [`${t.name} (${t.rate_percent} %)`, money(t.amount)] as [string, string]),
  ];
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-5 text-left">
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="font-semibold text-foreground">Total estimatif</span>
        <span className="text-2xl font-bold text-primary">{money(quote.total)}</span>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" /> Délai estimé : {delay(quote.estimated_duration_minutes)}
      </p>
      <p className="mt-3 rounded-xl bg-background p-3 text-xs text-muted-foreground">
        Cette estimation est approximative et sera validée par notre équipe avant confirmation.
      </p>
    </div>
  );
}
