import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { useCrmNotifications } from "@/hooks/useCrmNotifications";
import FullPageState from "@/components/FullPageState";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Home,
  HardHat,
  ClipboardList,
  Map as MapIcon,
  Menu,
  Bell,
  GitCompareArrows,
  Building2,
  History,
  User,
  LogOut,
  Plus,
  ChevronRight,
  ArrowLeft,
  Truck,
  LifeBuoy,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Coquille unique de l'espace entrepreneur :                         */
/*  — barre de navigation fixe en bas sur téléphone                    */
/*  — barre latérale persistante sur tablette paysage / ordinateur     */
/*  — en-tête unique : retour | contexte | notifications + profil      */
/* ------------------------------------------------------------------ */

interface Props {
  /** Titre de l'écran (contexte affiché au centre de l'en-tête). */
  title?: string;
  /** Petit texte sous le titre (ex. ville du chantier). */
  subtitle?: string;
  /** Où renvoie la flèche retour. Par défaut : /entrepreneur. Absente sur l'accueil. */
  backTo?: string | null;
  backLabel?: string;
  /** Contenu supplémentaire à droite de l'en-tête (actions contextuelles). */
  headerActions?: ReactNode;
  /** Affiche le bouton flottant « Nouvelle demande ». */
  showFab?: boolean;
  children: ReactNode;
}

const PRIMARY_TABS = [
  { to: "/entrepreneur", label: "Accueil", icon: Home, end: true },
  { to: "/entrepreneur/chantiers", label: "Chantiers", icon: HardHat },
  { to: "/entrepreneur/demandes", label: "Demandes", icon: ClipboardList },
  { to: "/entrepreneur/carte", label: "Carte", icon: MapIcon },
] as const;

const MORE_ITEMS = [
  { to: "/entrepreneur/compte", label: "Mon entreprise", hint: "Profil, camions, visibilité", icon: User },
  { to: "/entrepreneur/reseau", label: "Réseau professionnel", hint: "Annuaire des entreprises", icon: Building2 },
  { to: "/entrepreneur/notifications", label: "Notifications", hint: "Ce qui demande votre attention", icon: Bell },
  { to: "/entrepreneur/comparateur", label: "Comparateur de sites", hint: "Comparer les dompes", icon: GitCompareArrows },
  { to: "/entrepreneur/historique", label: "Historique", hint: "Vos demandes passées", icon: History },
] as const;

const SIDEBAR_ITEMS = [
  ...PRIMARY_TABS,
  { to: "/entrepreneur/comparateur", label: "Comparateur", icon: GitCompareArrows },
  { to: "/entrepreneur/reseau", label: "Réseau", icon: Building2 },
  { to: "/entrepreneur/historique", label: "Historique", icon: History },
  { to: "/entrepreneur/compte", label: "Mon entreprise", icon: User },
] as const;

const isActive = (pathname: string, to: string, end?: boolean) =>
  end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

