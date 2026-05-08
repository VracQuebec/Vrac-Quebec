import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Truck, Loader2, MailCheck } from "lucide-react";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl">Vrac<span className="text-primary">Québec</span></span>
          </div>
          <h1 className="text-2xl font-display font-bold">Mot de passe oublié</h1>
        </div>
        {sent ? (
          <div className="bg-card p-6 rounded-2xl text-center" style={{ boxShadow: "var(--shadow-lg)" }}>
            <MailCheck className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <p className="text-sm font-body">
              Si un compte existe pour <b>{email}</b>, un courriel de réinitialisation a été envoyé.
            </p>
            <Link to="/login" className="text-primary text-sm font-display font-semibold underline mt-4 inline-block">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4 bg-card p-6 rounded-2xl" style={{ boxShadow: "var(--shadow-lg)" }}>
            <div>
              <label className="block text-sm font-semibold mb-1 font-display">Courriel</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-4 py-3 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring font-body" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Envoi..." : "Envoyer le lien"}
            </button>
            <p className="text-xs text-center text-muted-foreground font-body">
              <Link to="/login" className="text-primary underline">Retour à la connexion</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;