// Annuaire public des entreprises partenaires (SEO) : recherche par service, ville, région.
// Les coordonnées ne sont jamais affichées : le parcours ramène vers la demande de soumissions.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, MapPin, Search, ShieldCheck, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchDirectory, type DirectoryEntry } from "@/lib/marketplace/api";

const SITE = "https://vracquebec.ca";

// « excavation-a-quebec » -> { service: "excavation", ville: "quebec" }
const parseSlug = (slug?: string) => {
  if (!slug) return { service: "", city: "" };
  const parts = slug.split("-a-");
  const clean = (v: string) => v.replace(/-/g, " ").trim();
  if (parts.length >= 2) return { service: clean(parts[0]), city: clean(parts.slice(1).join("-a-")) };
  return { service: clean(slug), city: "" };
};

const SUGGESTIONS = [
  { label: "Excavation à Québec", slug: "excavation-a-quebec" },
  { label: "Transport en vrac à Lévis", slug: "transport-en-vrac-a-levis" },
  { label: "Pavage à Beauport", slug: "pavage-a-beauport" },
  { label: "Déneigement à Sainte-Foy", slug: "deneigement-a-sainte-foy" },
  { label: "Aménagement paysager à Charlesbourg", slug: "amenagement-paysager-a-charlesbourg" },
  { label: "Location de machinerie à Québec", slug: "location-de-machinerie-a-quebec" },
];

const titleCase = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

export default function TrouverEntrepreneur() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const fromSlug = useMemo(() => parseSlug(slug), [slug]);

  const [service, setService] = useState(fromSlug.service || params.get("service") || "");
  const [city, setCity] = useState(fromSlug.city || params.get("ville") || "");
  const [region, setRegion] = useState(params.get("region") || "");
  const [rows, setRows] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: string, v: string, r: string) => {
    setLoading(true);
    try {
      const data = await fetchDirectory({ service: s || null, city: v || null, region: r || null, limit: 60 });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = fromSlug.service || params.get("service") || "";
    const v = fromSlug.city || params.get("ville") || "";
    const r = params.get("region") || "";
    setService(s); setCity(v); setRegion(r);
    void load(s, v, r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, params.toString()]);

  const rechercher = () => {
    const next = new URLSearchParams();
    if (service.trim()) next.set("service", service.trim());
    if (city.trim()) next.set("ville", city.trim());
    if (region.trim()) next.set("region", region.trim());
    setParams(next, { replace: false });
  };

  const titreCourt = [service && titleCase(service), city && `à ${titleCase(city)}`].filter(Boolean).join(" ")
    || "Trouver un entrepreneur au Québec";
  const pageTitle = `${titreCourt} | Vrac Québec`.slice(0, 60);
  const description = service || city
    ? `Comparez les entreprises partenaires ${service ? `en ${service}` : ""}${city ? ` à ${titleCase(city)}` : " au Québec"} et obtenez plusieurs soumissions gratuitement avec Vrac Québec.`
    : "Trouvez un entrepreneur en excavation, transport en vrac, pavage, déneigement ou matériaux au Québec et obtenez plusieurs soumissions gratuitement.";
  const canonical = slug ? `${SITE}/trouver-un-entrepreneur/${slug}` : `${SITE}/trouver-un-entrepreneur`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: titreCourt,
    itemListElement: rows.slice(0, 20).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "LocalBusiness",
        name: r.trade_name || r.legal_name || "Entreprise partenaire",
        address: { "@type": "PostalAddress", addressLocality: r.city ?? undefined, addressRegion: r.region ?? undefined, addressCountry: "CA" },
      },
    })),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={description.slice(0, 158)} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={description.slice(0, 158)} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{titreCourt}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Les entreprises du réseau Vrac Québec qui acceptent d'être affichées publiquement.
            Vous n'avez pas à les contacter une par une : décrivez votre besoin et recevez plusieurs soumissions.
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/obtenir-des-soumissions">Demander des soumissions</Link>
        </Button>
      </header>

      <section className="mt-6 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <Label htmlFor="service">Service</Label>
          <Input id="service" value={service} onChange={(e) => setService(e.target.value)} placeholder="Excavation" />
        </div>
        <div className="sm:col-span-1">
          <Label htmlFor="ville">Ville</Label>
          <Input id="ville" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Québec" />
        </div>
        <div className="sm:col-span-1">
          <Label htmlFor="region">Région</Label>
          <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Capitale-Nationale" />
        </div>
        <div className="flex items-end">
          <Button className="w-full" onClick={rechercher}>
            <Search className="mr-1.5 h-4 w-4" /> Rechercher
          </Button>
        </div>
      </section>

      <nav aria-label="Recherches populaires" className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Button key={s.slug} asChild variant="outline" size="sm">
            <Link to={`/trouver-un-entrepreneur/${s.slug}`}>{s.label}</Link>
          </Button>
        ))}
      </nav>

      <section className="mt-8">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des entreprises…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="font-medium">Aucune entreprise affichée pour cette recherche.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Notre réseau compte aussi des entreprises qui ne sont pas affichées publiquement.
              Déposez votre demande : nous irons les chercher pour vous.
            </p>
            <Button asChild className="mt-4"><Link to="/obtenir-des-soumissions">Demander des soumissions</Link></Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <Card key={r.company_id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-start justify-between gap-2 text-base">
                    <span>{r.trade_name || r.legal_name || "Entreprise partenaire"}</span>
                    {r.is_verified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Entreprise vérifiée" />}
                  </CardTitle>
                  {(r.city || r.region) && (
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> {[r.city, r.region].filter(Boolean).join(", ")}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {r.description && <p className="line-clamp-3 text-sm text-muted-foreground">{r.description}</p>}
                  {r.services?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.services.slice(0, 5).map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
                    </div>
                  )}
                  {r.territories?.length > 0 && (
                    <p className="text-xs text-muted-foreground">Dessert : {r.territories.slice(0, 4).join(" · ")}</p>
                  )}
                  {r.public_score != null && (
                    <p className="flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 text-primary" /> {Math.round(r.public_score)} / 100
                    </p>
                  )}
                  <Button asChild className="mt-auto w-full">
                    <Link to="/obtenir-des-soumissions">Demander une soumission</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 rounded-lg border bg-muted/30 p-6 text-center">
        <h2 className="text-xl font-semibold">Une seule demande, plusieurs soumissions</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
          Décrivez votre projet en quelques minutes. Vrac Québec identifie les entreprises compétentes
          dans votre secteur et vous transmet leurs prix, sans frais et sans engagement.
        </p>
        <Button asChild size="lg" className="mt-4"><Link to="/obtenir-des-soumissions">Obtenir des soumissions</Link></Button>
      </section>
    </main>
  );
}
