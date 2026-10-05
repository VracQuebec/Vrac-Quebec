import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export interface PageHeaderTab {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface PageHeaderProps {
  /** Lien de retour interne à la section (le bandeau global gère « Retour »/« Accueil »). */
  backTo?: string;
  backLabel?: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  /** Boutons d'action : ils passent à la ligne, jamais hors écran. */
  actions?: ReactNode;
  /** Barre d'onglets défilante horizontalement sur petit écran. */
  tabs?: PageHeaderTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** Largeur maximale du contenu (doit rester cohérente avec le <main> de la page). */
  maxWidthClass?: string;
  above?: ReactNode;
}

/**
 * En-tête de page responsive commun à toute l'administration Vrac Québec.
 * — se place toujours sous le bandeau de navigation global (var CSS --nav-h)
 * — respecte les zones sécuritaires iOS
 * — le titre s'adapte, les actions passent à la ligne, les onglets défilent
 */
export default function PageHeader({
  backTo,
  backLabel = "Retour",
  icon,
  title,
  subtitle,
  badge,
  actions,
  tabs,
  activeTab,
  onTabChange,
  maxWidthClass = "max-w-7xl",
  above,
}: PageHeaderProps) {
  return (
    <header className="sticky-below-nav z-20 w-full border-b border-border bg-card safe-x">
      {above}
      <div
        className={`${maxWidthClass} mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6`}
      >
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
          {backTo && (
            <Link
              to={backTo}
              aria-label={backLabel}
              className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          {icon && <span className="shrink-0 text-primary">{icon}</span>}
          <div className="min-w-0">
            <h1 className="break-words font-display text-base font-bold leading-tight sm:text-xl">{title}</h1>
            {subtitle && (
              <div className="break-words font-body text-xs leading-snug text-muted-foreground">{subtitle}</div>
            )}
          </div>
          {badge}
        </div>

        {actions && <div className="action-row min-w-0 items-center">{actions}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <div className={`${maxWidthClass} no-scrollbar mx-auto w-full overflow-x-auto px-3 sm:px-6`}>
          <div className="flex min-w-max gap-1 pb-2">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onTabChange?.(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 font-body text-sm ${
                    active
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
