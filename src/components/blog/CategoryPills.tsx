import { Link } from "react-router-dom";
import type { BlogCategory } from "@/lib/blog/types";

type Props = { categories: BlogCategory[]; activeSlug?: string };

export default function CategoryPills({ categories, activeSlug }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        to="/blog"
        className={`px-4 py-2 rounded-full text-sm font-display font-semibold transition ${
          !activeSlug
            ? "bg-foreground text-background"
            : "bg-muted text-foreground hover:bg-foreground/10"
        }`}
      >
        Toutes
      </Link>
      {categories.map((c) => {
        const active = c.slug === activeSlug;
        return (
          <Link
            key={c.id}
            to={`/blog/categorie/${c.slug}`}
            className={`px-4 py-2 rounded-full text-sm font-display font-semibold transition border ${
              active
                ? "text-white border-transparent"
                : "bg-card text-foreground border-border hover:border-foreground/40"
            }`}
            style={active ? { backgroundColor: c.color || "#7ED321" } : undefined}
          >
            {c.name}
          </Link>
        );
      })}
    </div>
  );
}