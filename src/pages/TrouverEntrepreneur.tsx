// ============================================================
// ANNUAIRE PUBLIC — TROUVER UN ENTREPRENEUR
// Recherche par service, ville, région ou catégorie. Sert aussi au
// référencement. Le parcours ramène toujours vers la demande de
// soumissions sur la plateforme plutôt que vers l'extérieur.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { BadgeCheck, Loader2, MapPin, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchCategories, fetchDirectory } from "@/lib/marketplace/api";
import type { DirectoryEntry } from "@/lib/marketplace/api";
import type { ServiceCategory } from "@/lib/marketplace/types";

const deslug = (v?: string) =>
  v ? decodeURIComponent(v).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";

export default function TrouverEntrepreneur() {
  const { service: serviceParam, ville: villeParam } = useParams();
  const [params, setParams] = useSearchParams();

  const [service, setService] = useState(deslug(serviceParam) || params.get("service") || "");
  const [ville, setVille] = useState(deslug(villeParam) || params.get("ville") || "");
  const [categorie, setCategorie] = useState(params.get("categorie") || "");
  const [rows, setRows] = useState<DirectoryEntry[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const cats = await fetchCategories(true);
        setCategories(cats.filter((c) => !c.parent_id));
      } catch { /* la recherche reste utilisable sans la liste */ }
    })();
  }, []);

  const chercher = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchDirectory({ service: service || null, city: ville || null, categorySlug: categorie || null });
      setRows(res);
    } catch {
      setRows([]);
    } finally { setLoading(false); }
  }, [service, ville, categorie]);

  useEffect(() => { void chercher(); }, [chercher]);

  const titre = useMemo(() => {
    const parts = [service || "Entrepreneurs", ville ? `à ${ville}` : "au Québec"];
    return parts.join(" ");
  }, [service, ville]);

  const appliquer = () => {
    const next = new URLSearchParams();
    if (service) next.set("service", service);
    if (ville) next.set("ville", ville);
    if (categorie) next.set("categorie", categorie);
    setParams(next);
    void chercher();
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{`${titre} | Vrac Québec`}</title>
        <meta name="description" content={`Trouvez un entrepreneur ${service ? service.toLowerCase() + " " : ""}${ville ? "à " + ville : "au Québec"} et obtenez des soumissions gratuites par Vrac Québec.`} />
        <link rel="canonical" href={`https://vracquebec.ca/trouver-un-entrepreneur`} />
      </Helmet>

      <section className="border-b bg-muted/40 px-4 py-10">
        <div className="mx-auto max-w-6xl space-y-4">
          <h1 className="text-3xl font-bold md:text-4xl">Trouver un entrepreneur</h1>
          <p className="max-w-2xl text-muted-foreground">
            Transport en vrac, excavation, pavage, déneigement, matériaux : trouvez les entreprises
            actives dans votre secteur et obtenez plusieurs soumissions au même endroit.
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            <Input placeholder="Service (ex. : excavation)" value={service} onChange={(e) => setService(e.target.value)} />
            <Input placeholder="Ville (ex. : Lévis)" value={ville} onChange={(e) => setVille(e.target.value)} />
            <select className="h-10 rounded-md border bg-background px-3 text-sm"
              value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              <option value="">Toutes les catégories</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
            <Button onClick={appliquer}><Search className="mr-1 h-4 w-4" /> Rechercher</Button>
          </div>
          <Button asChild size="lg" className="mt-2">
            <Link to="/obtenir-des-soumissions">Demander des soumissions</Link>
          </Button>
        </div>
      </section>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border p-8 text-center">
              <p className="font-medium">Aucune entreprise publiée ne correspond à cette recherche.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Déposez tout de même votre demande : Vrac Québec ira chercher les entreprises appropriées pour vous.
              </p>
              <Button asChild className="mt-4"><Link to="/obtenir-des-soumissions">Demander des soumissions</Link></Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => (
                <Card key={r.company_id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start gap-3">
                      {r.logo_url ? (
                        <img src={r.logo_url} alt={`Logo de ${r.name}`} loading="lazy" className="h-12 w-12 rounded object-contain" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-sm font-bold">
                          {r.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 font-semibold">
                          {r.name}
                          {r.is_verified && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Entreprise vérifiée" />}
                        </p>
                        {(r.city || r.region) && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {[r.city, r.region].filter(Boolean).join(", ")}
                          </p>
                        )}
                        {r.public_score !== null && r.public_score !== undefined && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="h-3 w-3" /> {Math.round(Number(r.public_score))} / 100
                          </p>
                        )}
                      </div>
                    </div>
                    {r.description && <p className="line-clamp-3 text-sm text-muted-foreground">{r.description}</p>}
                    {r.services?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {r.services.slice(0, 4).map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
                      </div>
                    )}
                    <Button asChild size="sm" className="w-full">
                      <Link to={`/obtenir-des-soumissions?entreprise=${r.company_id}`}>Demander des soumissions</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
