import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Truck, Loader2 } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";

const inputClass =
  "w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow font-body";

const getFunctionError = async (response: Response) => {
  const raw = await response.text();
  if (!raw) return `Erreur ${response.status}: ${response.statusText}`;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error || parsed?.message || raw;
  } catch {
    return raw;
  }
};

const EntrepreneurSignup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Mot de passe trop court", description: "Minimum 8 caractères.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup-entrepreneur`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ email, password, name, company, phone }),
      });
      if (!response.ok) throw new Error(await getFunctionError(response));

      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;

      try { localStorage.setItem("vq_stay_logged_in", "1"); } catch { /* ignore storage errors */ }
      toast({
        title: "Compte créé",
        description: "Votre compte est en attente de validation par l'équipe Vrac Québec. L'accès aux demandes et aux sites du réseau sera activé dès l'approbation.",
      });
      navigate("/entrepreneur", { replace: true });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Inscription échouée", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TransportBanner />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Truck className="w-6 h-6 text-primary" />
              <span className="font-display font-bold text-xl text-foreground">
                Vrac<span className="text-primary">Québec</span>
              </span>
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Espace entrepreneur</h1>
            <p className="text-muted-foreground text-sm mt-1">Créez votre compte pour accéder aux dompes disponibles</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-3 bg-card p-6 rounded-2xl" style={{ boxShadow: "var(--shadow-lg)" }}>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1 font-display">Nom complet</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1 font-display">Entreprise</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1 font-display">Téléphone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1 font-display">Courriel</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1 font-display">Mot de passe</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required minLength={8} />
              <p className="text-[11px] text-muted-foreground mt-1 font-body">Minimum 8 caractères.</p>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Création..." : "Créer mon compte"}
            </button>
            <p className="text-xs text-center text-muted-foreground font-body pt-2">
              Déjà un compte ? <Link to="/login" className="text-primary underline">Se connecter</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EntrepreneurSignup;
