// ============================================================
// TARIFS MATÉRIAUX — catalogue central (material_catalog) ↔ tarifs
// (jsc_material_prices), seule source de prix du moteur de soumission.
// Un prix absent reste vide ; 0 $ exige une confirmation explicite.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { normalizeSearch } from "@/lib/vrac/sharedCatalog";

type Cat = { id: string; name_fr: string; family: string; is_active: boolean; vrac_selectable: boolean; vrac_exclusion_reason: string | null; requires_granulometry: boolean };
type Gran = { id: string; label_fr: string };
type JscMat = { id: string; name: string; material_catalog_id: string | null; granulometry_id: string | null; allowed_units: string[]; density_kg_per_m3: number | null };
type Price = {
  id: string; material_id: string; unit: string; selling_price: number | null; purchase_price: number | null;
  minimum_quantity: number | null; max_quantity: number | null; pickup_location_id: string | null;
  transport_included: boolean; zone_label: string | null; valid_from: string | null; valid_to: string | null;
  auto_quote_enabled: boolean; zero_price_confirmed: boolean; is_preferred: boolean; priority: number; is_active: boolean;
};
type Pickup = { id: string; name: string };

const UNIT_LABEL: Record<string, string> = { tonne: "tonne métrique", m3: "m³", verge: "verge³", voyage: "voyage", forfait: "forfait" };
const FILTERS = [
  { id: "all", label: "Tous" },
  { id: "noprice", label: "Sans prix" },
  { id: "expired", label: "Tarif expiré" },
  { id: "incomplete", label: "À compléter" },
  { id: "auto", label: "Soumission automatique active" },
  { id: "excluded", label: "Exclus / inactifs" },
] as const;

