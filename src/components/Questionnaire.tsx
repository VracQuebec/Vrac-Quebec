import { useState, useEffect } from "react";
import StepMaterials from "./StepMaterials";
import StepDetails from "./StepDetails";
import StepContact from "./StepContact";
import { initialFormData, MATERIAL_TYPES, type QuestionnaireData } from "@/lib/questionnaire-data";
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, submitted]);

  const update = (updates: Partial<QuestionnaireData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const canNext = () => {
    if (step === 0) return data.materials.length > 0;
    if (step === 1) return data.propertyType && data.quantity;
    if (step === 2) return data.name && data.phone && data.email && data.address && data.postalCode;
    return false;
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
    if (!canNext()) {
      toast({ title: "Champs manquants", description: "Veuillez remplir les champs obligatoires.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Geocode address
      const coords = await geocodeAddress(data.address, data.postalCode);

      const { error } = await supabase.from("submissions").insert({
        materials: data.materials,
        other_material: data.otherMaterial,
        property_type: data.propertyType,
        quantity: data.quantity,
        tonnage: data.tonnage,
        budget_unit: data.budgetUnit,
        budget_max: data.budgetMax,
        machinery_available: data.machineryAvailable ?? false,
        machinery_description: data.machineryDescription,
        accessibility: data.accessibility,
        address: data.address,
        postal_code: data.postalCode,
        name: data.name,
        email: data.email,
        phone: data.phone,
        description: data.description,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });

      if (error) throw error;

      // Send email notification
      try {
        await supabase.functions.invoke("notify-submission", {
          body: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            materials: data.materials.map((id) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id).join(", "),
            otherMaterial: data.otherMaterial,
            address: data.address,
            quantity: data.quantity,
            tonnage: data.tonnage,
          },
        });
      } catch {
        // Email is best-effort, don't block the user
      }

      setSubmitted(true);
      toast({ title: "Demande envoyée! ✅", description: "Nous vous contacterons rapidement." });
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Impossible d'envoyer la demande. Réessayez.", variant: "destructive" });
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
        <p className="text-muted-foreground mb-8">
          On vous contacte rapidement (moins de 30 minutes).
        </p>

        <div className="bg-card rounded-2xl p-6 mb-6" style={{ boxShadow: "var(--shadow-lg)" }}>
          <p className="text-base font-display font-semibold text-foreground mb-1">
            Besoin d'une réponse immédiate ?
          </p>
          <p className="text-sm text-muted-foreground mb-4">Contactez-nous directement 👇</p>
          <div className="grid grid-cols-1 gap-3">
            <a
              href="tel:5819947717"
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              📞 Appeler maintenant
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

        <button
          onClick={() => { setSubmitted(false); setStep(0); setData(initialFormData); }}
          className="text-sm text-muted-foreground hover:text-foreground underline font-display"
        >
          Nouvelle demande
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4">
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
        {step === 0 && (
          <StepMaterials
            selected={data.materials}
            otherMaterial={data.otherMaterial}
            onSelect={(materials) => update({ materials })}
            onOtherChange={(otherMaterial) => update({ otherMaterial })}
          />
        )}
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
              onClick={() => canNext() && setStep((s) => s + 1)}
              disabled={!canNext()}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={handleSubmit}
                disabled={!canNext() || loading}
                className="flex items-center gap-1.5 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-base shadow-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
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
    </div>
  );
};

export default Questionnaire;
