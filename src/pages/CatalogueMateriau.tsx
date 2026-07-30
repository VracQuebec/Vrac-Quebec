// Fiche publique d'un matériau : générée automatiquement, jamais créée à la main.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2 } from "lucide-react";

type Reco = { slug: string; name: string; relation_type: string; cover_image_url: string | null; public_description: string | null };
type Material = {
  slug: string; name: string; category: string | null; subcategory: string | null;
  public_description: string | null; seo_text: string | null; cover_image_url: string | null;
  images: string[] | null; uses: string[] | null; availability: string | null;
  seo_title: string | null; seo_description: string | null; recommendations: Reco[];
};

const RELATION_LABEL: Record<string, string> = {
  similaire: "Produits similaires",
  complementaire: "Produits complémentaires",
  recommande: "Matériaux recommandés",
};

export default function CatalogueMateriau() {
  const { slug = "" } = useParams();
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase.rpc("jsc_public_material", { _slug: slug });
      setMaterial((data as unknown as Material) ?? null);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }
  if (!material) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Matériau introuvable</h1>
        <Link to="/materiaux" className="mt-4 inline-block text-primary hover:underline">Retour au catalogue</Link>
      </main>
    );
  }

  const url = `https://vracquebec.ca/materiaux/${material.slug}`;
  const title = material.seo_title || `${material.name} en vrac — livraison au Québec | Vrac Québec`;
  const description = material.seo_description || material.public_description || `${material.name} livré en vrac partout au Québec.`;
  const groups = (material.recommendations ?? []).reduce<Record<string, Reco[]>>((acc, r) => {
    (acc[r.relation_type] ||= []).push(r);
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="product" />
        {material.cover_image_url && <meta property="og:image" content={material.cover_image_url} />}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: material.name,
            description,
            category: material.category,
            image: material.cover_image_url ? [material.cover_image_url] : undefined,
            brand: { "@type": "Organization", name: "Vrac Québec" },
            url,
          })}
        </script>
      </Helmet>

      <Link to="/materiaux" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Catalogue
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          {material.cover_image_url && (
            <img src={material.cover_image_url} alt={`${material.name} en vrac`} className="w-full rounded-xl object-cover" />
          )}
          {(material.images ?? []).length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {material.images!.map((src) => (
                <img key={src} src={src} alt={`${material.name} — photo`} loading="lazy" className="h-24 w-full rounded-lg object-cover" />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {[material.category, material.subcategory].filter(Boolean).join(" · ")}
            </p>
            <h1 className="text-3xl font-bold">{material.name}</h1>
            {material.availability && <Badge className="mt-2" variant="secondary">{material.availability.replace("_", " ")}</Badge>}
          </div>
          {material.public_description && <p className="text-muted-foreground">{material.public_description}</p>}
          {(material.uses ?? []).length > 0 && (
            <div>
              <h2 className="text-sm font-semibold">Utilisations</h2>
              <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                {material.uses!.map((u) => <li key={u}>{u}</li>)}
              </ul>
            </div>
          )}
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to={`/soumission?materiau=${material.slug}`}>Obtenir une estimation</Link>
          </Button>
        </div>
      </div>

      {material.seo_text && (
        <section className="prose prose-sm mt-10 max-w-none text-muted-foreground">
          <p>{material.seo_text}</p>
        </section>
      )}

      {Object.entries(groups).map(([type, list]) => (
        <section key={type} className="mt-10">
          <h2 className="text-xl font-semibold">{RELATION_LABEL[type] ?? "Recommandations"}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {list.map((r) => (
              <Link key={r.slug} to={`/materiaux/${r.slug}`} className="rounded-xl border bg-card p-4 hover:shadow-md">
                <p className="font-medium">{r.name}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{r.public_description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
