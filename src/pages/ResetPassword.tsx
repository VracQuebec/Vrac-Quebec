import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Truck, Loader2 } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Mot de passe trop court", description: "Minimum 8 caractères.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Mot de passe mis à jour", description: "Vous pouvez maintenant vous connecter." });
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TransportBanner />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Truck className="w-6 h-6 text-primary" />
              <span className="font-display font-bold text-xl">Vrac<span className="text-primary">Québec</span></span>
            </div>
            <h1 className="text-2xl font-display font-bold">Nouveau mot de passe</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 bg-card p-6 rounded-2xl" style={{ boxShadow: "var(--shadow-lg)" }}>
            {!ready && (
              <p className="text-xs text-muted-foreground font-body text-center">
                Validation du lien en cours...
              </p>
            )}
            <div>
              <label className="block text-sm font-semibold mb-1 font-display">Nouveau mot de passe</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                className="w-full px-4 py-3 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring font-body" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1 font-display">Confirmer</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8}
                className="w-full px-4 py-3 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring font-body" />
            </div>
            <button type="submit" disabled={loading || !ready}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Mise à jour..." : "Mettre à jour"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
