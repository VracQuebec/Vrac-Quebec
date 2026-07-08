import { Search } from "lucide-react";
import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";

export default function SearchBar({ defaultValue = "", size = "lg" }: { defaultValue?: string; size?: "lg" | "md" }) {
  const [q, setQ] = useState(defaultValue);
  const navigate = useNavigate();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    navigate(`/blog/recherche?q=${encodeURIComponent(query)}`);
  };
  const big = size === "lg";
  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-2xl">
      <Search className={`absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground ${big ? "w-5 h-5" : "w-4 h-4"}`} />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un article, un guide, une question…"
        aria-label="Recherche"
        className={`w-full ${big ? "pl-12 pr-32 py-4 text-base" : "pl-10 pr-24 py-2.5 text-sm"} rounded-full bg-card border border-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary font-body`}
      />
      <button
        type="submit"
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${big ? "px-5 py-2.5 text-sm" : "px-3 py-1.5 text-xs"} rounded-full bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition`}
      >
        Rechercher
      </button>
    </form>
  );
}