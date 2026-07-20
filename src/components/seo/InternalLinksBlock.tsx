import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export type InternalLink = { label: string; href: string; kind?: string };

export default function InternalLinksBlock({ links, title = "Continuez à explorer" }: { links: InternalLink[]; title?: string }) {
  if (!links?.length) return null;
  return (
    <section className="container mx-auto px-4 sm:px-6 py-8 border-t border-border">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-4">{title}</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              to={l.href}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 hover:border-primary transition-colors font-body text-sm text-foreground"
            >
              <span className="truncate">{l.label}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}