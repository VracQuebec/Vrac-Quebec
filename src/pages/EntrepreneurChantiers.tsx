// ============================================================
// MES CHANTIERS — liste en cartes, filtres simples.
// Données : vue calculée partagée (aucune écriture).
// ============================================================
import { useMemo, useState } from "react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/entrepreneur-app/AppStates";
import { ChantierCard } from "@/components/entrepreneur-app/ui";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { NEED_LABELS, needDirection } from "@/lib/parcours/sens-besoin";

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
    <EntrepreneurAppShell title="Chantiers" backTo={null} showFab>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-4">
        {/* Recherche + filtres */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un lieu ou une ville…"
            className="h-12 w-full rounded-md border border-border bg-card pl-11 pr-4 font-body text-sm outline-none focus:border-primary"
            aria-label="Rechercher un chantier"
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Button variant="ghost"
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-11 flex-1 rounded-md px-3 font-display text-sm font-semibold transition-colors ${
                filter === f.key ? "bg-secondary text-primary hover:bg-secondary hover:text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <p className="border-l-2 border-border pl-3 font-body text-xs leading-relaxed text-muted-foreground">
          Chaque demande visible par votre compte a son propre dossier. Aucune n'est regroupée par ville ni présentée comme un projet confirmé de l'entreprise sans rattachement explicite.
        </p>
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
            {visible.map((c) => {
              const encours = c.submissions.some((s) => !isDone(s.status));
              return (
                <ChantierCard
                  key={c.key}
                  to={`/entrepreneur/chantiers/${encodeURIComponent(c.key)}`}
                  label={c.label}
                  detail={`${NEED_LABELS[needDirection(c.submissions[0])]}${
                    c.submissions[0]?.number ? ` · #${c.submissions[0].number}` : ""
                  }${c.materials.length > 0 ? ` · ${c.materials.slice(0, 2).join(", ")}` : ""}${c.lastActivity ? ` · ${new Date(c.lastActivity).toLocaleDateString("fr-CA")}` : ""}`}
                  badge={{ label: encours ? "En cours" : "Terminé", tone: encours ? "active" : "done" }}
                />
              );
            })}
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}
