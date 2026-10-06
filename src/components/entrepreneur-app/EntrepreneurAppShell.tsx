import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { markVoluntarySignOut } from "@/lib/navigation/returnTo";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { useEntrepreneurNotifications } from "@/hooks/useEntrepreneurNotifications";
import { Button } from "@/components/ui/button";
import FullPageState from "@/components/FullPageState";
import InstallAppCard from "@/components/entrepreneur-app/InstallAppCard";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Home,
  ClipboardList,
  Map as MapIcon,
  Menu,
  Bell,
  User,
  LogOut,
  Plus,
  ChevronRight,
  ArrowLeft,
  Truck,
  LifeBuoy,
  Wallet,
  FileClock,
  Ticket, ListChecks, CalendarDays, Clock, ContactRound, ReceiptText, Files, ShieldCheck, SlidersHorizontal } from "lucide-react";

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
  { to: "/entrepreneur/chantiers", label: "Chantiers", icon: ClipboardList },
  { to: "/entrepreneur/carte", label: "Dompes", icon: MapIcon },
  { to: "/entrepreneur/transports", label: "Transport", icon: Truck },
] as const;

interface MoreItem {
  to: string;
  label: string;
  hint: string;
  icon: typeof ListChecks;
}

const MORE_SECTIONS: { title: string; items: MoreItem[] }[] = [
  {
    title: "Travail",
    items: [
      { to: "/entrepreneur/taches", label: "Liste de tâches", hint: "Tâches de l'équipe, couleurs, attribution", icon: ListChecks },
      { to: "/entrepreneur/agenda", label: "Agenda", hint: "Rendez-vous, chantiers, rappels, équipe", icon: CalendarDays },
      { to: "/entrepreneur/punch", label: "Punch et heures", hint: "Entrée, sortie, pauses, heures pour la paie", icon: Clock },
      { to: "/entrepreneur/activites", label: "Coupons, voyages et services", hint: "", icon: Ticket },
    ],
  },
  {
    title: "Entreprise",
    items: [
      { to: "/entrepreneur/demandes", label: "Toutes les demandes", hint: "Demandes de tous vos chantiers", icon: ClipboardList },
      { to: "/entrepreneur/crm", label: "Mon CRM", hint: "Vos leads, clients, soumissions", icon: ContactRound },
      { to: "/entrepreneur/finances", label: "Finances", hint: "Obligations et calendrier", icon: Wallet },
      { to: "/entrepreneur/notes-de-frais", label: "Notes de frais", hint: "Dépenses, avances, remboursements", icon: ReceiptText },
      { to: "/entrepreneur/obligations", label: "Obligations et renouvellements", hint: "Registre des entreprises, CTQ, échéances", icon: CalendarDays },
      { to: "/entrepreneur/documents", label: "Documents", hint: "Assurance, RPEVL, permis — glisser et consulter", icon: Files },
      { to: "/entrepreneur/assurances", label: "Assurances", hint: "Polices, couvertures, renouvellements, soumissions", icon: ShieldCheck },
      { to: "/entrepreneur/brouillons", label: "Brouillons", hint: "", icon: FileClock },
      { to: "/entrepreneur/flotte", label: "Ma flotte", hint: "Vos véhicules", icon: Truck },
    ],
  },
  {
    title: "Compte",
    items: [
      { to: "/entrepreneur/notifications", label: "Notifications", hint: "Ce qui demande votre attention", icon: Bell },
      { to: "/entrepreneur/compte", label: "Préférences", hint: "Profil, camions, visibilité", icon: SlidersHorizontal },
    ],
  },
];

const MORE_ITEMS: MoreItem[] = MORE_SECTIONS.flatMap((s) => s.items);

const isActive = (pathname: string, to: string, end?: boolean) =>
  end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

