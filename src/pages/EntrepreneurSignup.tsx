import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Truck, Loader2, CheckCircle2 } from "lucide-react";

const inputClass =
  "w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow font-body";

const EntrepreneurSignup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Mot de passe trop court", description: "Minimum 8 caractères.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/entrepreneur`,
          data: { requested_role: "entrepreneur", name, company, phone },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Inscription échouée");

      // Register the entrepreneur intent + profile (unapproved)
      const { error: fnErr } = await supabase.functions.invoke("signup-entrepreneur", {
        body: { user_id: data.user.id, email, name, company, phone },
      });
      if (fnErr) throw fnErr;

      // Sign out any auto-session so the user must verify their email before logging in
      await supabase.auth.signOut();
      setDone(true);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Inscription échouée", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center bg-card p-6 rounded-2xl" style={{ boxShadow: "var(--shadow-lg)" }}>
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <h1 className="font-display font-bold text-xl mb-2">Compte créé</h1>
          <p className="text-sm text-muted-foreground font-body mb-4">
            Un courriel de confirmation a été envoyé à <b>{email}</b>. Cliquez sur le lien pour valider votre adresse.
          </p>
          <p className="text-xs text-muted-foreground font-body mb-4">
            Une fois votre courriel validé, un administrateur doit approuver votre compte avant que vous puissiez voir les leads.
          </p>
          <button onClick={() => navigate("/login")} className="text-primary text-sm font-display font-semibold underline">
            Aller à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">
              Vrac<span className="text-primary">Québec</span>
            </span>
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">Espace entrepreneur</h1>
          <p className="text-muted-foreground text-sm mt-1">Créez votre compte pour accéder aux leads disponibles</p>
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
  );
};

export default EntrepreneurSignup;