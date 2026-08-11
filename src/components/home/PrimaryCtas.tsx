// CTA universels Vrac Québec (point 32) — réutilisables sur toutes les pages.
import { Link } from "react-router-dom";
import { Mountain, Truck, MapPin, HardHat } from "lucide-react";

export const PRIMARY_CTAS = [
  { label: "J'ai besoin de matériaux", to: "/acheter-materiaux", icon: Mountain },
  { label: "J'ai des matériaux à sortir", to: "/depot-materiaux", icon: Truck },
  { label: "Je cherche une dompe", to: "/espace-entrepreneur", icon: MapPin },
  { label: "J'ai besoin de transport", to: "/soumission", icon: HardHat },
] as const;

type Props = { variant?: "hero" | "section"; className?: string };

const PrimaryCtas = ({ variant = "section", className = "" }: Props) => (
  <nav
    aria-label="Actions principales Vrac Québec"
    className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 ${className}`}
  >
    {PRIMARY_CTAS.map(({ label, to, icon: Icon }, i) => (
      <Link
        key={to}
        to={to}
        className={
          i === 0
            ? "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
            : variant === "hero"
              ? "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/70 bg-black/40 px-4 py-3.5 font-display text-sm font-bold uppercase tracking-wide text-white backdrop-blur-sm transition-colors hover:border-primary hover:text-primary"
              : "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-3.5 font-display text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary hover:text-primary"
        }
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </Link>
    ))}
  </nav>
);

export default PrimaryCtas;