const today = () => new Date().toISOString().slice(0, 10);
const hasPrice = (p: Price) => p.selling_price != null && (Number(p.selling_price) > 0 || p.zero_price_confirmed);
const isExpired = (p: Price) => !!p.valid_to && p.valid_to < today();
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export default function MaterialPricing() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [grans, setGrans] = useState<Gran[]>([]);
  const [mats, setMats] = useState<JscMat[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [dirty, setDirty] = useState<Record<string, Partial<Price>>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [variantFor, setVariantFor] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [c, g, m, p, pk] = await Promise.all([
      supabase.from("material_catalog").select("id,name_fr,family,is_active,vrac_selectable,vrac_exclusion_reason,requires_granulometry").order("family").order("name_fr"),
      supabase.from("material_granulometries").select("id,label_fr").order("label_fr"),
      supabase.from("jsc_materials").select("id,name,material_catalog_id,granulometry_id,allowed_units,density_kg_per_m3").is("archived_at", null),
      supabase.from("jsc_material_prices").select("*").is("archived_at", null),
      supabase.from("jsc_pickup_locations").select("id,name").is("archived_at", null).order("name"),
    ]);
    const err = c.error || g.error || m.error || p.error;
    if (err) toast.error(err.message);
    setCats((c.data ?? []) as Cat[]);
    setGrans((g.data ?? []) as Gran[]);
    setMats((m.data ?? []) as JscMat[]);
    setPrices((p.data ?? []) as unknown as Price[]);
    setPickups((pk.data ?? []) as Pickup[]);
    setDirty({});
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const merged = (p: Price): Price => ({ ...p, ...(dirty[p.id] ?? {}) });
  const edit = (id: string, patch: Partial<Price>) => setDirty((d) => ({ ...d, [id]: { ...(d[id] ?? {}), ...patch } }));

  const rows = useMemo(() => {
    const nq = normalizeSearch(q);
    return cats.map((c) => {
      const variants = mats.filter((m) => m.material_catalog_id === c.id);
      const pr = prices.filter((p) => variants.some((v) => v.id === p.material_id)).map(merged);
      return { c, variants, pr };
    }).filter(({ c, variants, pr }) => {
      if (nq && !normalizeSearch(`${c.name_fr} ${c.family} ${variants.map((v) => v.name).join(" ")}`).includes(nq)) return false;
      const excluded = !c.is_active || !c.vrac_selectable;
      switch (filter) {
        case "noprice": return !excluded && !pr.some(hasPrice);
        case "expired": return pr.some(isExpired);
        case "incomplete": return !excluded && (pr.length === 0 || pr.some((p) => !hasPrice(p) || !p.unit));
        case "auto": return pr.some((p) => p.auto_quote_enabled && hasPrice(p) && !isExpired(p));
        case "excluded": return excluded;
        default: return true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats, mats, prices, dirty, q, filter]);

  const counts = useMemo(() => {
    const active = cats.filter((c) => c.is_active && c.vrac_selectable);
    const priced = active.filter((c) => prices.some((p) => hasPrice(p) && !isExpired(p) && mats.some((m) => m.id === p.material_id && m.material_catalog_id === c.id)));
    return { total: cats.length, selectable: active.length, priced: priced.length, noprice: active.length - priced.length, excluded: cats.length - active.length };
  }, [cats, prices, mats]);

  /** Crée (au besoin) la variante vendable rattachée au catalogue, puis un tarif vide. */
  const addPrice = async (c: Cat) => {
    const granId = variantFor[c.id] || null;
    if (c.requires_granulometry && !granId) { toast.error("Choisissez d'abord la granulométrie."); return; }
    let mat = mats.find((m) => m.material_catalog_id === c.id && (m.granulometry_id ?? null) === granId);
    if (!mat) {
      const gl = grans.find((g) => g.id === granId)?.label_fr;
      const { data, error } = await supabase.from("jsc_materials").insert({
        name: gl ? `${c.name_fr} ${gl}` : c.name_fr,
        material_catalog_id: c.id, granulometry_id: granId,
        // Aucune densité validée : seule la tonne est proposée.
        allowed_units: ["tonne"], is_public: false,
      } as never).select("id,name,material_catalog_id,granulometry_id,allowed_units,density_kg_per_m3").single();
      if (error) { toast.error(error.message); return; }
      mat = data as JscMat;
    }
    const { error } = await supabase.from("jsc_material_prices").insert({
      material_id: mat.id, unit: "tonne", selling_price: null, purchase_price: null, auto_quote_enabled: false,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Ligne de tarif ajoutée : saisissez le prix.");
    void load();
  };

  const saveAll = async () => {
    const ids = Object.keys(dirty);
    if (!ids.length) return;
    for (const id of ids) {
      const p = merged(prices.find((x) => x.id === id)!);
      if (p.selling_price === 0 && !p.zero_price_confirmed) {
        if (!window.confirm("Un prix de 0 $ a été saisi. Confirmer que ce matériau est réellement gratuit ?")) return;
        dirty[id].zero_price_confirmed = true;
      }
      if (p.selling_price !== 0 && p.zero_price_confirmed) dirty[id].zero_price_confirmed = false;
    }
    setSaving(true);
    let failed = 0;
    for (const id of ids) {
      const { error } = await supabase.from("jsc_material_prices").update(dirty[id] as never).eq("id", id);
      if (error) { failed++; toast.error(error.message); }
    }
    setSaving(false);
    if (!failed) toast.success(`${ids.length} tarif(s) enregistré(s).`);
    void load();
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Tarifs des matériaux</h2>
        <p className="text-sm text-muted-foreground">
          Catalogue central partagé Remblai / Vrac. Un prix vide = « Sur demande ». Seuls les tarifs actifs, valides,
          à la tonne et avec calcul automatique activé alimentent les soumissions automatiques.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        {[["Catalogue", counts.total], ["Sélectionnables Vrac", counts.selectable], ["Tarifés", counts.priced], ["Sans prix", counts.noprice], ["Exclus / inactifs", counts.excluded]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold">{v}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher un matériau" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {FILTERS.map((f) => (
          <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>{f.label}</Button>
        ))}
        <Button size="sm" onClick={saveAll} disabled={saving || !Object.keys(dirty).length}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Enregistrer ({Object.keys(dirty).length})
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map(({ c, variants, pr }) => (
          <div key={c.id} className="rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{c.name_fr} <span className="text-xs text-muted-foreground">· {c.family}</span></p>
                {(!c.is_active || !c.vrac_selectable) && (
                  <p className="text-xs text-destructive">Exclu du parcours Vrac : {c.vrac_exclusion_reason ?? (c.is_active ? "non sélectionnable" : "matériau inactif")}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={pr.some((p) => hasPrice(p) && !isExpired(p)) ? "default" : "secondary"}>
                  {pr.some((p) => hasPrice(p) && !isExpired(p)) ? "Prix disponible" : "Sur demande"}
                </Badge>
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={variantFor[c.id] ?? ""}
                  onChange={(e) => setVariantFor((v) => ({ ...v, [c.id]: e.target.value }))} aria-label="Variante">
                  <option value="">{c.requires_granulometry ? "Granulométrie…" : "Sans variante"}</option>
                  {grans.map((g) => <option key={g.id} value={g.id}>{g.label_fr}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => addPrice(c)}><Plus className="mr-1 h-4 w-4" /> Tarif</Button>
              </div>
            </div>
            {pr.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="p-1">Produit / variante</th><th className="p-1">Prix vente $</th><th className="p-1">Unité</th>
                      <th className="p-1">Coût fourn. $</th><th className="p-1">Marge</th><th className="p-1">Min</th><th className="p-1">Max</th>
                      <th className="p-1">Point de chargement</th><th className="p-1">Transport inclus</th><th className="p-1">Zone</th>
                      <th className="p-1">Du</th><th className="p-1">Au</th><th className="p-1">Préféré</th><th className="p-1">Priorité</th><th className="p-1">Auto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.map((p) => {
                      const v = variants.find((x) => x.id === p.material_id);
                      const margin = p.selling_price != null && p.purchase_price != null && p.selling_price > 0
                        ? `${Math.round(((p.selling_price - p.purchase_price) / p.selling_price) * 100)} %` : "—";
                      const units = (v?.allowed_units?.length ? v.allowed_units : ["tonne"]);
                      return (
                        <tr key={p.id} className={`border-t ${dirty[p.id] ? "bg-primary/5" : ""}`}>
                          <td className="p-1">{v?.name}{isExpired(p) && <Badge variant="destructive" className="ml-1">Expiré</Badge>}</td>
                          <td className="p-1"><Input className="h-8 w-24" inputMode="decimal" placeholder="vide" value={p.selling_price ?? ""} onChange={(e) => edit(p.id, { selling_price: num(e.target.value) })} /></td>
                          <td className="p-1">
                            <select className="h-8 rounded-md border bg-background px-1" value={p.unit} onChange={(e) => edit(p.id, { unit: e.target.value })}>
                              {units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u] ?? u}</option>)}
                            </select>
                          </td>
                          <td className="p-1"><Input className="h-8 w-20" inputMode="decimal" value={p.purchase_price ?? ""} onChange={(e) => edit(p.id, { purchase_price: num(e.target.value) })} /></td>
                          <td className="p-1">{margin}</td>
                          <td className="p-1"><Input className="h-8 w-16" value={p.minimum_quantity ?? ""} onChange={(e) => edit(p.id, { minimum_quantity: num(e.target.value) })} /></td>
                          <td className="p-1"><Input className="h-8 w-16" value={p.max_quantity ?? ""} onChange={(e) => edit(p.id, { max_quantity: num(e.target.value) })} /></td>
                          <td className="p-1">
                            <select className="h-8 max-w-[150px] rounded-md border bg-background px-1" value={p.pickup_location_id ?? ""} onChange={(e) => edit(p.id, { pickup_location_id: e.target.value || null })}>
                              <option value="">—</option>
                              {pickups.map((pk) => <option key={pk.id} value={pk.id}>{pk.name}</option>)}
                            </select>
                          </td>
                          <td className="p-1"><Switch checked={p.transport_included} onCheckedChange={(b) => edit(p.id, { transport_included: b })} /></td>
                          <td className="p-1"><Input className="h-8 w-24" value={p.zone_label ?? ""} onChange={(e) => edit(p.id, { zone_label: e.target.value || null })} /></td>
                          <td className="p-1"><Input type="date" className="h-8 w-32" value={p.valid_from ?? ""} onChange={(e) => edit(p.id, { valid_from: e.target.value || null })} /></td>
                          <td className="p-1"><Input type="date" className="h-8 w-32" value={p.valid_to ?? ""} onChange={(e) => edit(p.id, { valid_to: e.target.value || null })} /></td>
                          <td className="p-1"><Switch checked={p.is_preferred} onCheckedChange={(b) => edit(p.id, { is_preferred: b })} /></td>
                          <td className="p-1"><Input className="h-8 w-14" value={p.priority} onChange={(e) => edit(p.id, { priority: Number(e.target.value) || 0 })} /></td>
                          <td className="p-1"><Switch checked={p.auto_quote_enabled} onCheckedChange={(b) => edit(p.id, { auto_quote_enabled: b })} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun matériau pour ce filtre.</p>}
      </div>
    </div>
  );
}
