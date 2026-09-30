import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { Truck, Loader2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { consumeReturnTo } from "@/lib/navigation/returnTo";
import TransportBanner from "@/components/TransportBanner";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(() => {
    try { return localStorage.getItem("vq_stay_logged_in") !== "0"; } catch { return true; }
  });
  const navigate = useNavigate();
  const { user, isReady: authReady } = useAuthReady();
  const { isAdmin, isEntrepreneur, loading: roleLoading } = useUserRoles(user, authReady);

  // NAV-01 : après connexion, retour à la page de travail du MÊME compte (droits revérifiés
  // ensuite par la page elle-même); autre compte → accueil de son espace, sans reprise.
  const goAfterLogin = (uid: string, fallback: string) => {
    const { path, otherAccount } = consumeReturnTo(uid);
    if (otherAccount) toast({ title: "Nouvelle session", description: "Le travail en cours d'un autre compte n'est pas repris sur ce compte." });
    navigate(path ?? fallback, { replace: true });
  };

  useEffect(() => {
    if (!authReady || !user || roleLoading) return;
    if (isAdmin) goAfterLogin(user.id, "/admin");
    else if (isEntrepreneur) goAfterLogin(user.id, "/entrepreneur");
  }, [authReady, user, roleLoading, isAdmin, isEntrepreneur, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      try {
        localStorage.setItem("vq_stay_logged_in", stayLoggedIn ? "1" : "0");
      } catch {
      }
      if (data.user) {
        let roleList: string[] = [];
        for (let i = 0; i < 3; i++) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", data.user.id);
          roleList = (roles || []).map((r: any) => r.role);
          if (roleList.length > 0) break;
          await new Promise((r) => setTimeout(r, 200));
        }
        goAfterLogin(data.user.id, roleList.includes("admin") ? "/admin" : "/entrepreneur");
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
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>Connexion entrepreneur | Vrac Québec</title>
        <meta name="description" content="Connexion à l'espace professionnel Vrac Québec pour les entrepreneurs et administrateurs du réseau de matériaux en vrac." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href="https://vracquebec.ca/login" />
        <meta property="og:title" content="Connexion entrepreneur | Vrac Québec" />
      </Helmet>
      <TransportBanner />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Truck className="w-6 h-6 text-primary" />
              <span className="font-display font-bold text-xl text-foreground">
                Vrac<span className="text-primary">Québec</span>
              </span>
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Connexion</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Entrepreneurs et administrateurs — accédez à votre portail
            </p>
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
            <div className="flex items-center justify-between text-xs font-body pt-1">
              <Link to="/forgot-password" className="text-muted-foreground hover:text-primary underline">
                Mot de passe oublié ?
              </Link>
              <Link to="/entrepreneur/inscription" className="text-primary hover:underline font-semibold">
                Créer un compte entrepreneur
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
