import { Link, useNavigate } from "react-router-dom";
import { markVoluntarySignOut } from "@/lib/navigation/returnTo";
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
  const handleLogout = async () => { markVoluntarySignOut(); await supabase.auth.signOut(); navigate("/login"); };

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
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background flex flex-col">
      <nav className="sticky-below-nav z-30 w-full bg-card/95 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2">
          <Link to="/entrepreneur" className="flex min-w-0 items-center gap-2">
            <Truck className="w-6 h-6 flex-shrink-0 text-primary" />
            <span className="truncate font-display font-bold text-lg sm:text-xl text-foreground">Vrac<span className="text-primary">Québec</span></span>
            <span className="hidden xs:inline sm:inline ml-1 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-700 font-display font-semibold">Entrepreneur</span>
          </Link>
          <button onClick={handleLogout} className="flex flex-shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </nav>
      <TransportBanner />
      <main className="flex-1 w-full min-w-0 container mx-auto px-4 sm:px-6 py-6 sm:py-8">
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