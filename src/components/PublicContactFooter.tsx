// Pied de page public commun : coordonnée publique unique de Vrac Québec.
// Masqué dans les espaces connectés et sur les pages qui ont déjà leur propre pied de page.
import { Link, useLocation } from "react-router-dom";
import { Phone } from "lucide-react";
import { PUBLIC_PHONE, PUBLIC_PHONE_E164 } from "@/lib/public-phone";

const HIDDEN_PREFIXES = [
  "/admin", "/entrepreneur", "/ops", "/portail", "/chauffeur", "/partenaire",
  "/compteur", "/notifications", "/mes-soumissions", "/s/",
];

export function isPublicFooterVisible(pathname: string) {
  // L'accueil et l'index du blogue ont déjà leur propre pied de page (avec le numéro).
  if (pathname === "/" || pathname === "/blog") return false;
  return !HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

export default function PublicContactFooter() {
  const { pathname } = useLocation();
  if (!isPublicFooterVisible(pathname)) return null;
  return (
    <footer className="border-t border-border bg-card py-6 safe-x" aria-label="Coordonnées Vrac Québec">
      <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground font-body sm:flex-row">
        <span>© 2026 Vrac Québec</span>
        <a href={`tel:${PUBLIC_PHONE_E164}`} className="inline-flex min-h-11 items-center gap-2 font-display font-semibold text-foreground hover:text-primary">
          <Phone className="h-4 w-4 text-primary" aria-hidden /> {PUBLIC_PHONE}
        </a>
        <div className="flex gap-4 text-xs">
          <Link to="/espace-entrepreneur" className="inline-flex min-h-11 items-center hover:text-foreground">Je cherche une dompe</Link>
          <Link to="/remblai" className="inline-flex min-h-11 items-center hover:text-foreground">Je veux du remblai</Link>
          <Link to="/contact" className="inline-flex min-h-11 items-center hover:text-foreground">Contact</Link>
          <Link to="/confidentialite" className="inline-flex min-h-11 items-center hover:text-foreground">Confidentialité</Link>
        </div>
      </div>
    </footer>
  );
}
