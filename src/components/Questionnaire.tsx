import { useState, useEffect, useRef } from "react";
import StepMaterials from "./StepMaterials";
import StepDetails from "./StepDetails";
import StepContact from "./StepContact";
import RemblaiForm from "./RemblaiForm";
import ServiceSelector, { type ServiceKey } from "./ServiceSelector";
import { useNavigate } from "react-router-dom";
import { initialFormData, MATERIAL_TYPES, detectRequestType, isRemblaiRequest, type QuestionnaireData } from "@/lib/questionnaire-data";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logSeoEvent } from "@/lib/seo/tracking";
import { ChevronLeft, ChevronRight, Send, Check, Loader2, Facebook } from "lucide-react";

const STEPS = [
  { label: "Matériel", number: 1 },
  { label: "Détails", number: 2 },
  { label: "Contact", number: 3 },
];

const Questionnaire = ({
  sourcePageSlug,
  initialService,
}: { sourcePageSlug?: string; initialService?: ServiceKey } = {}) => {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceKey | null>(
    initialService === "materiel_remplissage" ? initialService : null,
  );
  const [data, setData] = useState<QuestionnaireData>(
    initialService === "materiel_remplissage"
      ? { ...initialFormData, propertyType: "Remplissage / remblai", deliverOrRemove: "À livrer" }
      : initialFormData,
  );
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remblaiMode, setRemblaiMode] = useState(initialService === "materiel_remplissage");
  const isRemblai =
    remblaiMode || isRemblaiRequest(data.materials, data.propertyType);
  const formTopRef = useRef<HTMLDivElement>(null);
  const isPopStateRef = useRef(false);
  const [showErrors, setShowErrors] = useState(false);

  // Sync browser history with current step
  useEffect(() => {
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    const state = { questionnaireStep: step };
    if (step === 0) {
      window.history.replaceState(state, "");
    } else {
      window.history.pushState(state, "");
    }
  }, [step]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const targetStep =
        e.state && typeof e.state.questionnaireStep === "number"
          ? e.state.questionnaireStep
          : 0;
      isPopStateRef.current = true;
      setStep(targetStep);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (formTopRef.current) {
      const offset = 80;
      const top = formTopRef.current.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    }
  }, [step, submitted]);

  const update = (updates: Partial<QuestionnaireData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const canNext = () => {
    if (step === 0) return data.materials.length > 0;
    if (step === 1)
      return (
        data.propertyType &&
        data.quantity &&
        data.deliveryDeadline &&
        (!isRemblai || (data.budgetMax && data.budgetMax.trim() !== ""))
      );
    if (step === 2) return data.name && data.phone && data.email && data.address && data.postalCode;
    return false;
  };

  const getMissingFields = (): string[] => {
    const missing: string[] = [];
    if (step === 1) {
      if (!data.propertyType) missing.push("Type de projet");
      if (!data.quantity) missing.push("Taille du projet");
      if (!data.deliveryDeadline) missing.push("Date de livraison");
      if (isRemblai && (!data.budgetMax || !data.budgetMax.trim()))
        missing.push("Budget par voyage");
    }
    if (step === 2) {
      if (!data.name) missing.push("Nom");
      if (!data.phone) missing.push("Téléphone");
      if (!data.email) missing.push("Courriel");
      if (!data.address) missing.push("Adresse");
      if (!data.postalCode) missing.push("Code postal");
    }
    return missing;
  };

  const handleNext = () => {
    if (!canNext()) {
      setShowErrors(true);
      const missing = getMissingFields();
      toast({
        title: "Champs à remplir",
        description: missing.length
          ? `Merci de compléter : ${missing.join(", ")}`
          : "Veuillez compléter cette étape.",
        variant: "destructive",
      });
      return;
    }
    setShowErrors(false);
    setStep((s) => s + 1);
  };

  const geocodeAddress = async (address: string, postalCode: string): Promise<{ lat: number; lng: number } | null> => {
    const queries = [
      `${address}, ${postalCode}, Québec, Canada`,
      postalCode ? `${postalCode}, Québec, Canada` : null,
      `${address}, Québec, Canada`,
    ].filter(Boolean) as string[];

    for (const q of queries) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=ca`);
        const results = await res.json();
        if (results.length > 0) {
          return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
        }
      } catch {
        // try next query
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    // Remblai form has its own validation — skip the multi-step canNext check
    if (!isRemblai && !canNext()) {
      setShowErrors(true);
      const missing = getMissingFields();
      toast({
        title: "Champs manquants",
        description: missing.length
          ? `Merci de compléter : ${missing.join(", ")}`
          : "Veuillez remplir les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const submissionId = crypto.randomUUID();
      // Geocode address
      const coords = await geocodeAddress(data.address, data.postalCode);

      const submissionPayload = {
        id: submissionId,
        materials: data.materials,
        other_material: data.otherMaterial,
        property_type: data.propertyType || (isRemblai ? "Remplissage / remblai" : ""),
        quantity: data.quantity,
        tonnage: data.tonnage,
        budget_unit: data.budgetUnit,
        budget_max: data.budgetMax,
        machinery_available:
          data.machineryAvailable ??
          (isRemblai
            ? data.machineryList.length > 0 && !(data.machineryList.length === 1 && data.machineryList[0] === "Aucune")
            : false),
        machinery_description: isRemblai
          ? [
              data.machineryList.join(", "),
              data.machineryDescription ? `Autre: ${data.machineryDescription}` : "",
            ]
              .filter(Boolean)
              .join(" — ")
          : data.machineryDescription,
        accessibility: data.accessibility,
        address: data.address,
        postal_code: data.postalCode,
        name: data.name,
        email: data.email,
        phone: data.phone,
        description: [
          data.description,
          data.propertyType === "Autre" && data.projectDescription
            ? `Projet: ${data.projectDescription}`
            : "",
          data.quantity === "Autre" && data.quantityOther
            ? `Taille: ${data.quantityOther}`
            : "",
          Object.entries(data.materialQuantities || {})
            .filter(([, v]) => v && v.trim())
            .map(([id, v]) => {
              const label = MATERIAL_TYPES.find((m) => m.id === id)?.label || id;
              return `${label}: ${v}`;
            })
            .join(" | "),
          data.deliveryFlexibility ? `Flexibilité: ${data.deliveryFlexibility}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        request_type: isRemblai ? "remblai" : detectRequestType(data.materials, data.propertyType),
        visible_to_entrepreneur: (isRemblai ? "remblai" : detectRequestType(data.materials, data.propertyType)) === "vrac" ? false : true,
        deliver_or_remove: data.deliverOrRemove || null,
        contamination: data.contamination || null,
        photos: data.photos || [],
        length_ft: data.lengthFt || null,
        width_ft: data.widthFt || null,
        depth_in: data.depthIn || null,
        delivery_deadline: data.deliveryDeadline || null,
        delivery_timeframe: data.deliveryTimeframe || null,
        // Point 30 — vérification d'accès au chantier.
        access_heavy_truck: data.accessHeavyTruck || null,
        access_details:
          data.accessDetails && data.accessDetails.length > 0 ? { criteres: data.accessDetails } : null,
        // Type de service choisi par le client — pilote le pipeline CRM.
        service_type: service ?? (isRemblai ? "remblai_disposition" : "materiel_remplissage"),
      };

      const { error } = await supabase
        .from("submissions")
        .insert(submissionPayload);

      if (error) throw error;

      // Backup to Google Sheet (best-effort, never blocks the user)
      try {
        await supabase.functions.invoke("backup-to-sheet", {
          body: { submission_id: submissionId },
        });
      } catch (e) {
        console.warn("Backup to sheet failed:", e);
      }

      // Send internal email notification to admin (via Lovable Emails)
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "new-lead-notification",
            idempotencyKey: `new-lead-${submissionId}`,
            submissionId,
          },
        });
      } catch {
        // Email is best-effort, don't block the user
      }

      // Send confirmation email to the client (best-effort)
      if (data.email) {
        try {
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "client-confirmation",
              idempotencyKey: `client-confirm-${submissionId}`,
              submissionId,
            },
          });
        } catch {
          // Best-effort
        }
      }

      setSubmitted(true);
      if (sourcePageSlug) {
        logSeoEvent(sourcePageSlug, "submission");
      }
      toast({ title: "Demande envoyée! ✅", description: "Nous vous contacterons rapidement." });
    } catch (err) {
      console.error(err);
      const msg = (err as { message?: string })?.message || "Impossible d'envoyer la demande. Réessayez.";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 px-6">
        <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-success" />
        </div>
        <h2 className="text-3xl font-display font-bold text-foreground mb-3">✅ Demande envoyée !</h2>
        <p className="text-muted-foreground mb-4">
          On analyse votre besoin et on vous contacte en moins de 30 minutes.
        </p>
        <div className="bg-success/5 border border-success/20 rounded-xl p-4 mb-6 text-sm text-foreground/80">
          Nous avons bien reçu votre demande. Une confirmation a été envoyée à votre adresse courriel. Un membre de notre équipe vous contactera sous peu.
        </div>
        <div className="text-sm text-muted-foreground mb-8 space-y-1">
          <p>📍 Livraison rapide dans la région de Québec</p>
          <p>🚛 Plusieurs camions disponibles aujourd'hui</p>
        </div>

        <div className="bg-card rounded-2xl p-6 mb-6" style={{ boxShadow: "var(--shadow-lg)" }}>
          <p className="text-base font-display font-semibold text-foreground mb-1">
            Besoin d'une réponse immédiate ?
          </p>
          <p className="text-sm text-muted-foreground mb-4">Passez en priorité 👇</p>
          <div className="grid grid-cols-1 gap-3">
            <a
              href="tel:5819947717"
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              📞 Appeler — 581-994-7717
            </a>
            <a
              href="tel:8195923495"
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              📞 Appeler — 819-592-3495
            </a>
            <a
              href="sms:15819947717?body=Bonjour%2C%20j%27aimerais%20avoir%20une%20soumission%20pour%20du%20mat%C3%A9riel%20en%20vrac."
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-foreground text-foreground font-display font-semibold text-sm hover:bg-foreground/5 transition-colors"
            >
              💬 Envoyer un texto
            </a>
            <a
              href="https://wa.me/15819947717?text=Bonjour%2C%20j%27aimerais%20avoir%20une%20soumission%20pour%20du%20mat%C3%A9riel%20en%20vrac."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-[#25D366] text-white font-display font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              🟢 WhatsApp
            </a>
            <a
              href="https://www.facebook.com/share/1B2yGEaTL1/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-[#0084FF] text-white font-display font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <Facebook className="w-4 h-4" /> Facebook / Messenger
            </a>
          </div>
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 mb-6 text-left">
          <p className="text-sm font-display font-semibold text-foreground mb-2">💡 Astuce :</p>
          <p className="text-sm text-muted-foreground mb-2">
            On peut souvent livrer aujourd'hui ou demain selon votre secteur.
          </p>
          <p className="text-sm text-muted-foreground">
            Mentionnez si votre besoin est urgent pour passer en priorité.
          </p>
        </div>

        <button
          onClick={() => {
            setSubmitted(false); setStep(0); setRemblaiMode(false);
            setService(null); setData(initialFormData);
          }}
          className="text-sm text-muted-foreground hover:text-foreground underline font-display"
        >
          Nouvelle demande
        </button>
      </div>
    );
  }

  return (
    <div ref={formTopRef} className={`${service ? "max-w-xl" : "max-w-5xl"} mx-auto px-4 scroll-mt-24`}>
      {/* Étape 0 — quel service ? */}
      {!service && (
        <ServiceSelector
          onSelect={(key) => {
            if (key === "vrac_achat") {
              // Achat de matériaux en vrac : assistant dédié (parcours guidé par étapes).
              navigate("/acheter-materiaux");
              return;
            }
            if (key === "remblai_disposition") {
              // Disposition de remblai : présentation de la plateforme puis connexion/inscription.
              navigate("/espace-entrepreneur");
              return;
            }
            setService(key);
            // Les deux parcours remblai partagent le même formulaire (aucun champ retiré) ;
            // seuls l'habillage et le sens de la demande changent.
            setRemblaiMode(true);
            update({
              propertyType: "Remplissage / remblai",
              deliverOrRemove: "À livrer",
            });
            setStep(1);
          }}
        />
      )}

      {service && (
        <button
          type="button"
          onClick={() => { setService(null); setRemblaiMode(false); setStep(0); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 font-display"
        >
          <ChevronLeft className="w-4 h-4" /> Changer de service
        </button>
      )}

      {/* Simplified Remblai flow */}
      {service && step === 0 && (
        <div className="bg-card rounded-2xl p-6 md:p-8" style={{ boxShadow: "var(--shadow-lg)" }}>
          <StepMaterials
            selected={data.materials}
            otherMaterial={data.otherMaterial}
            onSelect={(materials) => update({ materials })}
            onOtherChange={(otherMaterial) => update({ otherMaterial })}
          />
          <div className="flex justify-end mt-8 pt-6 border-t border-border">
            <button
              onClick={() => {
                if (!canNext()) return;
                const enteringRemblaiMode = isRemblaiRequest(data.materials, data.propertyType);
                setRemblaiMode(enteringRemblaiMode);
                if (enteringRemblaiMode) {
                  update({ materials: [], otherMaterial: "", propertyType: "Remplissage / remblai" });
                }
                setStep(1);
              }}
              disabled={!canNext()}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {service && step > 0 && isRemblai && (
        <div>
          <RemblaiForm
            data={data}
            onChange={update}
            onSubmit={handleSubmit}
            loading={loading}
            variant={service === "remblai_disposition" ? "disposition" : "recherche"}
          />
        </div>
      )}

      {service && step > 0 && !isRemblai && (
        <>
      {/* Progress */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.number} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold font-display transition-all ${
                i === step
                  ? "bg-primary text-primary-foreground shadow-md"
                  : i < step
                  ? "bg-success text-success-foreground cursor-pointer"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="w-4 h-4" /> : s.number}
            </button>
            <span className={`text-xs font-display font-semibold hidden sm:inline ${
              i === step ? "text-foreground" : "text-muted-foreground"
            }`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 ${i < step ? "bg-success" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-card rounded-2xl p-6 md:p-8" style={{ boxShadow: "var(--shadow-lg)" }}>
        {step === 1 && <StepDetails data={data} onChange={update} />}
        {step === 2 && <StepContact data={data} onChange={update} />}

        {/* Nav buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t border-border">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg font-display font-semibold text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Précédent
          </button>

          {step < 2 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-1.5 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-base shadow-md hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {loading ? "Envoi..." : "Recevoir mon prix →"}
              </button>
              <p className="text-xs text-muted-foreground font-body text-right">
                ✔ Réponse rapide &nbsp; ✔ Aucun engagement &nbsp; ✔ Conseils inclus
              </p>
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default Questionnaire;
