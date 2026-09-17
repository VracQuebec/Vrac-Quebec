import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Check, Plus, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type City = { slug: string; name: string; population: number | null };
type Material = { slug: string; name: string; short_name: string | null };
type PageRow = { slug: string; city_slug: string; material_slug: string | null; status: string };

export default function CoverageMatrix() {
  const [cities, setCities] = useState<City[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, m, p] = await Promise.all([
        supabase.rpc("seo_generator_catalog" as never),
        supabase.from("seo_materials").select("slug,name,short_name").eq("active", true).order("sort_order"),
        supabase.from("seo_pages").select("slug,city_slug,material_slug,status").not("material_slug", "is", null),
      ]);
      const catalog = c.data as unknown as { cities?: City[] };
      setCities((catalog?.cities ?? []).sort((a, b) => (b.population ?? 0) - (a.population ?? 0)));
      setMaterials((m.data ?? []) as Material[]);
      setPages((p.data ?? []) as PageRow[]);
      setLoading(false);
    })();
  }, []);

  const cellMap = useMemo(() => {
    const map = new Map<string, PageRow>();
    for (const pg of pages) {
      if (pg.material_slug) map.set(`${pg.city_slug}|${pg.material_slug}`, pg);
    }
    return map;
  }, [pages]);

  const filteredCities = useMemo(() => {
    const q = filterCity.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q));
  }, [cities, filterCity]);

  const totalCells = cities.length * materials.length;
  const covered = useMemo(() => {
    let n = 0;
    for (const c of cities) for (const m of materials) if (cellMap.has(`${c.slug}|${m.slug}`)) n++;
    return n;
  }, [cities, materials, cellMap]);
  const pct = totalCells > 0 ? Math.round((covered / totalCells) * 100) : 0;

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-display font-bold text-foreground">Couverture Ville × Matériau</h2>
        <p className="text-sm text-muted-foreground font-body mt-1">
          {covered.toLocaleString("fr-CA")} / {totalCells.toLocaleString("fr-CA")} combinaisons couvertes ({pct}%). Cliquez sur « + » pour créer la page manquante via le générateur.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Filtrer par ville…"
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 rounded-md border border-border bg-background text-sm font-body"
        />
        <div className="text-xs text-muted-foreground font-body">
          <span className="inline-flex items-center gap-1 mr-3"><span className="inline-block w-3 h-3 rounded-sm bg-primary/80" /> couverte</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-muted border border-border" /> manquante</span>
        </div>
      </div>
      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <table className="text-xs font-body min-w-full">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-2 sticky left-0 bg-muted/40 z-10 font-display font-semibold text-foreground">Ville</th>
              <th className="text-right px-2 py-2 font-display font-semibold text-muted-foreground">Pop.</th>
              {materials.map((m) => (
                <th key={m.slug} className="text-center px-1 py-2 font-display font-semibold text-foreground whitespace-nowrap">
                  {m.short_name || m.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCities.map((c) => (
              <tr key={c.slug} className="border-t border-border">
                <td className="px-2 py-1.5 sticky left-0 bg-card font-display font-semibold text-foreground whitespace-nowrap">{c.name}</td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">{c.population?.toLocaleString("fr-CA") ?? "—"}</td>
                {materials.map((m) => {
                  const pg = cellMap.get(`${c.slug}|${m.slug}`);
                  if (pg) {
                    return (
                      <td key={m.slug} className="px-1 py-1 text-center">
                        <Link to={`/${pg.slug}`} target="_blank" className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary/15 text-primary hover:bg-primary/25" title={`Voir ${pg.slug}`}>
                          <Check className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    );
                  }
                  return (
                    <td key={m.slug} className="px-1 py-1 text-center">
                      <Link
                        to={`/admin/seo-manager?tab=generator&city=${c.slug}&material=${m.slug}`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
                        title={`Créer ${m.name} × ${c.name}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground font-body flex items-center gap-1">
        <ExternalLink className="w-3 h-3" /> Utilisez l'onglet « Générateur » pour créer plusieurs combinaisons en lot.
      </p>
    </div>
  );
}