import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { markVoluntarySignOut } from "@/lib/navigation/returnTo";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, ArrowLeft, BarChart3, Ban, Bell, BookOpen, Building2, CalendarDays, Database, Home, LayoutDashboard, LogOut, MapPin, Menu, Settings, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import NotificationBell from "@/components/notifications/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { hasUnsavedChanges, subscribeUnsavedChanges } from "@/lib/navigation/unsavedChanges";

const HIDDEN_PATHS = ["/"];

/** Processus (assistants, formulaires) : on propose « Quitter ». */
const PROCESS_PATHS = [
  "/demande-transport",
  "/soumission",
  "/entrepreneur/inscription",
  "/admin/blogue/editer",
];

function parentPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

export default function UniversalNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  const dirty = useSyncExternalStore(subscribeUnsavedChanges, hasUnsavedChanges, () => false);


  const path = location.pathname;
  const isEntrepreneur = path.startsWith("/entrepreneur");
  const isAdmin = path.startsWith("/admin");
  const isProcess = PROCESS_PATHS.some((p) => path.startsWith(p));

  const exitTarget = useMemo(() => {
    if (isAdmin) return "/admin";
    if (isEntrepreneur || path.startsWith("/demande-transport")) return "/entrepreneur";
    return "/";
  }, [isAdmin, isEntrepreneur, path]);

  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(parentPath(path));
  }, [navigate, path]);

  const doExit = useCallback(() => {
    setConfirmOpen(false);
    navigate(exitTarget);
  }, [navigate, exitTarget]);

  const onExitClick = useCallback(() => {
    if (dirty) setConfirmOpen(true);
    else doExit();
  }, [dirty, doExit]);

  /* La hauteur réelle de la barre est publiée en variable CSS (--nav-h)
     pour que tous les en-têtes collants se placent juste en dessous. */
  // L'espace entrepreneur possède sa propre coquille applicative :
  // un seul en-tête, jamais deux barres de navigation empilées.
  const inEntrepreneurApp = isEntrepreneur && !path.startsWith("/entrepreneur/inscription");
  const hidden = HIDDEN_PATHS.includes(path) || inEntrepreneurApp;
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const h = hidden ? 0 : Math.round(navRef.current?.getBoundingClientRect().height ?? 0);
      root.style.setProperty("--nav-h", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [hidden, path]);

  if (hidden) return null;

  const adminLinks = [
    { to: "/admin/centre-controle", label: "Centre de contrôle", icon: Activity },
    { to: "/admin/volets", label: "Coupons, voyages et services", icon: Truck },
    { to: "/admin/taches", label: "Listes de tâches", icon: LayoutDashboard },
    { to: "/admin/agenda", label: "Agendas des entreprises", icon: CalendarDays },
    { to: "/admin/punch", label: "Punch et heures", icon: CalendarDays },
    { to: "/admin", label: "Demandes (CRM)", icon: LayoutDashboard },
    { to: "/admin/notifications", label: "Centre de notifications", icon: Bell },
    { to: "/admin/demandes-acces", label: "Demandes d'accès", icon: Truck },
    { to: "/admin/calendrier", label: "Calendrier", icon: CalendarDays },
    { to: "/admin/flotte", label: "Gestion de la flotte", icon: Truck },
    { to: "/admin/business-intelligence", label: "Business Intelligence", icon: BarChart3 },
    { to: "/admin/blogue", label: "Blogue", icon: BookOpen },
    { to: "/admin/liste-noire", label: "Liste noire", icon: Ban },
    { to: "/admin/seo", label: "SEO", icon: MapPin },
    { to: "/admin/donnees", label: "Données", icon: Database },
    { to: "/admin/settings", label: "Paramètres", icon: Settings },
    { to: "/admin/plateforme", label: "Paramètres plateforme", icon: Settings },
    { to: "/admin/jsc", label: "Back office de l'entreprise", icon: Building2 },
  ];

  if (isAdmin) {
    return (
      <nav
        ref={navRef}
        aria-label="Navigation du CRM"
        className="app-universal-nav safe-top safe-x w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
      >
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-1 px-2 sm:px-4">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 shrink-0" aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="hidden h-11 w-11 shrink-0 sm:inline-flex" aria-label="Accueil">
            <Home className="h-5 w-5" />
          </Button>

          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left hover:bg-secondary/80 sm:flex-none"
          >
            <Truck className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate font-display text-sm font-bold sm:text-base">
              Vrac<span className="text-primary">Québec</span> <span className="text-muted-foreground">CRM</span>
            </span>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <NotificationBell />
            <Sheet open={adminMenuOpen} onOpenChange={setAdminMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Ouvrir le menu CRM">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(88vw,22rem)] gap-0 p-0">
                <div className="flex min-h-16 items-center border-b border-border px-4 pr-14">
                  <SheetTitle className="font-display text-base font-bold">Navigation CRM</SheetTitle>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                  {adminLinks.map(({ to, label, icon: Icon }) => (
                    <Button
                      key={to}
                      type="button"
                      variant={path === to ? "secondary" : "ghost"}
                      onClick={() => { setAdminMenuOpen(false); navigate(to); }}
                      className="min-h-11 w-full justify-start gap-3 whitespace-normal text-left"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{label}</span>
                    </Button>
                  ))}
                </div>
                <div className="border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={async () => { setAdminMenuOpen(false); markVoluntarySignOut(); await supabase.auth.signOut(); navigate("/login"); }}
                    className="min-h-11 w-full justify-start gap-3 text-muted-foreground"
                  >
                    <LogOut className="h-4 w-4" /> Déconnexion
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Navigation universelle"
        className="app-universal-nav safe-top safe-x w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >

        <div className="no-scrollbar mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto px-2 py-2 sm:gap-2 sm:px-4">
          <Button variant="ghost" size="sm" onClick={goBack} className="shrink-0 gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>

          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="shrink-0 gap-1.5">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Accueil</span>
          </Button>

          {(isEntrepreneur || path.startsWith("/demande-transport")) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/entrepreneur")}
              className="shrink-0 gap-1.5"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Tableau de bord</span>
              <span className="sm:hidden">Tableau</span>
            </Button>
          )}

          {isProcess && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExitClick}
              className="ml-auto shrink-0 gap-1.5"
            >
              <X className="h-4 w-4" />
              Quitter
            </Button>
          )}
        </div>
      </nav>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter sans enregistrer&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              Des informations saisies ne sont pas encore envoyées. Si vous quittez maintenant,
              elles pourraient être perdues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer ma saisie</AlertDialogCancel>
            <AlertDialogAction onClick={doExit}>Quitter quand même</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
