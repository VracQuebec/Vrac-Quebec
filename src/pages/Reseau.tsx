// Annuaire public du réseau Vrac Québec : fournisseurs, transporteurs, carrières,
// sablières, centres de recyclage, sites de dépôt et municipalités partenaires.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, Search, MapPin, Star, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JSC_PARTNER_TYPES } from "@/lib/jsc/config";

type Profile = {
  id: string; slug: string | null; name: string; partner_type: string; tagline: string | null;
  city: string | null; region: string | null; logo_url: string | null;
  rating_average: number; rating_count: number; is_featured: boolean;
  certifications: string[] | null; services: string[] | null;
};

const typeLabel = (v: string) => JSC_PARTNER_TYPES.find((t) => t.value === v)?.label ?? v;

export default function Reseau() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("jsc_marketplace_profiles")
        .select("id,slug,name,partner_type,tagline,city,region,logo_url,rating_average,rating_count,is_featured,certifications,services")
        .order("is_featured", { ascending: false })
        .order("rating_average", { ascending: false })
        .limit(300);
      setRows((data as unknown as Profile[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.partner_type))), [rows]);
  const filtered = rows.filter((r) => {
    if (type !== "all" && r.partner_type !== type) return false;
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return [r.name, r.city, r.region, r.tagline].some((v) => String(v ?? "").toLowerCase().includes(s));
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Helmet>
        <title>Réseau de partenaires du vrac au Québec | Vrac Québec</title>
        <meta name="description" content="Fournisseurs, transporteurs, carrières, sablières et centres de recyclage du vrac au Québec. Comparez les partenaires certifiés du réseau Vrac Québec." />
        <link rel="canonical" href="https://vracquebec.ca/reseau" />
        <meta property="og:title" content="Réseau de partenaires du vrac au Québec | Vrac Québec" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://vracquebec.ca/reseau" />
      </Helmet>

      <h1 className="text-3xl font-bold">Le réseau Vrac Québec</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Tous les acteurs du vrac réunis au même endroit : fournisseurs, transporteurs, carrières,
        sablières, centres de recyclage et sites de dépôt. Comparez et obtenez une estimation en ligne.
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher un partenaire ou une ville…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button asChild variant="secondary"><Link to="/place-de-marche">Place de marché</Link></Button>
        <Button asChild><Link to="/soumission">Obtenir une estimation</Link></Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant={type === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setType("all")}>
          Tous
        </Badge>
        {types.map((t) => (
          <Badge key={t} variant={type === t ? "default" : "outline"} className="cursor-pointer" onClick={() => setType(t)}>
            {typeLabel(t)}
          </Badge>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement du réseau…
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Aucun partenaire publié pour l'instant. Le réseau s'enrichit chaque semaine.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to={`/reseau/${p.slug ?? p.id}`}
              className="rounded-xl border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{p.name}</h2>
                {p.is_featured && <Badge className="shrink-0">Mis en avant</Badge>}
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{typeLabel(p.partner_type)}</p>
              {p.tagline && <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {(p.city || p.region) && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.city ?? p.region}</span>
                )}
                {p.rating_count > 0 && (
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <Star className="h-3.5 w-3.5 text-primary" />{p.rating_average.toFixed(1)} ({p.rating_count})
                  </span>
                )}
                {Array.isArray(p.certifications) && p.certifications.length > 0 && (
                  <span className="inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" />{p.certifications.length} certification(s)</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
