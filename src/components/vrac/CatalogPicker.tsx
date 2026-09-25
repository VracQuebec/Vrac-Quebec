import { useMemo, useState } from "react";
import { Search, HelpCircle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  groupByFamily, searchCatalog, useSharedCatalog, type CatalogItem,
} from "@/lib/vrac/sharedCatalog";
import type { VracDraft } from "@/lib/vrac/catalog";

type Selection = NonNullable<VracDraft["catalog"]>;

/**
 * Tous les matériaux actifs du catalogue central, regroupés par famille.
 * Un matériau sans tarif valide est présenté « Sur demande », jamais « en stock ».
 */
export default function CatalogPicker({
  value, customMaterial, onPick, onCustom,
}: {
  value: Selection | null | undefined;
  customMaterial: string;
  onPick: (sel: Selection, jscMaterialId: string | null) => void;
  onCustom: (text: string) => void;
}) {
  const { items, granulometries, loading, error } = useSharedCatalog();
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<CatalogItem | null>(null);
  const [showCustom, setShowCustom] = useState(!!customMaterial);
  const groups = useMemo(() => groupByFamily(searchCatalog(items, q)), [items, q]);

  const choose = (it: CatalogItem, granulometryId: string | null) => {
    const variant = it.variants.find((v) => v.granulometry_id === granulometryId) ?? null;
    const label = granulometryId ? granulometries.find((g) => g.id === granulometryId)?.label ?? variant?.label ?? null : null;
    const priced = variant ? variant.price_available : false;
    onPick({
      materialId: it.material_id, name: it.name, granulometryId, variantLabel: label,
      priceStatus: priced ? "prix_disponible" : "sur_demande",
    }, variant?.jsc_material_id ?? null);
    setPending(null);
  };

  const onItem = (it: CatalogItem) => {
    const needsVariant = it.requires_granulometry || it.variants.some((v) => v.granulometry_id);
    if (needsVariant) setPending(it); else choose(it, null);
  };

  return (
    <div className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Tous nos matériaux</h3>
        <p className="text-xs text-muted-foreground">Recherchez par nom, synonyme ou usage (ex. « 0-3/4 », « glaise », « tuf »).</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un matériau" className="pl-9" aria-label="Rechercher un matériau" />
      </div>
      {loading && <p className="text-sm text-muted-foreground">Chargement du catalogue…</p>}
      {error && <p className="text-sm text-destructive">Catalogue indisponible pour le moment.</p>}

      {pending && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="mb-2 text-sm font-medium text-foreground">Quelle variante de « {pending.name} » ?</p>
          <div className="flex flex-wrap gap-2">
            {(pending.variants.some((v) => v.granulometry_id)
              ? granulometries.filter((g) => pending.variants.some((v) => v.granulometry_id === g.id)).concat(
                  pending.requires_granulometry ? granulometries.filter((g) => !pending.variants.some((v) => v.granulometry_id === g.id)) : [])
              : granulometries
            ).map((g) => {
              const v = pending.variants.find((x) => x.granulometry_id === g.id);
              return (
                <Button key={g.id} type="button" size="sm" variant="outline" onClick={() => choose(pending, g.id)}>
                  {g.label}{v?.price_available ? " · Prix disponible" : ""}
                </Button>
              );
            })}
            <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
        {groups.map(([family, list]) => (
          <div key={family}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{family}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {list.map((it) => {
                const active = value?.materialId === it.material_id;
                return (
                  <button key={it.material_id} type="button" onClick={() => onItem(it)} aria-pressed={active}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-left text-sm transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{it.name}</span>
                      {active && value?.variantLabel && <span className="text-xs text-muted-foreground">{value.variantLabel}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Badge variant={it.price_status === "prix_disponible" ? "default" : "secondary"}>
                        {it.price_status === "prix_disponible" ? "Prix disponible" : "Sur demande"}
                      </Badge>
                      {active && <Check className="h-4 w-4 text-primary" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!loading && groups.length === 0 && <p className="text-sm text-muted-foreground">Aucun matériau ne correspond à « {q} ».</p>}
      </div>

      <div className="border-t border-border pt-3">
        {!showCustom ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowCustom(true)}>
            <HelpCircle className="mr-1 h-4 w-4" /> Je ne trouve pas mon matériau
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Décrivez le matériau recherché</p>
            <Textarea value={customMaterial} maxLength={500} onChange={(e) => onCustom(e.target.value)}
              placeholder="Ex. : pierre décorative grise 1 1/2 po pour aménagement" />
            <p className="text-xs text-muted-foreground">Notre équipe qualifiera votre demande et vous transmettra une soumission.</p>
          </div>
        )}
      </div>
    </div>
  );
}
