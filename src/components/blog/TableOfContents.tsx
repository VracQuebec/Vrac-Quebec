import { List } from "lucide-react";
import type { TocEntry } from "@/lib/blog/utils";

export default function TableOfContents({ items }: { items: TocEntry[] }) {
  if (!items || items.length < 3) return null;
  return (
    <nav
      aria-label="Table des matières"
      className="my-8 rounded-2xl border border-border bg-muted/40 p-5"
    >
      <div className="flex items-center gap-2 mb-3 text-foreground">
        <List className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-display font-extrabold uppercase tracking-wider">
          Table des matières
        </h2>
      </div>
      <ol className="space-y-1.5 font-body text-sm">
        {items.map((it) => (
          <li key={it.id} className={it.level === 3 ? "ml-4" : ""}>
            <a
              href={`#${it.id}`}
              className="text-muted-foreground hover:text-primary hover:underline underline-offset-2"
            >
              {it.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}