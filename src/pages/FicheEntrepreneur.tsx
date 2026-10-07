// Fiche publique détaillée d'une entreprise partenaire (SEO) : photos, services,
// territoires, score public et avis clients. Aucune coordonnée n'est affichée :
// le contact passe toujours par la demande de soumissions Vrac Québec.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, Building2, Camera, Loader2, MapPin, ShieldCheck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { addReview, fetchPublicPartner, type PublicPartner } from "@/lib/marketplace/api";
import { toast } from "sonner";

const SITE = "https://vracquebec.ca";

function Stars({ value, className = "h-4 w-4" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${className} ${i <= Math.round(value) ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
      ))}
    </span>
  );
}

export default function FicheEntrepreneur() {
  const { companyId } = useParams();
  const [partner, setPartner] = useState<PublicPartner | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Formulaire d'avis (utilisateur connecté uniquement)
  const [userId, setUserId] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetchPublicPartner(companyId)
      .then((p) => { setPartner(p); setNotFound(!p); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [companyId]);

  const jsonLd = useMemo(() => {
    if (!partner) return null;
    return {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: partner.name,
      description: partner.description ?? undefined,
      image: partner.photos.map((p) => p.url),
      address: {
        "@type": "PostalAddress",
        addressLocality: partner.city ?? undefined,
        addressRegion: partner.region ?? "Québec",
        addressCountry: "CA",
      },
      ...(partner.reviews_count > 0 && partner.reviews_avg != null
        ? { aggregateRating: { "@type": "AggregateRating", ratingValue: partner.reviews_avg, reviewCount: partner.reviews_count } }
        : {}),
    };
  }, [partner]);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partner || !userId) return;
    setSending(true);
    try {
      await addReview({ companyId: partner.company_id, rating, title, comment, authorName });
      toast.success("Merci ! Votre avis est publié.");
      setTitle(""); setComment(""); setRating(5);
      const fresh = await fetchPublicPartner(partner.company_id);
      setPartner(fresh);
    } catch {
      toast.error("Impossible de publier l'avis pour le moment.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-20 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la fiche…
      </main>
    );
  }

  if (notFound || !partner) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Fiche introuvable</h1>
        <p className="mt-2 text-muted-foreground">Cette entreprise n'est pas affichée publiquement.</p>
        <Button asChild className="mt-6"><Link to="/trouver-un-entrepreneur">Retour à l'annuaire</Link></Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Helmet>
        <title>{`${partner.name} — ${partner.city ?? "Québec"} | Vrac Québec`}</title>
        <meta name="description" content={(partner.description || `${partner.name}, entreprise partenaire du réseau Vrac Québec.`).slice(0, 155)} />
        <link rel="canonical" href={`${SITE}/trouver-un-entrepreneur/fiche/${partner.company_id}`} />
        {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
      </Helmet>

      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/trouver-un-entrepreneur"><ArrowLeft className="mr-1 h-4 w-4" /> Annuaire des entreprises</Link>
      </Button>

      <header className="border-b border-border pb-7">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
            {partner.logo_url ? <img src={partner.logo_url} alt={`Logo de ${partner.name}`} className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7 text-muted-foreground" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 break-words font-display text-3xl font-bold">
              {partner.name}
              {partner.is_verified && <ShieldCheck className="h-6 w-6 text-primary" aria-label="Entreprise vérifiée" />}
            </h1>
            <p className="mt-1 flex items-start gap-1 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {[partner.city, partner.region].filter(Boolean).join(", ") || "Localisation à compléter"}
              {partner.founded_year ? ` · En affaires depuis ${partner.founded_year}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button asChild><Link to="/obtenir-des-soumissions">Demander une soumission <ArrowRight className="h-4 w-4" /></Link></Button>
          {partner.reviews_count > 0 && partner.reviews_avg != null && (
            <span className="flex items-center gap-1.5 text-sm"><Stars value={partner.reviews_avg} /><strong>{Number(partner.reviews_avg).toFixed(1)}</strong><span className="text-muted-foreground">({partner.reviews_count} avis)</span></span>
          )}
          {partner.public_score != null && <Badge variant="secondary">Score qualité {Math.round(partner.public_score)} / 100</Badge>}
          {partner.availability_status === "disponible" && <Badge>Disponible</Badge>}
        </div>
      </header>

      {partner.photos.length > 0 && (
        <section className="mt-8" aria-label="Photos des réalisations">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {partner.photos.map((ph) => (
              <figure key={ph.id} className="overflow-hidden rounded-lg border">
                <img src={ph.url} alt={ph.caption || `Réalisation de ${partner.name}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                {ph.caption && <figcaption className="px-2 py-1 text-xs text-muted-foreground">{ph.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 border-b border-border pb-7">
        <h2 className="text-xl font-semibold">À propos</h2>
        <p className="mt-2 whitespace-pre-line text-muted-foreground">{partner.description || "Description à compléter."}</p>
      </section>

      <div className="grid gap-0 sm:grid-cols-2 sm:gap-8">
        <section className="border-b border-border py-7">
          <h2 className="text-lg font-semibold">Services</h2>
          {partner.services.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {partner.services.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
          </div>
          ) : <p className="mt-2 text-sm text-muted-foreground">Aucun service configuré.</p>}
        </section>

        <section className="border-b border-border py-7">
          <h2 className="text-lg font-semibold">Territoires desservis</h2>
          <p className="mt-2 text-sm text-muted-foreground">{partner.territories.length ? partner.territories.join(" · ") : "Territoires à compléter."}</p>
        </section>
      </div>

      {partner.is_verified && <section className="mt-8">
        <h2 className="text-xl font-semibold">Vérifications</h2>
        <p className="mt-2 flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" />Entreprise vérifiée dans le réseau</p>
      </section>}

      <section className="mt-10" aria-label="Avis clients">
        <h2 className="text-xl font-semibold">Avis clients ({partner.reviews_count})</h2>
        {partner.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucun avis publié pour le moment.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {partner.reviews.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{r.title || "Avis client"}</span>
                    <Stars value={r.rating} />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {r.author_name || "Client Vrac Québec"} · {new Date(r.created_at).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </CardHeader>
                {r.comment && <CardContent className="text-sm text-muted-foreground">{r.comment}</CardContent>}
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-6">
          <CardHeader><CardTitle className="text-base">Laisser un avis</CardTitle></CardHeader>
          <CardContent>
            {userId ? (
              <form onSubmit={submitReview} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="avis-note">Note</Label>
                  <div className="flex items-center gap-1" id="avis-note">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Button key={i} variant="ghost" size="icon" type="button" onClick={() => setRating(i)} aria-label={`${i} étoile${i > 1 ? "s" : ""}`}>
                        <Star className={`h-6 w-6 ${i <= rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="avis-nom">Votre nom (affiché publiquement)</Label>
                  <Input id="avis-nom" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Ex. : Martin, Québec" maxLength={80} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="avis-titre">Titre</Label>
                  <Input id="avis-titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="avis-commentaire">Votre avis</Label>
                  <Textarea id="avis-commentaire" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={2000} />
                </div>
                <Button type="submit" disabled={sending} className="w-fit">
                  {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Publier mon avis
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Link to="/auth" className="font-medium text-primary underline">Connectez-vous</Link> pour laisser un avis sur cette entreprise.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-12 border-y border-border py-7 text-center">
        <h2 className="text-xl font-semibold">Intéressé par {partner.name} ?</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
          Déposez une seule demande : Vrac Québec la transmet aux entreprises compétentes de votre secteur
          et vous présente leurs soumissions, sans frais et sans engagement.
        </p>
        <Button asChild size="lg" className="mt-4"><Link to="/obtenir-des-soumissions">Obtenir des soumissions</Link></Button>
      </section>

      {partner.photos.length === 0 && (
        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Camera className="h-3.5 w-3.5" /> Cette entreprise n'a pas encore publié de photos de ses réalisations.
        </p>
      )}
    </main>
  );
}
