// ============================================================
// MES CHANTIERS — liste en cartes, filtres simples.
// Données : vue calculée partagée (aucune écriture).
// ============================================================
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/entrepreneur-app/AppStates";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { HardHat, ChevronRight, Search } from "lucide-react";

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "active", label: "En cours" },
  { key: "done", label: "Terminés" },
] as const;

const isDone = (status: string | null) => status === "terminee" || status === "annulee" || status === "refusee";

export default function EntrepreneurChantiers() {
  const { loading, error, chantiers, refresh } = useEntrepreneurData();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    let list = chantiers;
    if (filter === "active") list = list.filter((c) => c.submissions.some((s) => !isDone(s.status)));
    if (filter === "done") list = list.filter((c) => c.submissions.every((s) => isDone(s.status)));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.city ?? "").toLowerCase().includes(q) ||
          (c.address ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [chantiers, filter, query]);

  return (
    <EntrepreneurAppShell title="Mes chantiers" subtitle="Regroupés automatiquement par lieu de travail" showFab>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-4">
        {/* Recherche + filtres */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un lieu ou une ville…"
            className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-4 font-body text-sm outline-none focus:border-primary"
            aria-label="Rechercher un chantier"
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-10 flex-1 rounded-xl px-3 font-display text-sm font-semibold transition-colors ${
                filter === f.key ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingSkeleton lines={3} />
        ) : error ? (
          <ErrorState onRetry={refresh} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={chantiers.length === 0 ? "Aucun chantier pour l'instant" : "Aucun résultat"}
            message={
              chantiers.length === 0
                ? "Vos chantiers apparaîtront ici dès votre première demande."
                : "Essayez un autre filtre ou une autre recherche."
            }
            actionLabel={chantiers.length === 0 ? "Créer ma première demande" : undefined}
            actionTo={chantiers.length === 0 ? "/demande-transport" : undefined}
          />
        ) : (
          <div className="space-y-2.5">
            {visible.map((c) => (
              <Link
                key={c.key}
                to={`/entrepreneur/chantiers/${encodeURIComponent(c.key)}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <HardHat className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold">{c.label}</p>
                  <p className="truncate font-body text-xs text-muted-foreground">
                    {c.submissions.length} demande{c.submissions.length > 1 ? "s" : ""}
                    {c.materials.length > 0 && ` · ${c.materials.slice(0, 2).join(", ")}`}
                    {c.lastActivity && ` · ${new Date(c.lastActivity).toLocaleDateString("fr-CA")}`}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}
