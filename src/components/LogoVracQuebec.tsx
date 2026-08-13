import { Truck } from "lucide-react";

interface Props {
  className?: string;
}

const LogoVracQuebec = ({ className = "" }: Props) => {
  return (
    <a
      href="/"
      aria-label="Vrac Québec — Accueil"
      className={`inline-flex items-center gap-2 sm:gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md ${className}`}
    >
      <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shrink-0">
        <Truck className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" aria-hidden="true" />
      </span>
      <span className="font-display font-extrabold tracking-tight leading-none text-white text-lg sm:text-xl whitespace-nowrap">
        Vrac<span className="text-primary">Québec</span>
      </span>
    </a>
  );
};

export default LogoVracQuebec;
