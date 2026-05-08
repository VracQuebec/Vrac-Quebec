import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Truck, Loader2 } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Keep the admin session persistent across refreshes, browser restarts,
      // tablet/mobile tab suspensions, and Lovable preview updates.
      try {
        localStorage.setItem("vq_stay_logged_in", "1");
      } catch {
        // ignore storage errors
      }
      // Route based on role
      if (data.user) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        const roleList = (roles || []).map((r: any) => r.role);
        if (roleList.includes("admin")) navigate("/admin", { replace: true });
        else if (roleList.includes("entrepreneur")) navigate("/entrepreneur", { replace: true });
        else navigate("/admin", { replace: true });
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Connexion échouée", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow font-body";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">
              Vrac<span className="text-primary">Québec</span>
            </span>
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">Administration</h1>
          <p className="text-muted-foreground text-sm mt-1">Connectez-vous pour accéder aux demandes</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 bg-card p-6 rounded-2xl" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">Courriel</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="admin@vracquebec.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5 font-display">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Connexion..." : "Se connecter"}
          </button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground font-body cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={stayLoggedIn}
              onChange={(e) => setStayLoggedIn(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
            />
            Rester connecté sur cet appareil
          </label>
        </form>
      </div>
    </div>
  );
};

export default Login;
