// ============================================================
// TROUSSE D'INTERFACE — application métier entrepreneur.
// Composants réutilisés sur TOUS les écrans pour une expérience
// cohérente : cartes, actions rapides, feuilles glissantes,
// chronologie, contexte de chantier.
// Présentation uniquement : aucune logique métier ici.
// ============================================================
import { Button } from "@/components/ui/button";
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
    amber: "border-l-2 border-l-attention",
    primary: "border-l-2 border-l-primary",
    destructive: "border-l-2 border-l-destructive",
  };
  const base = `block w-full text-left rounded-md bg-card p-3 transition-colors duration-150 hover:bg-secondary/30 motion-reduce:transition-none ${
    accent ? accents[accent] : ""
  } ${className}`;
  if (to) return <Link to={to} className={base}>{children}</Link>;
  if (onClick) return <Button variant="ghost" type="button" onClick={onClick} className={`${base} h-auto whitespace-normal hover:bg-secondary hover:text-foreground`}>{children}</Button>;
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

/** Compact shortcuts: primary is an accent, never a full-width green block. */
export const QuickActions = ({ actions }: { actions: QuickAction[] }) => (
  <div className={`grid gap-1 ${actions.length === 4 ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
    {actions.map(action => {
      const Icon = action.icon;
      const content = <><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${action.primary ? "bg-primary text-primary-foreground" : "bg-secondary/30 text-foreground/75"}`}><Icon strokeWidth={1.6} className="!h-[19px] !w-[19px]" /></span><span className="text-wrap font-body text-[11px] font-medium leading-tight">{action.label}</span></>;
      const cls = "h-14 min-h-14 min-w-0 flex-col gap-1.5 whitespace-normal rounded-lg px-1 py-1 text-foreground transition-[background-color,transform] duration-150 hover:bg-secondary/50 hover:text-foreground active:scale-[0.97] active:bg-secondary/70 motion-reduce:transform-none motion-reduce:transition-none";
      return action.to ? <Button key={action.label} asChild variant="ghost" className={cls}><Link to={action.to}>{content}</Link></Button> : <Button key={action.label} variant="ghost" onClick={action.onClick} className={cls}>{content}</Button>;
    })}
  </div>
);

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
    <SheetContent side="bottom" className="ent-sheet rounded-t-lg px-4" aria-describedby={undefined}>
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
        <Button variant="ghost"
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border font-body text-sm"
        >
          <X className="h-4 w-4" /> Réinitialiser
        </Button>
      )}
      <Button variant="ghost"
        type="button"
        onClick={() => onOpenChange(false)}
        className="min-h-11 flex-1 rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground"
      >
        Voir les résultats
      </Button>
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
  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-card p-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
      <HardHat className="h-5 w-5" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="font-body text-[10px] uppercase tracking-[0.16em] text-primary">Chantier en cours</p>
      <p className="break-words font-display text-sm font-bold leading-snug">{label}</p>
      {detail && <p className="break-words font-body text-xs leading-snug text-muted-foreground">{detail}</p>}
    </div>
    {to && (
      <Link to={to} aria-label="Ouvrir le chantier" className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-primary/10">
        <ChevronRight className="h-5 w-5 text-primary" />
      </Link>
    )}
    {onClear && (
      <Button variant="ghost" type="button" onClick={onClear} aria-label="Quitter ce chantier" className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-primary/10">
        <X className="h-4 w-4 text-muted-foreground" />
      </Button>
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
  city,
  material,
  metadata,
  badge,
}: {
  to: string;
  label: string;
  detail: string;
  city?: string | null;
  material?: string | null;
  metadata?: string | null;
  badge?: { label: string; tone: "pending" | "active" | "done" | "refused" | "neutral" };
}) => (
  <Link to={to} aria-label={label} className="block py-3 text-left transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 motion-reduce:transition-none">
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-md bg-secondary/45"><HardHat className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.6} /></span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-display text-sm font-semibold leading-snug" title={label}>{label.split(",")[0]}</p>
        {city && <p className="mt-0.5 font-body text-xs text-muted-foreground">{city}</p>}
        {material && <p className="mt-1 break-words font-body text-xs leading-relaxed text-muted-foreground">{material}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><p className="break-words font-body text-[11px] leading-relaxed text-muted-foreground">{detail}</p>{badge && <StatusBadge label={badge.label} tone={badge.tone} signature={badge.tone === "active" || badge.tone === "pending"} />}</div>
        {metadata && <p className="mt-1 font-body text-[11px] text-muted-foreground">{metadata}</p>}
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
    </div>
  </Link>
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
  reference,
  typeLabel,
  city,
  subject,
  badge,
}: {
  to: string;
  kind: "materiau" | "acces";
  title: string;
  place: string;
  footer: string;
  nextAction: string;
  extra?: string | null;
  reference?: string;
  typeLabel?: string;
  city?: string;
  subject?: string;
  badge: { label: string; tone: "pending" | "active" | "done" | "refused" | "neutral" };
}) => (
  <Link to={to} className="group block py-4 text-left transition-colors duration-150 hover:bg-secondary/30 active:bg-secondary/50 motion-reduce:transition-none">
    {(reference || typeLabel) && <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p className="font-body text-[10px] font-bold uppercase text-muted-foreground">{typeLabel || (kind === "acces" ? "Transport" : "Demande")}</p>
      {reference && <p className="font-body text-[11px] font-semibold tabular-nums text-foreground">Nº {reference}</p>}
    </div>}
    <div className="flex items-start gap-3">
      <span
         className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
           kind === "acces" ? "bg-primary/10 text-foreground" : "bg-secondary/50 text-foreground"
        }`}
      >
        {kind === "acces" ? <Truck className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-display text-sm font-semibold leading-snug">{title}</p>
        <p className="flex items-start gap-1 font-body text-xs leading-snug text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" /> {city || place}
        </p>
        {subject && <p className="mt-1 font-body text-xs font-medium text-foreground">{subject}</p>}
      </div>
      
    </div>
    <div className="mt-2 flex items-center justify-between gap-2 pt-1">
      <div className="min-w-0">
        <div className="mb-1"><StatusBadge label={badge.label} tone={badge.tone} /></div><p className="font-body text-xs leading-snug text-muted-foreground">{footer}</p>
        <p className="mt-1 font-body text-xs font-medium leading-snug text-foreground">Prochaine étape · {nextAction}</p>
        {extra && <p className="font-body text-xs leading-snug text-muted-foreground">{extra}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  </Link>
);

/* ---------------------------------------------------------- */
/*  SiteCard — une dompe dans la liste de résultats           */
/* ---------------------------------------------------------- */
export const SiteCard = ({
  title,
  sector,
  availability,
  freshness,
  tags,
  accentColor,
  selected,
  onOpen,
  onDetail,
  onRequest,
  requestLabel = "Demander l'accès",
  requestDisabled = false,
}: {
  title: string;
  sector: string;
  availability: { label: string; color: string };
  freshness?: string;
  tags: string[];
  accentColor: string;
  selected?: boolean;
  onOpen: () => void;
  onDetail: () => void;
  onRequest: () => void;
  requestLabel?: string;
  requestDisabled?: boolean;
}) => (
  <article
    className={`overflow-hidden rounded-lg border bg-card transition-all ${
      selected ? "border-primary/60 " : "border-border/70"
    }`}
  >
    <Button variant="ghost" type="button" onClick={onOpen} className="block h-auto w-full whitespace-normal p-0 text-left hover:bg-secondary hover:text-foreground">
      <div className="flex flex-wrap items-center gap-3 p-4 min-[400px]:flex-nowrap">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${accentColor}22`, color: accentColor }}
        >
          <MapPin className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-display text-sm font-bold leading-snug">{title}</p>
          <p className="break-words font-body text-xs leading-snug text-muted-foreground">{sector}</p>
        </div>
        <span className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-body text-[11px] leading-snug min-[400px]:shrink-0">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: availability.color }} />
          {availability.label}
        </span>
      </div>
      {freshness && <p className="px-4 pb-3 font-body text-[11px] text-muted-foreground">{freshness}</p>}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 font-body text-[10px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
    </Button>
    <div className="card-actions px-4 pb-4 min-[421px]:flex-nowrap">
      <Button variant="ghost"
        type="button"
        onClick={onDetail}
        className="min-h-11 flex-1 rounded-md border border-border bg-background font-body text-xs"
      >
        Voir la fiche
      </Button>
      <Button variant="ghost"
        type="button"
        onClick={requestDisabled ? undefined : onRequest}
        disabled={requestDisabled}
        className="min-h-11 flex-1 rounded-md bg-secondary font-display text-xs font-semibold text-primary hover:bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {requestLabel}
      </Button>
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
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <Circle className="h-5 w-5 text-attention" />
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

/* ---------------------------------------------------------- */
/*  AppTabs — onglets tactiles défilables (dossier chantier)   */
/*  Présentation seule : réorganise des données existantes.    */
/* ---------------------------------------------------------- */
export interface AppTab {
  id: string;
  label: string;
  count?: number;
}

export const AppTabs = ({
  tabs,
  value,
  onChange,
}: {
  tabs: AppTab[];
  value: string;
  onChange: (id: string) => void;
}) => (
  <div
    role="tablist"
    aria-label="Sections du chantier"
    className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {tabs.map((t) => {
      const activeTab = t.id === value;
      return (
        <Button variant="ghost"
          key={t.id}
          role="tab"
          type="button"
          aria-selected={activeTab}
          onClick={() => onChange(t.id)}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-none border-b-2 px-3 font-body text-xs font-medium transition-colors duration-150 ${
            activeTab
              ? "border-primary text-foreground hover:bg-secondary/30"
              : "border-transparent text-muted-foreground hover:bg-secondary/30"
          }`}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span
              className={`rounded-full px-1.5 text-[11px] font-bold ${
                activeTab ? "bg-primary/15 text-foreground" : "bg-secondary/50 text-muted-foreground"
              }`}
            >
              {t.count}
            </span>
          )}
        </Button>
      );
    })}
  </div>
);
