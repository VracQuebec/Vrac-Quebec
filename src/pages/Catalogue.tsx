// Catalogue public généré automatiquement à partir des matériaux actifs.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";

type Item = {
  slug: string; name: string; category: string | null; subcategory: string | null;
  unit: string | null; public_description: string | null; cover_image_url: string | null;
  availability: string | null;
};

export default function Catalogue() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("jsc_public_catalog");
      setItems((data as unknown as Item[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[],
    [items],
  );
  const filtered = items.filter((i) => {
    if (category !== "all" && i.category !== category) return false;
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return [i.name, i.category, i.subcategory, i.public_description]
      .some((v) => String(v ?? "").toLowerCase().includes(s));
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Helmet>
        <title>Catalogue de matériaux en vrac | Vrac Québec</title>
        <meta name="description" content="Pierre concassée, sable, terre, remblai et enrochement livrés partout au Québec. Obtenez une estimation en ligne." />
        <link rel="canonical" href="https://vracquebec.ca/materiaux" />
        <meta property="og:title" content="Catalogue de matériaux en vrac | Vrac Québec" />
        <meta property="og:url" content="https://vracquebec.ca/materiaux" />
        <meta property="og:type" content="website" />
        <meta property="og:description" content="Pierre concassée, sable, terre, remblai et enrochement livrés partout au Québec." />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Accueil", item: "https://vracquebec.ca/" },
            { "@type": "ListItem", position: 2, name: "Matériaux en vrac", item: "https://vracquebec.ca/materiaux" },
          ],
        })}</script>
      </Helmet>

      <h1 className="text-3xl font-bold">Catalogue de matériaux en vrac</h1>
      <p className="mt-2 text-muted-foreground">
        Choisissez votre matériau et obtenez une estimation en quelques secondes.
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher un matériau…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", ...categories].map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1.5 text-sm ${category === c ? "border-primary bg-primary/10" : "text-muted-foreground"}`}>
              {c === "all" ? "Tous" : c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement du catalogue…
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">Aucun matériau ne correspond à votre recherche.</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <Link key={m.slug} to={`/materiaux/${m.slug}`} className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg">
              {m.cover_image_url && (
                <img src={m.cover_image_url} alt={`Matériau en vrac : ${m.name}`} loading="lazy" className="h-40 w-full object-cover" />
              )}
              <div className="space-y-1 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold group-hover:text-primary">{m.name}</h2>
                  {m.availability && m.availability !== "disponible" && (
                    <Badge variant="secondary">{m.availability.replace("_", " ")}</Badge>
                  )}
                </div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {[m.category, m.subcategory].filter(Boolean).join(" · ")}
                </p>
                <p className="line-clamp-3 text-sm text-muted-foreground">{m.public_description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
