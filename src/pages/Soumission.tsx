// ============================================================
// ASSISTANT INTELLIGENT DE SOUMISSION — Vrac Québec
// Interface seulement. Toute l'intelligence (choix du fournisseur,
// du lieu de chargement, du transporteur, du camion, des prix et
// des taxes) provient du Decision Engine et du Calculation Engine
// via l'API `quote-assistant`. Le module Remblai reste indépendant.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, ShieldCheck, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import TransportBanner from "@/components/TransportBanner";
import { toast } from "@/hooks/use-toast";
import {
  AdvisorPanel, StepAddress, StepCategory, StepContact, StepDate,
  StepMaterial, StepQuantity, type ContactState,
} from "@/components/soumission/AssistantSteps";
import {
  confirmEstimate, fetchCatalog, requestEstimate,
  type AssistantCategory, type AssistantMaterial,
} from "@/lib/jsc/assistant";
import type { PublicQuote } from "@/lib/jsc/engine";

const STEPS = ["Matériau", "Type", "Quantité", "Livraison", "Date", "Coordonnées", "Estimation"];
const money = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

const delay = (minutes: number) => {
  const h = Math.round((minutes / 60) * 10) / 10;
  return h < 1 ? `${Math.max(minutes, 15)} minutes sur place` : `environ ${h} h d'opération`;
};

export default function Soumission() {
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<AssistantCategory[]>([]);
  const [materials, setMaterials] = useState<AssistantMaterial[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [advisor, setAdvisor] = useState(false);
  const [material, setMaterial] = useState<AssistantMaterial | null>(null);
  const [mode, setMode] = useState<"tonnes" | "volume">("tonnes");
  const [tonnes, setTonnes] = useState("");
  const [dims, setDims] = useState({ length: "", width: "", depth: "" });
  const [address, setAddress] = useState("");
  const [date, setDate] = useState("");
  const [contact, setContact] = useState<ContactState>({ name: "", phone: "", email: "", company: "", comments: "" });

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ number: string; quote: PublicQuote } | null>(null);

  useEffect(() => {
    fetchCatalog()
      .then(({ categories, materials }) => { setCategories(categories); setMaterials(materials); })
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
    const v = Number(dims.length) * Number(dims.width) * Number(dims.depth);
    return v > 0 ? { quantity: Number(v.toFixed(3)), unit: "m3" as const } : null;
  }, [mode, tonnes, dims]);

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
    if (step === 5) { setStep(6); await runEstimate(); return; }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!material || !quantityPayload) return;
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
      });
      setConfirmation({ number: res.request_number, quote: res.quote.public });
    } catch (e) {
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
                  tonnes={tonnes} setTonnes={setTonnes} dims={dims} setDims={setDims} />
              )}

              {step === 3 && <StepAddress address={address} setAddress={setAddress} />}
              {step === 4 && <StepDate date={date} setDate={setDate} />}
              {step === 5 && <StepContact contact={contact} setContact={setContact} />}

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
                <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
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
