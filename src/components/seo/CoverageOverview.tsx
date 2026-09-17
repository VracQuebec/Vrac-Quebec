import { useEffect, useState } from "react";
import { Loader2, MapPin, Package, Wrench, Grid3x3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function CoverageOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    citiesTotal: 0, citiesCovered: 0,
    materialsTotal: 0, materialsCovered: 0,
    servicesTotal: 0, servicesCovered: 0,
    combosTotal: 0, combosCreated: 0,
  });

  useEffect(() => {
    (async () => {
      const [cRes, mRes, sRes, pRes] = await Promise.all([
        supabase.rpc("seo_generator_catalog" as never),
        supabase.from("seo_materials").select("slug").eq("active", true),
        supabase.from("seo_services").select("slug").eq("active", true),
        supabase.from("seo_pages").select("city_slug, material_slug, service_slug").eq("status", "published"),
      ]);
      const cities = ((cRes.data as unknown as { cities?: Array<{ slug: string }> })?.cities ?? []);
      const materials = mRes.data ?? [];
      const services = sRes.data ?? [];
      const pages = pRes.data ?? [];
      const usedCities = new Set(pages.map((p) => p.city_slug));
      const usedMats = new Set(pages.filter((p) => p.material_slug).map((p) => p.material_slug));
      const usedSvcs = new Set(pages.filter((p) => p.service_slug).map((p) => p.service_slug));
      const combos = new Set(pages.filter((p) => p.material_slug).map((p) => `${p.city_slug}|${p.material_slug}`));
      setStats({
        citiesTotal: cities.length,
        citiesCovered: cities.filter((c) => usedCities.has(c.slug)).length,
        materialsTotal: materials.length,
        materialsCovered: materials.filter((m) => usedMats.has(m.slug)).length,
        servicesTotal: services.length,
        servicesCovered: services.filter((s) => usedSvcs.has(s.slug)).length,
        combosTotal: cities.length * materials.length,
        combosCreated: combos.size,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement de la couverture…</div>;
  }

  const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <CoverageCard icon={MapPin} label="Territoire couvert" pct={pct(stats.citiesCovered, stats.citiesTotal)} sub={`${stats.citiesCovered}/${stats.citiesTotal} villes`} />
      <CoverageCard icon={Package} label="Matériaux couverts" pct={pct(stats.materialsCovered, stats.materialsTotal)} sub={`${stats.materialsCovered}/${stats.materialsTotal} matériaux`} />
      <CoverageCard icon={Wrench} label="Services couverts" pct={pct(stats.servicesCovered, stats.servicesTotal)} sub={`${stats.servicesCovered}/${stats.servicesTotal} services`} />
      <CoverageCard icon={Grid3x3} label="Combinaisons créées" pct={pct(stats.combosCreated, stats.combosTotal)} sub={`${stats.combosCreated} / ${stats.combosTotal}`} />
    </section>
  );
}

function CoverageCard({ icon: Icon, label, pct, sub }: { icon: typeof MapPin; label: string; pct: number; sub: string }) {
  const barColor = pct >= 80 ? "bg-primary" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  const textColor = pct >= 80 ? "text-primary" : pct >= 50 ? "text-amber-500" : "text-red-500";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase font-display tracking-wider">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-3xl font-display font-extrabold ${textColor} mt-1`}>{pct}<span className="text-base text-muted-foreground">%</span></div>
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-2">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>
    </div>
  );
}