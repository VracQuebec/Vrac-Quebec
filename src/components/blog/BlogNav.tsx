import { Link } from "react-router-dom";
import { Truck, HardHat } from "lucide-react";

export default function BlogNav() {
  return (
    <nav className="sticky top-0 z-50 bg-foreground text-background border-b border-foreground/20 backdrop-blur">
      <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          <span className="font-display font-extrabold text-base sm:text-lg">
            Vrac<span className="text-primary">Québec</span>
          </span>
          <span className="hidden sm:inline text-xs uppercase tracking-widest text-background/60 ml-2 pl-2 border-l border-background/20">
            Centre de connaissances
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/#questionnaire"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-primary-foreground font-display font-bold text-xs sm:text-sm hover:opacity-90 transition"
          >
            Faire une demande
          </Link>
          <Link
            to="/login"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-background/30 text-background/90 font-display font-semibold text-xs hover:bg-background/10 transition"
          >
            <HardHat className="w-3.5 h-3.5" /> Entrepreneur
          </Link>
        </div>
      </div>
    </nav>
  );
}