export default function EntrepreneurAppShell({
  title,
  subtitle,
  backTo,
  backLabel = "Retour",
  headerActions,
  showFab = false,
  children,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isReady: authReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const { stats } = useCrmNotifications(true);
  const [moreOpen, setMoreOpen] = useState(false);

  const isHome = location.pathname === "/entrepreneur";
  const backTarget = backTo === undefined ? (isHome ? null : "/entrepreneur") : backTo;

  useEffect(() => {
    if (!authReady) return;
    if (!user) navigate("/login", { replace: true });
  }, [authReady, user, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (!authReady || !user || roleLoading) {
    return <FullPageState title="Chargement" message="Votre espace entrepreneur se prépare." />;
  }
  if (!isEntrepreneur && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted-foreground mb-4">Accès réservé aux entrepreneurs autorisés.</p>
          <button onClick={handleLogout} className="text-primary underline">
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  const badge = stats.unread;
  const moreActive = MORE_ITEMS.some((i) => isActive(location.pathname, i.to));

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      {/* ---------- Barre latérale (tablette paysage / ordinateur) ---------- */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-border bg-card">
        <Link to="/entrepreneur" className="block px-5 py-5">
          <span className="flex items-center gap-2">
            <Truck className="w-6 h-6 shrink-0 text-primary" />
            <span className="font-display font-bold text-lg text-foreground whitespace-nowrap">
              Vrac<span className="text-primary">Québec</span>
            </span>
          </span>
          <span className="mt-1.5 ml-8 inline-block rounded px-2 py-0.5 text-[10px] bg-primary/10 text-primary font-display font-semibold">
            Entrepreneur
          </span>
        </Link>
        <nav className="flex-1 px-3 space-y-1" aria-label="Navigation principale">
          {SIDEBAR_ITEMS.map(({ to, label, icon: Icon, ...rest }) => {
            const active = isActive(location.pathname, to, "end" in rest ? rest.end : undefined);
            return (
              <NavLink
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 min-h-11 font-body text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-border space-y-1">
          <Link
            to="/entrepreneur/notifications"
            className="flex items-center gap-3 rounded-xl px-3.5 py-3 min-h-11 font-body text-sm text-muted-foreground hover:bg-secondary"
          >
            <span className="relative">
              <Bell className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-display font-bold flex items-center justify-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            Notifications
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 min-h-11 font-body text-sm text-muted-foreground hover:bg-secondary"
          >
            <LogOut className="w-5 h-5" /> Déconnexion
          </button>
        </div>
      </aside>

      {/* ---------- Colonne principale ---------- */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* En-tête unique */}
        <header className="sticky top-0 z-20 w-full border-b border-border bg-card/95 backdrop-blur-md safe-x">
          <div className="flex items-center gap-2 px-3 sm:px-6 py-3">
            {backTarget ? (
              <Link
                to={backTarget}
                aria-label={backLabel}
                className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-secondary"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            ) : (
              <span className="lg:hidden flex items-center gap-1.5 -ml-1 px-1">
                <Truck className="w-5 h-5 text-primary" />
                <span className="font-display font-bold text-foreground">
                  Vrac<span className="text-primary">Québec</span>
                </span>
              </span>
            )}
            <div className="min-w-0 flex-1 text-center lg:text-left">
              {title && (
                <h1 className="truncate font-display text-base font-bold sm:text-lg">{title}</h1>
              )}
              {subtitle && (
                <p className="truncate font-body text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {headerActions}
            <Link
              to="/entrepreneur/notifications"
              aria-label={`Notifications${badge ? ` (${badge} non lues)` : ""}`}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-secondary"
            >
              <Bell className={`h-5 w-5 ${stats.urgent > 0 ? "text-destructive" : "text-foreground"}`} />
              {badge > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-display font-bold flex items-center justify-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
            <Link
              to="/entrepreneur/compte"
              aria-label="Mon entreprise"
              className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <User className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <main className="flex-1 w-full min-w-0 pb-28 lg:pb-10 animate-in fade-in duration-150">
          {children}
        </main>
      </div>

      {/* ---------- Bouton d'action flottant (compact, jamais couvrant) ---------- */}
      {showFab && (
        <Link
          to="/demande-transport"
          aria-label="Nouvelle demande"
          className="fixed z-40 lg:hidden right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition-transform"
          style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
        >
          <Plus className="w-6 h-6" />
        </Link>
      )}

      {/* ---------- Barre de navigation inférieure (mobile / tablette portrait) ---------- */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-border bg-card/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Navigation principale"
      >
        <div className="grid grid-cols-5">
          {PRIMARY_TABS.map(({ to, label, icon: Icon, ...rest }) => {
            const active = isActive(location.pathname, to, "end" in rest ? rest.end : undefined);
            return (
              <NavLink
                key={to}
                to={to}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] py-1.5 text-[10px] font-display transition-colors ${
                  active ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                <Icon className="w-6 h-6" strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </NavLink>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="Plus d'options"
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] py-1.5 text-[10px] font-display transition-colors ${
              moreActive ? "text-primary font-bold" : "text-muted-foreground"
            }`}
          >
            <Menu className="w-6 h-6" strokeWidth={moreActive ? 2.4 : 1.8} />
            Plus
          </button>
        </div>
      </nav>

      {/* ---------- Feuille « Plus » ---------- */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88vh] overflow-y-auto rounded-t-3xl px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Plus d'options</SheetTitle>
          <div className="mx-auto mt-2 mb-4 h-1.5 w-10 rounded-full bg-border" />
          <nav className="space-y-1" aria-label="Sections secondaires">
            {MORE_ITEMS.map(({ to, label, hint, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 min-h-14 font-body font-semibold transition-transform active:scale-[0.99] hover:bg-secondary"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{label}</span>
                  <span className="block truncate font-body text-xs font-normal text-muted-foreground">{hint}</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            <a
              href="tel:5819947717"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-2xl px-3 py-3 min-h-14 font-body font-semibold transition-transform active:scale-[0.99] hover:bg-secondary"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LifeBuoy className="w-5 h-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">Aide</span>
                <span className="block truncate font-body text-xs font-normal text-muted-foreground">
                  Parler à quelqu'un : 581-994-7717
                </span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
            </a>
          </nav>
          <div className="my-3 h-px bg-border" />
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3.5 min-h-12 font-body text-sm text-muted-foreground transition-transform active:scale-[0.99] hover:bg-secondary"
          >
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
