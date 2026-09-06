// Fiche publique d'un partenaire du réseau : présentation, disponibilités et évaluations.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, MapPin, Phone, Mail, Globe, Star, BadgeCheck, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JSC_AVAILABILITY_STATUSES, JSC_PARTNER_TYPES } from "@/lib/jsc/config";

type Profile = {
  id: string; slug: string | null; name: string; partner_type: string; tagline: string | null;
  description: string | null; address: string | null; city: string | null; region: string | null;
  postal_code: string | null; phone: string | null; email: string | null; website: string | null;
  logo_url: string | null; photos: string[] | null; certifications: string[] | null;
  services: string[] | null; opening_hours: Record<string, string> | null;
  service_radius_km: number | null; rating_average: number; rating_count: number;
};
type Availability = {
  id: string; status: string; available_quantity: number | null; unit: string | null;
  lead_time_days: number | null; wait_time_minutes: number | null; note: string | null;
  jsc_materials: { name: string } | null;
};
type Review = { id: string; author_name: string | null; rating: number; comment: string | null; created_at: string };

const statusLabel = (v: string) => JSC_AVAILABILITY_STATUSES.find((s) => s.value === v)?.label ?? v;
const typeLabel = (v: string) => JSC_PARTNER_TYPES.find((t) => t.value === v)?.label ?? v;

export default function ReseauProfil() {
  const { slug } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      setLoading(true);
      const isUuid = /^[0-9a-f-]{36}$/i.test(slug);
      // Champs publics uniquement : les coordonnées directes sont réservées aux comptes connectés.
      const PUBLIC_COLS =
        "id,slug,name,partner_type,tagline,description,city,region,website,logo_url,photos," +
        "certifications,services,opening_hours,service_radius_km,rating_average,rating_count";
      const { data } = await supabase
        .from("jsc_marketplace_profiles_public")
        .select(PUBLIC_COLS)
        .eq(isUuid ? "id" : "slug", slug)
        .maybeSingle();
      let p = data as unknown as Profile | null;
      if (p) {
        const { data: session } = await supabase.auth.getSession();
        if (session.session) {
          const { data: contact } = await supabase
            .from("jsc_marketplace_profiles")
            .select("address,postal_code,phone,email")
            .eq("id", p.id)
            .maybeSingle();
          if (contact) p = { ...p, ...(contact as unknown as Partial<Profile>) };
        }
      }
      setProfile(p);
      if (p) {
        const [{ data: av }, { data: rv }] = await Promise.all([
          supabase.from("jsc_availability")
            .select("id,status,available_quantity,unit,lead_time_days,wait_time_minutes,note,jsc_materials(name)")
            .eq("profile_id", p.id).order("status"),
          supabase.from("jsc_marketplace_reviews")
            .select("id,author_name,rating,comment,created_at")
            .eq("profile_id", p.id).order("created_at", { ascending: false }).limit(20),
        ]);
        setAvailability((av as unknown as Availability[]) ?? []);
        setReviews((rv as unknown as Review[]) ?? []);
      }
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement de la fiche…
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Partenaire introuvable</h1>
        <p className="mt-2 text-muted-foreground">Cette fiche n'est pas publiée ou n'existe plus.</p>
        <Button asChild className="mt-6"><Link to="/reseau">Retour au réseau</Link></Button>
      </main>
    );
  }

  const hours = Object.entries(profile.opening_hours ?? {});

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Helmet>
        <title>{`${profile.name} — ${typeLabel(profile.partner_type)} | Vrac Québec`}</title>
        <meta name="description" content={(profile.tagline ?? profile.description ?? `${profile.name}, partenaire du réseau Vrac Québec.`).slice(0, 155)} />
        <link rel="canonical" href={`https://vracquebec.ca/reseau/${profile.slug ?? profile.id}`} />
      </Helmet>

      <Link to="/reseau" className="text-sm text-muted-foreground hover:text-foreground">← Réseau Vrac Québec</Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{profile.name}</h1>
          <p className="mt-1 text-sm uppercase tracking-wide text-muted-foreground">{typeLabel(profile.partner_type)}</p>
          {profile.tagline && <p className="mt-2 max-w-2xl text-muted-foreground">{profile.tagline}</p>}
        </div>
        {profile.rating_count > 0 && (
          <div className="rounded-lg border px-4 py-3 text-center">
            <p className="flex items-center justify-center gap-1 text-2xl font-bold">
              <Star className="h-5 w-5 text-primary" />{profile.rating_average.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">{profile.rating_count} évaluation(s)</p>
          </div>
        )}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          {profile.description && (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Présentation</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{profile.description}</p>
            </div>
          )}

          {Array.isArray(profile.photos) && profile.photos.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {profile.photos.slice(0, 6).map((src) => (
                <img key={src} src={src} alt={`${profile.name} — installations`} loading="lazy" className="h-32 w-full rounded-lg object-cover" />
              ))}
            </div>
          )}

          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Matériaux et disponibilités</h2>
            {availability.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Aucune disponibilité publiée pour le moment.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {availability.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-medium">{a.jsc_materials?.name ?? "Matériau"}</span>
                    <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      {a.available_quantity != null && <span>{a.available_quantity} {a.unit ?? "t"}</span>}
                      {a.lead_time_days != null && <span>délai {a.lead_time_days} j</span>}
                      {a.wait_time_minutes != null && (
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{a.wait_time_minutes} min</span>
                      )}
                      <Badge variant={a.status === "available" ? "default" : a.status === "out_of_stock" ? "destructive" : "outline"}>
                        {statusLabel(a.status)}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {reviews.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Évaluations</h2>
              <ul className="mt-3 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="border-b pb-3 last:border-0 last:pb-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Star className="h-4 w-4 text-primary" />{r.rating}/5
                      <span className="text-muted-foreground">{r.author_name ?? "Client vérifié"}</span>
                    </p>
                    {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-5 text-sm">
            <h2 className="font-semibold">Coordonnées</h2>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {(profile.address || profile.city) && (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4" />
                  <span>{[profile.address, profile.city, profile.region, profile.postal_code].filter(Boolean).join(", ")}</span>
                </li>
              )}
              {profile.service_radius_km != null && <li>Rayon desservi : {profile.service_radius_km} km</li>}
              {profile.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4" />{profile.phone}</li>}
              {profile.email && <li className="flex items-center gap-2"><Mail className="h-4 w-4" />{profile.email}</li>}
              {profile.website && (
                <li className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <a href={profile.website} className="hover:underline" rel="noopener noreferrer" target="_blank">Site web</a>
                </li>
              )}
            </ul>
            <Button asChild className="mt-4 w-full"><Link to="/soumission">Obtenir une estimation</Link></Button>
          </div>

          {Array.isArray(profile.certifications) && profile.certifications.length > 0 && (
            <div className="rounded-xl border bg-card p-5 text-sm">
              <h2 className="font-semibold">Certifications</h2>
              <ul className="mt-3 space-y-1 text-muted-foreground">
                {profile.certifications.map((c) => (
                  <li key={c} className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-primary" />{c}</li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(profile.services) && profile.services.length > 0 && (
            <div className="rounded-xl border bg-card p-5 text-sm">
              <h2 className="font-semibold">Services</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.services.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
              </div>
            </div>
          )}

          {hours.length > 0 && (
            <div className="rounded-xl border bg-card p-5 text-sm">
              <h2 className="font-semibold">Heures d'ouverture</h2>
              <ul className="mt-3 space-y-1 text-muted-foreground">
                {hours.map(([day, value]) => (
                  <li key={day} className="flex justify-between gap-3"><span>{day}</span><span>{String(value)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
