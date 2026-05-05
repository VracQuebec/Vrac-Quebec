import { useState } from "react";
import StepMaterials from "./StepMaterials";
import StepDetails from "./StepDetails";
import StepContact from "./StepContact";
import { initialFormData, MATERIAL_TYPES, type QuestionnaireData } from "@/lib/questionnaire-data";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Send, Check, Loader2 } from "lucide-react";

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

  const update = (updates: Partial<QuestionnaireData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const canNext = () => {
    if (step === 0) return data.materials.length > 0;
    if (step === 1) return data.propertyType && data.quantity;
    if (step === 2) return data.name && data.phone && data.email && data.address;
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
      <div className="max-w-lg mx-auto text-center py-16 px-6">
        <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-success" />
        </div>
        <h2 className="text-3xl font-display font-bold text-foreground mb-3">Merci!</h2>
        <p className="text-muted-foreground mb-8">
          Votre demande a été envoyée avec succès. Un membre de notre équipe vous contactera sous peu.
        </p>
        <button
          onClick={() => { setSubmitted(false); setStep(0); setData(initialFormData); }}
          className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 transition-opacity"
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
            <button
              onClick={handleSubmit}
              disabled={!canNext() || loading}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? "Envoi..." : "📩 Envoyer ma demande"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Questionnaire;