export default function EntrepreneurAppShell({
  title,
  subtitle,
  backTo,
  backLabel = "Retour",
  headerActions,
  showFab = false,
  allowCompanyMembers = false,
  children,
}: Props & { allowCompanyMembers?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isReady: authReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const { unread: unreadCount } = useEntrepreneurNotifications(true);
  const [moreOpen, setMoreOpen] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bottomRef = useRef<HTMLElement>(null);

  // Heights include safe areas and wrapped context; all inner sticky bars share them.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const header = headerRef.current;
    const bottom = bottomRef.current;
    if (!shell || !header || !bottom) return;
    const measure = () => {
      shell.style.setProperty("--ent-header-h", `${header.getBoundingClientRect().height}px`);
      shell.style.setProperty("--ent-bottom-h", `${bottom.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(bottom);
    measure();
    return () => observer.disconnect();
  });

  const isHome = location.pathname === "/entrepreneur";
  const backTarget = backTo === undefined ? (isHome ? null : "/entrepreneur") : backTo;

  useEffect(() => {
    if (!authReady) return;
    if (!user) navigate("/login", { replace: true });
  }, [authReady, user, navigate]);

  const handleLogout = async () => {
    markVoluntarySignOut(); await supabase.auth.signOut();
    navigate("/login");
  };

  if (!authReady || !user || roleLoading) {
    return <FullPageState title="Chargement" message="Votre espace entrepreneur se prépare." />;
  }
  // CRM : les membres d'une entreprise y accèdent; la base de données décide des droits.
  if (!isEntrepreneur && !isAdmin && !allowCompanyMembers) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted-foreground mb-4">Accès réservé aux entrepreneurs autorisés.</p>
          <Button variant="link" onClick={handleLogout}>Se déconnecter</Button>
        </div>
      </div>
    );
  }

  const badge = unreadCount;
  const moreActive = MORE_ITEMS.some((i) => isActive(location.pathname, i.to));

  const navigationLink = (item: { to: string; label: string; icon: typeof Home; end?: boolean }) => {
    const active = isActive(location.pathname, item.to, item.end);
    const Icon = item.icon;
    return <Button key={item.to} asChild variant="ghost" className={`h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left font-body text-sm hover:bg-secondary hover:text-foreground ${active ? "bg-secondary font-semibold text-primary" : "text-muted-foreground"}`}>
      <NavLink to={item.to} aria-current={active ? "page" : undefined}><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></NavLink>
    </Button>;
  };

  return (
    <div ref={shellRef} className="entrepreneur-workspace min-h-dvh w-full max-w-full bg-background">
      <aside className="ent-sidebar fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <Link to="/entrepreneur" className="flex shrink-0 items-center gap-2 px-5 py-5 font-display text-lg font-bold">
          <Truck className="h-5 w-5 text-primary" /><span>Vrac<span className="text-primary">Québec</span></span>
        </Link>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Navigation principale">
          <div className="mb-4">{PRIMARY_TABS.map(navigationLink)}</div>
          {MORE_SECTIONS.map(section => <div key={section.title} className="mb-3">
            <p className="px-3 py-2 font-body text-[11px] font-medium uppercase text-muted-foreground">{section.title}</p>
            {section.items.map(navigationLink)}
          </div>)}
          <Button asChild variant="ghost" className="min-h-11 w-full justify-start gap-3 hover:bg-secondary hover:text-foreground"><a href="tel:5819947717"><LifeBuoy />Aide</a></Button>
        </nav>
        <div className="shrink-0 border-t border-border p-3">
          <Button variant="ghost" onClick={handleLogout} className="min-h-11 w-full justify-start text-muted-foreground hover:bg-secondary hover:text-foreground"><LogOut />Déconnexion</Button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-60">
        <header ref={headerRef} className="ent-header sticky top-0 z-30 w-full border-b border-border/25 bg-card">
          <div className="flex min-h-12 items-center gap-0.5 px-4 sm:px-6">
            {backTarget ? <Button asChild variant="ghost" size="icon" className="h-11 w-11 shrink-0 hover:bg-secondary hover:text-foreground"><Link to={backTarget} aria-label={backLabel}><ArrowLeft /></Link></Button> :
              <Link to="/entrepreneur" className="flex min-h-11 shrink-0 items-center gap-2 font-display text-sm font-bold lg:hidden"><Truck className="h-4 w-4 text-primary" strokeWidth={1.7} /><span>Vrac<span className="text-primary">Québec</span></span></Link>}
            <div className="min-w-0 flex-1 px-2 py-1 lg:px-0">
              {!isHome && title && <h1 className="break-words font-display text-sm font-semibold leading-snug sm:text-base">{title}</h1>}
              {!isHome && subtitle && <p className="break-words font-body text-xs leading-snug text-muted-foreground">{subtitle}</p>}
              {isHome && <span className="hidden font-body text-sm text-muted-foreground lg:inline">Accueil</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1">{headerActions}</div>
            <Button asChild variant="ghost" size="icon" className="relative h-11 w-11 shrink-0 hover:bg-secondary hover:text-foreground">
              <Link to="/entrepreneur/notifications" aria-label={`Notifications${badge ? ` (${badge} non lues)` : ""}`}><Bell className="!h-[18px] !w-[18px]" strokeWidth={1.7} />
                {badge > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 font-body text-[9px] font-semibold text-foreground">{badge > 99 ? "99+" : badge}</span>}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="h-11 w-11 shrink-0 hover:bg-secondary hover:text-foreground"><Link to="/entrepreneur/compte" aria-label="Mon entreprise"><User className="!h-[18px] !w-[18px]" strokeWidth={1.7} /></Link></Button>
          </div>
        </header>
        <main className="ent-main min-w-0 flex-1">{children}</main>
      </div>

      {showFab && <Button asChild variant="default" size="icon" className="ent-create fixed right-4 z-40 h-11 w-11 rounded-lg text-primary-foreground lg:hidden"><Link to="/demande-transport" aria-label="Nouvelle demande" title="Nouvelle demande"><Plus /></Link></Button>}

      <nav ref={bottomRef} className="ent-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/30 bg-card lg:hidden" aria-label="Navigation principale">
        <div className="grid grid-cols-5">
          {PRIMARY_TABS.map(({ to, label, icon: Icon, ...rest }) => {
            const active = isActive(location.pathname, to, "end" in rest ? rest.end : undefined);
            return <Button key={to} asChild variant="ghost" className={`relative h-14 min-w-0 flex-col gap-1 rounded-none px-1 py-2 font-body text-[10px] hover:bg-secondary/30 hover:text-foreground ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              <NavLink to={to} aria-current={active ? "page" : undefined}><Icon className={`!h-5 !w-5 ${active ? "text-primary" : ""}`} strokeWidth={1.8} /><span>{label}</span></NavLink>
            </Button>;
          })}
          <Button variant="ghost" onClick={() => setMoreOpen(true)} aria-label="Plus d'options" aria-current={moreActive ? "page" : undefined} className={`h-14 min-w-0 flex-col gap-1 rounded-none px-1 py-2 font-body text-[10px] hover:bg-secondary/30 hover:text-foreground ${moreActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}><Menu className={`!h-5 !w-5 ${moreActive ? "text-primary" : ""}`} strokeWidth={1.8} /><span>Plus</span></Button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="ent-sheet gap-0 rounded-t-lg px-4" aria-describedby={undefined}>
          <SheetTitle className="mb-2 pr-12 font-display text-base font-semibold">Plus</SheetTitle>
          <nav aria-label="Sections secondaires">
            {MORE_SECTIONS.map(section => <div key={section.title} className="py-2 first:pt-0">
              <p className="px-2 pb-1 pt-2 font-body text-[10px] font-semibold uppercase text-muted-foreground">{section.title}</p>
              {section.items.map(({ to, label, icon: Icon }) => {
                const active = isActive(location.pathname, to);
                return <Button key={to} asChild variant="ghost" className={`h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-2 py-2 text-left font-body text-[13px] hover:bg-secondary hover:text-foreground active:bg-secondary motion-reduce:transition-none ${active ? "bg-secondary text-primary" : "text-foreground"}`}>
                  <Link to={to} onClick={() => setMoreOpen(false)} aria-current={active ? "page" : undefined}><Icon className="shrink-0 text-muted-foreground" strokeWidth={1.6} /><span className="min-w-0 flex-1">{label}</span><ChevronRight className="!h-3.5 !w-3.5 text-muted-foreground/60" strokeWidth={1.6} /></Link>
                </Button>;
              })}
              {section.title === "Compte" && <>
                <Button asChild variant="ghost" className="min-h-11 w-full justify-start gap-3 px-2 font-body text-[13px] hover:bg-secondary hover:text-foreground"><a href="tel:5819947717" onClick={() => setMoreOpen(false)}><LifeBuoy className="text-muted-foreground" strokeWidth={1.6} /><span>Aide</span></a></Button>
                <Button variant="ghost" onClick={handleLogout} className="min-h-11 w-full justify-start gap-3 px-2 font-body text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground"><LogOut strokeWidth={1.6} />Déconnexion</Button>
              </>}
            </div>)}
          </nav>
          <div className="mt-1 border-t border-border/40 pt-2"><InstallAppCard /></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
