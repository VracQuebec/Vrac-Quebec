import { Link, useNavigate } from "react-router-dom";
import { ReactNode, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Truck, LogOut, ArrowLeft } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

const EntrepreneurShell = ({ title, description, children }: Props) => {
  const navigate = useNavigate();
  const { user, isReady: authReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  useEffect(() => {
    if (!authReady) return;
    if (!user) navigate("/login", { replace: true });
  }, [authReady, user, navigate]);

  if (!authReady || !user || roleLoading) {
    return <FullPageState title="Chargement" message="Votre espace entrepreneur se prépare." />;
  }
  if (!isEntrepreneur && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted-foreground mb-4">Accès réservé aux entrepreneurs autorisés.</p>
          <button onClick={handleLogout} className="text-primary underline">Se déconnecter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="sticky top-0 z-[1000] bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/entrepreneur" className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">Vrac<span className="text-primary">Québec</span></span>
            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-700 font-display font-semibold">Entrepreneur</span>
          </Link>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </nav>
      <TransportBanner />
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link to="/entrepreneur" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4 font-body">
          <ArrowLeft className="w-4 h-4" /> Retour au tableau de bord
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-display font-bold">{title}</h1>
          {description && <p className="mt-1.5 text-muted-foreground font-body">{description}</p>}
        </header>
        {children}
      </main>
    </div>
  );
};

export default EntrepreneurShell;