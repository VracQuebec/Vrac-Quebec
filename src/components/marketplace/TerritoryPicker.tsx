// Sélection des territoires desservis à partir des territoires officiels (recherche serveur).
import { useEffect, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Row = Record<string, unknown>;
export type OfficialTerritory = { id: string; name: string; type: string | null; municipality: string | null; mrc: string | null; region: string | null };

/** Libellé d'un territoire d'entreprise : officiel si lié, sinon ancienne valeur à normaliser. */
export const territoryLabel = (t: Row) => {
  const text = [t.city, t.region].map((v) => String(v ?? "").trim()).filter(Boolean).join(" — ");
  return { label: text || "Territoire sans nom", official: Boolean(t.territory_id) };
};

export default function TerritoryPicker({
  territories, onAdd, onRemove,
}: {
  territories: Row[];
  onAdd: (t: OfficialTerritory) => Promise<void>;
  onRemove: (rowId: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OfficialTerritory[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const selected = new Map(territories.filter((t) => t.territory_id).map((t) => [String(t.territory_id), String(t.id)]));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      const { data } = await supabase.rpc("mkt_search_territories", { _q: term });
      setResults((data ?? []) as OfficialTerritory[]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const toggle = async (t: OfficialTerritory) => {
    setBusy(t.id);
    try {
      const rowId = selected.get(t.id);
      if (rowId) await onRemove(rowId); else await onAdd(t);
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Sélectionnés ({territories.length})</p>
        {territories.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun territoire sélectionné.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {territories.map((t) => {
              const { label, official } = territoryLabel(t);
              return (
                <li key={String(t.id)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-secondary pl-3 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="break-words">{label}</span>
                  {!official && <span className="text-[10px] font-semibold uppercase text-muted-foreground">· Territoire à normaliser</span>}
                  <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" aria-label={`Retirer ${label}`}
                    disabled={busy === String(t.id)} onClick={async () => { setBusy(String(t.id)); try { await onRemove(String(t.id)); } finally { setBusy(null); } }}>
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9 text-base" placeholder="Rechercher un territoire (2 lettres min.)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un territoire" />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {q.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun territoire officiel trouvé.</p>
      )}
      {results.length > 0 && (
        <ul className="divide-y divide-border">
          {results.map((t) => {
            const checked = selected.has(t.id);
            return (
              <li key={t.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
                  <Checkbox checked={checked} disabled={busy === t.id} onCheckedChange={() => void toggle(t)} aria-label={t.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">{[t.mrc, t.region].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
