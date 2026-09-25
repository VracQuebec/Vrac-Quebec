// Sélection multiple dans le catalogue complet pour une demande de remblai.
// Chaque matériau : accepté / refusé / à confirmer + variante + conditions.
// Rien n'est coché d'avance ; une sélection ne s'étend jamais à de nouveaux matériaux.
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { groupByFamily, searchCatalog, useSharedCatalog } from "@/lib/vrac/sharedCatalog";

export type RemblaiSelection = {
  material_id: string; name: string; variant_id: string | null; variant_label: string | null;
  stance: "accepted" | "refused" | "to_confirm"; conditions: string;
};
const STANCES: [RemblaiSelection["stance"], string][] = [["accepted", "Accepté"], ["refused", "Refusé"], ["to_confirm", "À confirmer"]];

export default function RemblaiCatalogSelector({ value, onChange }: { value: RemblaiSelection[]; onChange: (v: RemblaiSelection[]) => void }) {
  const { items, loading, error } = useSharedCatalog();
  const [q, setQ] = useState("");
  const [openFam, setOpenFam] = useState<string | null>(null);
  const groups = useMemo(() => groupByFamily(searchCatalog(items, q)), [items, q]);
  const byId = new Map(value.map((v) => [v.material_id, v]));

  const set = (id: string, patch: Partial<RemblaiSelection> | null, name = "") => {
    const rest = value.filter((v) => v.material_id !== id);
    if (patch === null) return onChange(rest);
    const cur = byId.get(id) ?? { material_id: id, name, variant_id: null, variant_label: null, stance: "accepted" as const, conditions: "" };
    onChange([...rest, { ...cur, ...patch }]);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Chargement du catalogue…</p>;
  if (error) return <p className="text-sm text-destructive">Catalogue indisponible.</p>;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-semibold text-foreground">Préciser avec le catalogue complet <span className="font-normal text-muted-foreground">(facultatif)</span></p>
      <p className="text-xs text-muted-foreground">Indiquez pour chaque matériau s'il est accepté, refusé ou à confirmer. Rien n'est coché d'avance.</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (ex. MG-20, argile, béton)" aria-label="Rechercher dans le catalogue" />
      </div>
      {value.length > 0 && <p className="text-xs text-foreground">{value.length} matériau(x) précisé(s)</p>}
      <div className="max-h-[420px] space-y-2 overflow-y-auto">
        {groups.map(([fam, list]) => {
          const open = !!q || openFam === fam;
          return (
            <div key={fam} className="rounded-lg border border-border">
              <button type="button" className="flex w-full items-center justify-between p-2 text-left text-sm font-medium min-h-[44px]" onClick={() => setOpenFam(open && !q ? null : fam)} aria-expanded={open}>
                {fam} <span className="flex items-center gap-1 text-xs text-muted-foreground">{list.filter((i) => byId.has(i.material_id)).length}/{list.length}<ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></span>
              </button>
              {open && list.map((it) => {
                const sel = byId.get(it.material_id);
                const variants = it.variants.filter((v) => v.label);
                return (
                  <div key={it.material_id} className="border-t border-border/60 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-foreground">{it.name}</span>
                      <div className="flex gap-1">
                        {STANCES.map(([s, l]) => (
                          <button key={s} type="button" onClick={() => (sel?.stance === s ? set(it.material_id, null) : set(it.material_id, { stance: s }, it.name))}
                            className={`rounded-md border px-2 py-1 text-xs min-h-[36px] ${sel?.stance === s ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                    {sel && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {variants.length > 0 && (
                          <select className="h-9 rounded-md border border-border bg-background px-2 text-xs" aria-label={`Variante ${it.name}`}
                            value={sel.variant_id ?? sel.variant_label ?? ""}
                            onChange={(e) => { const v = variants.find((x) => (x.variant_id ?? x.label) === e.target.value); set(it.material_id, { variant_id: v?.variant_id ?? null, variant_label: v?.label ?? null }); }}>
                            <option value="">Toutes variantes / inconnue</option>
                            {variants.map((v) => <option key={v.variant_id ?? v.label!} value={v.variant_id ?? v.label!}>{v.label}</option>)}
                          </select>
                        )}
                        <Input className="h-9 flex-1 text-xs" maxLength={200} value={sel.conditions} onChange={(e) => set(it.material_id, { conditions: e.target.value })} placeholder="Conditions (ex. sans roches > 6 po, propre)" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
