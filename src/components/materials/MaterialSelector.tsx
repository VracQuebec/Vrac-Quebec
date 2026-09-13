// Sélecteur de matériaux réutilisable — une seule taxonomie, deux modes.
// mode="simple"    : propriétaire / grand public (grandes cartes, précision facultative)
// mode="detaille"  : entrepreneur, répartiteur, administrateur (recherche, calibres, accepté/refusé/inconnu)
// Aucune bascule de production : ce composant lit le référentiel canonique uniquement.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Check, X, HelpCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CatalogData, FAMILY_CARDS, MaterialItem, MaterialSelection, loadCatalog, searchMaterials,
} from "@/lib/materials/catalog";

interface Props {
  mode?: "simple" | "detaille";
  value: MaterialSelection[];
  onChange: (next: MaterialSelection[]) => void;
}

const CARD = "rounded-xl border-2 p-3 text-left transition-all min-h-[44px]";

export default function MaterialSelector({ mode = "simple", value, onChange }: Props) {
  const [data, setData] = useState<CatalogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadCatalog().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Chargement impossible"));
  }, []);

  const selected = useMemo(() => new Map(value.map((v) => [v.materialId, v])), [value]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement du catalogue…</div>;

  const setStance = (m: MaterialItem, stance: MaterialSelection["stance"]) => {
    const rest = value.filter((v) => v.materialId !== m.id);
    onChange(stance === "unknown" ? rest : [...rest, { materialId: m.id, stance, granulometryId: null }]);
  };
  const toggleAccept = (m: MaterialItem) =>
    setStance(m, selected.get(m.id)?.stance === "accepted" ? "unknown" : "accepted");
  const setGran = (materialId: string, granulometryId: string | null) =>
    onChange(value.map((v) => (v.materialId === materialId ? { ...v, granulometryId } : v)));

  const visible = (m: MaterialItem) => (mode === "simple" ? m.visible_simple : m.visible_detailed);
  const results = query ? searchMaterials(data, query) : [];

  /* ---------------- Mode simple ---------------- */
  if (mode === "simple") {
    const activeFamilies = FAMILY_CARDS.filter((c) => cards.includes(c.key)).flatMap((c) => c.families);
    const details = data.materials.filter((m) => visible(m) && activeFamilies.includes(m.family));
    const notChosen = FAMILY_CARDS.filter((c) => !cards.includes(c.key));

    return (
      <div className="space-y-5">
        <div>
          <p className="font-display font-bold text-foreground mb-2">Que pouvez-vous recevoir ?</p>
          <p className="text-sm text-muted-foreground mb-3">Plusieurs choix possibles. Rien n'est coché d'avance.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FAMILY_CARDS.map((c) => {
              const on = cards.includes(c.key);
              return (
                <button key={c.key} type="button"
                  onClick={() => setCards(on ? cards.filter((k) => k !== c.key) : [...cards, c.key])}
                  className={`${CARD} ${on ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}>
                  <span className="text-lg mr-1" aria-hidden>{c.emoji}</span>
                  <span className="font-display font-semibold text-sm text-foreground">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {details.length > 0 && (
          <div>
            <p className="font-display font-semibold text-foreground mb-2">Voulez-vous préciser ? <span className="font-body text-xs text-muted-foreground">(facultatif)</span></p>
            <div className="flex flex-wrap gap-2">
              {details.map((m) => {
                const on = selected.get(m.id)?.stance === "accepted";
                return (
                  <button key={m.id} type="button" onClick={() => toggleAccept(m)}
                    className={`${CARD} px-3 py-2 text-sm ${on ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                    {m.short_name ?? m.name_fr}
                  </button>
                );
              })}
            </div>
            {value.filter((v) => v.stance === "accepted").map((v) => {
              const m = data.materials.find((x) => x.id === v.materialId);
              if (!m?.requires_granulometry) return null;
              return (
                <div key={v.materialId} className="mt-3">
                  <p className="text-sm text-muted-foreground mb-1">Calibre pour « {m.short_name ?? m.name_fr} » (facultatif)</p>
                  <div className="flex flex-wrap gap-2">
                    {data.granulometries.map((g) => (
                      <button key={g.id} type="button"
                        onClick={() => setGran(m.id, v.granulometryId === g.id ? null : g.id)}
                        className={`rounded-lg border px-3 py-2 text-sm min-h-[44px] ${v.granulometryId === g.id ? "border-primary bg-primary/5" : "border-border"}`}>
                        {g.label_fr}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {cards.length > 0 && notChosen.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-sm text-foreground mb-2">Pouvez-vous aussi accepter&nbsp;?</p>
            <div className="flex flex-wrap gap-2">
              {notChosen.map((c) => (
                <button key={c.key} type="button" onClick={() => setCards([...cards, c.key])}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px]">
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- Mode détaillé ---------------- */
  const byFamily = FAMILY_CARDS.map((c) => ({
    card: c,
    items: data.materials.filter((m) => c.families.includes(m.family) && visible(m)),
  })).filter((g) => g.items.length > 0);

  const row = (m: MaterialItem) => {
    const cur = selected.get(m.id)?.stance ?? "unknown";
    const sel = selected.get(m.id);
    return (
      <div key={m.id} className="flex flex-wrap items-center gap-2 border-b border-border/60 py-2">
        <div className="min-w-[180px] flex-1">
          <p className="text-sm font-medium text-foreground">{m.name_fr}</p>
          <p className="text-xs text-muted-foreground">
            {m.subfamily}
            {m.regulatory_level !== "standard" && <Badge variant="outline" className="ml-2 text-[10px]">{m.regulatory_level.replace("_", " ")}</Badge>}
          </p>
        </div>
        {m.requires_granulometry && cur === "accepted" && (
          <select aria-label={`Calibre ${m.name_fr}`}
            className="rounded-md border border-border bg-background px-2 py-2 text-sm min-h-[44px]"
            value={sel?.granulometryId ?? ""}
            onChange={(e) => setGran(m.id, e.target.value || null)}>
            <option value="">Calibre inconnu</option>
            {data.granulometries.map((g) => <option key={g.id} value={g.id}>{g.label_fr}</option>)}
          </select>
        )}
        <div className="flex gap-1">
          {([["accepted", Check, "Accepté"], ["refused", X, "Refusé"], ["unknown", HelpCircle, "Inconnu"]] as const).map(([s, Icon, label]) => (
            <Button key={s} type="button" size="sm" variant={cur === s ? "default" : "outline"}
              className="min-h-[44px]" onClick={() => setStance(m, s)}>
              <Icon className="mr-1 h-3.5 w-3.5" />{label}
            </Button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9 min-h-[44px]" placeholder="Rechercher un matériau (3/4, terre melange, planage…)"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {query && (
        <div className="rounded-xl border border-border p-2">
          <p className="px-1 pb-1 text-xs text-muted-foreground">Suggestions — une suggestion n'est pas une acceptation.</p>
          {results.length === 0 ? <p className="px-1 text-sm text-muted-foreground">Aucune suggestion.</p> : results.map(row)}
        </div>
      )}
      {byFamily.map((g) => (
        <div key={g.card.key}>
          <p className="font-display font-semibold text-foreground">{g.card.emoji} {g.card.label}</p>
          <div className="mt-1">{g.items.map(row)}</div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Absence de sélection = inconnu, jamais refusé. Le statut environnemental se saisit séparément.
      </p>
    </div>
  );
}
