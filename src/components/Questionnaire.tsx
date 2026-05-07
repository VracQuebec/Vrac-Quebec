import { useState, useEffect, useRef } from "react";
import StepMaterials from "./StepMaterials";
import StepDetails from "./StepDetails";
import StepContact from "./StepContact";
import RemblaiForm from "./RemblaiForm";
import { initialFormData, MATERIAL_TYPES, detectRequestType, isRemblaiRequest, type QuestionnaireData } from "@/lib/questionnaire-data";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Send, Check, Loader2, Facebook } from "lucide-react";

const STEPS = [
  { label: "Matériel", number: 1 },
  { label: "Détails", number: 2 },
  { label: "Contact", number: 3 },
];

const Questionnaire = () => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<QuestionnaireData>(initialFormData);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remblaiMode, setRemblaiMode] = useState(false);
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
        data.budgetMax &&
        data.budgetMax.trim() !== ""
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
      if (!data.budgetMax || !data.budgetMax.trim())
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
        deliver_or_remove: data.deliverOrRemove || null,
        contamination: data.contamination || null,
        photos: data.photos || [],
        length_ft: data.lengthFt || null,
        width_ft: data.widthFt || null,
        depth_in: data.depthIn || null,
        delivery_deadline: data.deliveryDeadline || null,
        delivery_timeframe: data.deliveryTimeframe || null,
      };

      const { error } = await supabase
        .from("submissions")
        .insert(submissionPayload);

      if (error) throw error;

      // Backup to Google Sheet (best-effort, never blocks the user)
      try {
        await supabase.functions.invoke("backup-to-sheet", {
          body: {
            submission: {
              ...submissionPayload,
              materials: data.materials.map(
                (id: string) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id
              ),
            },
          },
        });
      } catch (e) {
        console.warn("Backup to sheet failed:", e);
      }

      // Send internal email notification to admin (via Lovable Emails)
      try {
        const materialsLabel = data.materials
          .map((id) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id)
          .join(", ") + (data.otherMaterial ? ` (Autre: ${data.otherMaterial})` : "");
        const budgetStr = data.budgetMax
          ? `${data.budgetMax}${data.budgetUnit ? ` ${data.budgetUnit}` : ""}`
          : "";
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "new-lead-notification",
            recipientEmail: "TransportJSC@hotmail.com",
            idempotencyKey: `new-lead-${submissionId}`,
            templateData: {
              name: data.name,
              phone: data.phone,
              email: data.email,
              address: data.address,
              postalCode: data.postalCode,
              materials: materialsLabel,
              quantity: data.quantity,
              budget: budgetStr,
              notes: data.description,
              deliveryDeadline: data.deliveryDeadline
                ? new Date(data.deliveryDeadline + "T00:00:00").toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })
                : "",
              deliveryTimeframe: data.deliveryTimeframe || "",
              accessibility: (data.accessibility || []).join(", "),
              machinery: isRemblai
                ? data.machineryList.join(", ") + (data.machineryDescription ? ` (Autre: ${data.machineryDescription})` : "")
                : (data.machineryAvailable ? `Oui — ${data.machineryDescription || ""}` : "Non"),
              photosCount: (data.photos || []).length,
              requestType: isRemblai ? "Remblai / dépôt" : "Livraison",
              dompeNumber: "",
              submissionNumber: "",
              submittedAt: new Date().toLocaleString("fr-CA", { timeZone: "America/Toronto" }),
              crmLink: `https://vracquebec.ca/admin?lead=${submissionId}`,
            },
          },
        });
      } catch {
        // Email is best-effort, don't block the user
      }

      // Send confirmation email to the client (best-effort)
      try {
        if (data.email) {
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "client-confirmation",
              recipientEmail: data.email,
              idempotencyKey: `client-confirm-${submissionId}`,
              templateData: { name: data.name },
            },
          });
        }
      } catch {
        // best-effort
      }

      setSubmitted(true);
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
        <p className="text-muted-foreground mb-8 leading-relaxed">
          Nous avons bien reçu votre demande. Une confirmation a été envoyée à
          votre adresse courriel. Un membre de notre équipe vous contactera
          sous peu.
        </p>

        <button
          onClick={() => { setSubmitted(false); setStep(0); setRemblaiMode(false); setData(initialFormData); }}
          className="text-sm text-muted-foreground hover:text-foreground underline font-display"
        >
          Nouvelle demande
        </button>
      </div>
    );
  }

  return (
    <div ref={formTopRef} className="max-w-xl mx-auto px-4 scroll-mt-24">
      {/* Simplified Remblai flow */}
      {step === 0 && (
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

      {step > 0 && isRemblai && (
        <div>
          <button
            onClick={() => { setRemblaiMode(false); setStep(0); }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 font-display"
          >
            <ChevronLeft className="w-4 h-4" /> Changer de matériel
          </button>
          <RemblaiForm data={data} onChange={update} onSubmit={handleSubmit} loading={loading} />
        </div>
      )}

      {step > 0 && !isRemblai && (
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
