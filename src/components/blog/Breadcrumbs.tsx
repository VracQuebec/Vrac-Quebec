import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { absoluteUrl } from "@/lib/blog/utils";

export type Crumb = { label: string; to?: string };

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.to ? { item: absoluteUrl(c.to) } : {}),
    })),
  };
  return (
    <>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(ld)}</script>
      </Helmet>
      <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-xs text-muted-foreground font-body">
        <Link to="/" className="hover:text-foreground flex items-center gap-1">
          <Home className="w-3 h-3" /> Accueil
        </Link>
        {items.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            {c.to ? (
              <Link to={c.to} className="hover:text-foreground">
                {c.label}
              </Link>
            ) : (
              <span className="text-foreground font-semibold line-clamp-1 max-w-[240px]">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}