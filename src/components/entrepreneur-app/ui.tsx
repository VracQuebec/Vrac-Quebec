// ============================================================
// TROUSSE D'INTERFACE — application métier entrepreneur.
// Composants réutilisés sur TOUS les écrans pour une expérience
// cohérente : cartes, actions rapides, feuilles glissantes,
// chronologie, contexte de chantier.
// Présentation uniquement : aucune logique métier ici.
// ============================================================
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/entrepreneur-app/AppStates";
import {
  ChevronRight,
  HardHat,
  MapPin,
  ClipboardList,
  Truck,
  CheckCircle2,
  Circle,
  X,
  type LucideIcon,
} from "lucide-react";

/* ---------------------------------------------------------- */
/*  AppCard — la brique visuelle de base                      */
/* ---------------------------------------------------------- */
export const AppCard = ({
  to,
  onClick,
  accent,
  className = "",
  children,
}: {
  to?: string;
  onClick?: () => void;
  /** Barre latérale d'attention (ex. action requise). */
  accent?: "amber" | "primary" | "destructive";
  className?: string;
  children: ReactNode;
}) => {
  const accents: Record<string, string> = {
    amber: "border-l-4 border-l-amber-500",
    primary: "border-l-4 border-l-primary",
    destructive: "border-l-4 border-l-destructive",
  };
  const base = `block w-full text-left rounded-2xl border border-border bg-card p-4 transition-transform active:scale-[0.99] ${
    accent ? accents[accent] : ""
  } ${className}`;
  if (to) return <Link to={to} className={base}>{children}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={base}>{children}</button>;
  return <div className={base}>{children}</div>;
};

/* ---------------------------------------------------------- */
/*  QuickActions — grille d'actions tactiles                  */
/* ---------------------------------------------------------- */
export interface QuickAction {
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
}

/* Une seule action dominante : la principale occupe toute la largeur,
   les secondaires se partagent la ligne suivante. */
