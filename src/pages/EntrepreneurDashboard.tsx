import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { statusBucket } from "@/lib/access-requests/status";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import EntrepreneurNotifications from "@/components/entrepreneur/EntrepreneurNotifications";
import SitesRecommandesList from "@/components/entrepreneur/SitesRecommandesList";
import ReseauNetwork from "@/components/entrepreneur/ReseauNetwork";
import ActivitySummary from "@/components/entrepreneur/ActivitySummary";
import ProfilReseauCard from "@/components/entrepreneur/ProfilReseauCard";
import TransportBanner from "@/components/TransportBanner";
import {
  Truck,
  LogOut,
  Sparkles,
  ClipboardList,
  Star,
  Map as MapIcon,
  History,
  HardHat,
  Building2,
  User,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface StatusCounts {
  pending: number;
  accepted: number;
  completed: number;
  refused: number;
}

const EntrepreneurDashboard = () => {
  const navigate = useNavigate();
  const { user, isReady: authReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const [counts, setCounts] = useState<StatusCounts>({ pending: 0, accepted: 0, completed: 0, refused: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    if (!authReady) return;
    if (!user) navigate("/login", { replace: true });
  }, [authReady, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoadingCounts(true);
      const { data } = await supabase
        .from("transport_requests")
        .select("status")
        .eq("user_id", user.id);
      if (!active) return;
      const c: StatusCounts = { pending: 0, accepted: 0, completed: 0, refused: 0 };
      (data || []).forEach((r: { status: string }) => {
        const bucket = statusBucket(r.status);
        c[bucket]++;
      });
      setCounts(c);
      setLoadingCounts(false);
    })();
    return () => { active = false; };
  }, [user]);

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  if (!authReady || !user || roleLoading) {
    return <FullPageState title="Connexion en cours" message="Votre espace entrepreneur se charge automatiquement." />;
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

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-display font-bold tracking-tight">
            Bienvenue sur votre tableau de bord
          </h1>
          <p className="mt-2 text-muted-foreground font-body max-w-2xl">
            Lancez l'assistant intelligent pour trouver la meilleure dompe pour votre chantier en moins de 60 secondes.
          </p>
        </header>

        {/* Hero: Assistant intelligent */}
        <button
          onClick={() => navigate("/demande-transport")}
          className="group w-full text-left mb-8 rounded-2xl overflow-hidden relative border-2 border-primary bg-gradient-to-br from-primary/90 via-primary to-primary/80 text-primary-foreground p-6 sm:p-10 transition-transform hover:scale-[1.01]"
          style={{ boxShadow: "0 20px 60px -20px rgba(126, 211, 33, 0.5)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-black/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/25 text-[10px] uppercase font-display font-bold tracking-wider mb-2">
                Assistant intelligent
              </div>
              <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">
                Trouver une dompe pour mon chantier
              </h2>
              <p className="text-sm sm:text-base opacity-95 max-w-2xl font-body">
                Décrivez votre chantier en moins de 60 secondes. Notre assistant analyse votre demande et recommande automatiquement la meilleure dompe selon la distance, le matériau, la disponibilité et le type de camion.
              </p>
            </div>
            <div className="flex-shrink-0">
              <span className="inline-flex items-center gap-2 bg-black text-white px-6 py-3.5 rounded-xl font-display font-bold text-base group-hover:gap-3 transition-all">
                Commencer <ArrowRight className="w-5 h-5" />
              </span>
            </div>
          </div>
        </button>

        <EntrepreneurNotifications userId={user?.id} />

        {/* Résumé d'activité — compteurs calculés depuis les données réelles du compte */}
        <ActivitySummary />

        {/* Profil réseau — informations professionnelles réellement enregistrées */}
        <ProfilReseauCard />

        {/* Carte du réseau — vue calculée des chantiers, demandes et sites réellement associés */}
        <ReseauNetwork />

        {/* Sites recommandés — uniquement des sites réellement rattachés à vos demandes */}
        <section className="mb-8" aria-labelledby="sites-recommandes">
          <h2 id="sites-recommandes" className="mb-1 font-display text-xl font-bold sm:text-2xl">
            Sites recommandés
          </h2>
          <p className="mb-4 font-body text-sm text-muted-foreground">
            Les sites déjà rattachés à vos demandes, avec leur contexte réel.
          </p>
          <SitesRecommandesList />
        </section>

        {/* Secondary tools */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Mes demandes */}
          <Link
            to="/entrepreneur/demandes"
            className="group rounded-xl border border-border bg-card p-5 hover:border-primary/60 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <ClipboardList className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="font-display font-bold text-lg">Mes demandes d'accès</h3>
            <p className="text-xs text-muted-foreground mb-3 font-body">Suivez l'état de vos demandes d'accès aux dompes.</p>
            {loadingCounts ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-body">
                <StatPill icon={<Clock className="w-3 h-3" />} label="En attente" value={counts.pending} color="text-amber-600" />
                <StatPill icon={<CheckCircle2 className="w-3 h-3" />} label="Acceptées" value={counts.accepted} color="text-emerald-600" />
                <StatPill icon={<CheckCircle2 className="w-3 h-3" />} label="Terminées" value={counts.completed} color="text-blue-600" />
                <StatPill icon={<XCircle className="w-3 h-3" />} label="Refusées" value={counts.refused} color="text-red-600" />
              </div>
            )}
          </Link>

          <ActionCard
            to="/entrepreneur/favoris"
            icon={<Star className="w-5 h-5" />}
            title="Mes favoris"
            description="Retrouvez vos dompes favorites en un clic."
          />

          <ActionCard
            to="/entrepreneur/chantiers"
            icon={<HardHat className="w-5 h-5" />}
            title="Mes chantiers"
            description="Vos demandes regroupées par lieu de chantier."
          />

          <ActionCard
            to="/entrepreneur/reseau"
            icon={<Building2 className="w-5 h-5" />}
            title="Explorer le réseau"
            description="L'annuaire professionnel des entrepreneurs du réseau."
          />

          <ActionCard
            to="/entrepreneur/carte"
            icon={<MapIcon className="w-5 h-5" />}
            title="Carte des dompes"
            description="Consultez toutes les dompes disponibles sans passer par l'assistant."
          />

          <ActionCard
            to="/entrepreneur/historique"
            icon={<History className="w-5 h-5" />}
            title="Historique"
            description="Toutes vos anciennes demandes d'accès en un coup d'œil."
          />

          <ActionCard
            to="/entrepreneur/compte"
            icon={<User className="w-5 h-5" />}
            title="Mon compte"
            description="Informations de votre entreprise et coordonnées."
          />
        </div>
      </main>
    </div>
  );
};

const StatPill = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) => (
  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-background border border-border">
    <span className={color}>{icon}</span>
    <span className="text-muted-foreground truncate">{label}</span>
    <span className="ml-auto font-display font-bold text-foreground">{value}</span>
  </div>
);

const ActionCard = ({ to, icon, title, description }: { to: string; icon: React.ReactNode; title: string; description: string }) => (
  <Link
    to={to}
    className="group rounded-xl border border-border bg-card p-5 hover:border-primary/60 hover:shadow-md transition-all"
  >
    <div className="flex items-center justify-between mb-3">
      <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </div>
    <h3 className="font-display font-bold text-lg">{title}</h3>
    <p className="text-xs text-muted-foreground font-body">{description}</p>
  </Link>
);

export default EntrepreneurDashboard;