export const QuickActions = ({ actions }: { actions: QuickAction[] }) => {
  const primary = actions.find((a) => a.primary);
  const rest = actions.filter((a) => a !== primary);

  const render = (a: QuickAction, cls: string, inner: ReactNode) =>
    a.to ? (
      <Link key={a.label} to={a.to} className={cls}>{inner}</Link>
    ) : (
      <button key={a.label} type="button" onClick={a.onClick} className={cls}>{inner}</button>
    );

  return (
    <div className="space-y-2.5">
      {primary &&
        render(
          primary,
          "flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-display text-[15px] font-bold text-primary-foreground shadow-md shadow-primary/25 transition-transform duration-150 active:scale-[0.98]",
          <>
            <primary.icon className="h-5 w-5" />
            {primary.label}
          </>,
        )}
      {rest.length > 0 && (
        <div className={`grid gap-2.5 ${rest.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : rest.length === 3 ? "grid-cols-3" : rest.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {rest.map((a) =>
            render(
              a,
              "flex min-h-[3.5rem] flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 py-2 text-center transition-transform duration-150 active:scale-[0.97]",
              <>
                <a.icon className="h-5 w-5 text-primary" />
                <span className="font-display text-[11px] font-semibold leading-tight">{a.label}</span>
              </>,
            ),
          )}
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------- */
/*  BottomSheet — feuille glissante générique                 */
/* ---------------------------------------------------------- */
export const BottomSheet = ({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl px-4 pb-8" aria-describedby={undefined}>
      <div className="mx-auto mt-1 mb-3 h-1.5 w-10 rounded-full bg-border" />
      <SheetTitle className="mb-4 font-display text-lg font-bold">{title}</SheetTitle>
      {children}
    </SheetContent>
  </Sheet>
);

/** FilterSheet — feuille de filtres avec réinitialisation et validation. */
export const FilterSheet = ({
  open,
  onOpenChange,
  activeCount,
  onReset,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeCount: number;
  onReset: () => void;
  children: ReactNode;
}) => (
  <BottomSheet open={open} onOpenChange={onOpenChange} title="Filtrer les dompes">
    <div className="space-y-5">{children}</div>
    <div className="mt-6 flex gap-2">
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border font-body text-sm"
        >
          <X className="h-4 w-4" /> Réinitialiser
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="min-h-12 flex-1 rounded-2xl bg-primary font-display text-sm font-bold text-primary-foreground"
      >
        Voir les résultats
      </button>
    </div>
  </BottomSheet>
);

/* ---------------------------------------------------------- */
/*  ChantierContextBar — « je travaille sur ce chantier »     */
/* ---------------------------------------------------------- */
export const ChantierContextBar = ({
  label,
  detail,
  to,
  onClear,
}: {
  label: string;
  detail?: string | null;
  to?: string;
  onClear?: () => void;
}) => (
  <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
      <HardHat className="h-5 w-5" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="font-body text-[10px] uppercase tracking-[0.16em] text-primary">Chantier en cours</p>
      <p className="truncate font-display text-sm font-bold">{label}</p>
      {detail && <p className="truncate font-body text-xs text-muted-foreground">{detail}</p>}
    </div>
    {to && (
      <Link to={to} aria-label="Ouvrir le chantier" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-primary/10">
        <ChevronRight className="h-5 w-5 text-primary" />
      </Link>
    )}
    {onClear && (
      <button type="button" onClick={onClear} aria-label="Quitter ce chantier" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-primary/10">
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    )}
  </div>
);

/* ---------------------------------------------------------- */
/*  ChantierCard                                              */
/* ---------------------------------------------------------- */
export const ChantierCard = ({
  to,
  label,
  detail,
  badge,
}: {
  to: string;
  label: string;
  detail: string;
  badge?: { label: string; tone: "pending" | "active" | "done" | "refused" | "neutral" };
}) => (
  <AppCard to={to}>
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <HardHat className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-bold">{label}</p>
        <p className="truncate font-body text-xs text-muted-foreground">{detail}</p>
      </div>
      {badge && <StatusBadge label={badge.label} tone={badge.tone} />}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </div>
  </AppCard>
);

/* ---------------------------------------------------------- */
/*  RequestCard                                               */
/* ---------------------------------------------------------- */
export const RequestCard = ({
  to,
  kind,
  title,
  place,
  footer,
  nextAction,
  extra,
  badge,
}: {
  to: string;
  kind: "materiau" | "acces";
  title: string;
  place: string;
  footer: string;
  nextAction: string;
  extra?: string | null;
  badge: { label: string; tone: "pending" | "active" | "done" | "refused" | "neutral" };
}) => (
  <AppCard to={to}>
    <div className="flex items-center gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          kind === "acces" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"
        }`}
      >
        {kind === "acces" ? <Truck className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{title}</p>
        <p className="flex items-center gap-1 truncate font-body text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" /> {place}
        </p>
      </div>
      <StatusBadge label={badge.label} tone={badge.tone} />
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
      <div className="min-w-0">
        <p className="truncate font-body text-xs text-muted-foreground">{footer}</p>
        <p className="truncate font-display text-xs font-semibold text-primary">{nextAction}</p>
        {extra && <p className="truncate font-body text-xs text-muted-foreground">{extra}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  </AppCard>
);

/* ---------------------------------------------------------- */
/*  SiteCard — une dompe dans la liste de résultats           */
/* ---------------------------------------------------------- */
export const SiteCard = ({
  title,
  sector,
  availability,
  tags,
  accentColor,
  selected,
  onOpen,
  onDetail,
  onRequest,
  requestLabel = "Demander l'accès",
}: {
  title: string;
  sector: string;
  availability: { label: string; color: string };
  tags: string[];
  accentColor: string;
  selected?: boolean;
  onOpen: () => void;
  onDetail: () => void;
  onRequest: () => void;
  requestLabel?: string;
}) => (
  <article
    className={`overflow-hidden rounded-2xl border bg-card transition-all ${
      selected ? "border-primary/60 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.35)]" : "border-border/70"
    }`}
  >
    <button type="button" onClick={onOpen} className="w-full text-left">
      <div className="flex items-center gap-3 p-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accentColor}22`, color: accentColor }}
        >
          <MapPin className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold">{title}</p>
          <p className="truncate font-body text-xs text-muted-foreground">{sector}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-body text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: availability.color }} />
          {availability.label}
        </span>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 font-body text-[10px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
    <div className="flex items-center gap-2 px-4 pb-4">
      <button
        type="button"
        onClick={onDetail}
        className="min-h-11 flex-1 rounded-xl border border-border bg-background font-body text-xs"
      >
        Voir la fiche
      </button>
      <button
        type="button"
        onClick={onRequest}
        className="min-h-11 flex-1 rounded-xl bg-primary font-display text-xs font-semibold text-primary-foreground"
      >
        {requestLabel}
      </button>
    </div>
  </article>
);

/* ---------------------------------------------------------- */
/*  Timeline — chronologie d'événements réels                 */
/* ---------------------------------------------------------- */
export interface TimelineEvent {
  id: string;
  title: string;
  detail?: string | null;
  done: boolean;
}

export const Timeline = ({ events }: { events: TimelineEvent[] }) => (
  <ol className="space-y-0">
    {events.map((e, i) => (
      <li key={e.id} className="flex gap-3 pb-5 last:pb-0">
        <div className="flex flex-col items-center">
          {e.done ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <Circle className="h-5 w-5 text-amber-500" />
          )}
          {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
        </div>
        <div className="min-w-0 pb-1">
          <p className="font-display text-sm font-semibold">{e.title}</p>
          {e.detail && <p className="font-body text-xs text-muted-foreground">{e.detail}</p>}
        </div>
      </li>
    ))}
  </ol>
);
