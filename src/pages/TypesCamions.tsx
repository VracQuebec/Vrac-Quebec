// Point 29 — Page informative « Types de camions » (contenu administrable : jsc_trucks).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { supabase } from "@/integrations/supabase/client";

type TruckProfile = {
  id: string;
  name: string;
  truck_type: string | null;
  capacity_tonnes: number | null;
  capacity_m3: number | null;
  axle_count: number | null;
  public_description: string | null;
  public_image_url: string | null;
  public_uses: string[] | null;
  access_requirements: string[] | null;
  limitations: string[] | null;
};

const List = ({ title, items }: { title: string; items: string[] }) =>
  items.length === 0 ? null : (
    <div className="mt-3">
      <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((i) => (
          <li key={i} className="font-body text-sm text-foreground">• {i}</li>
        ))}
      </ul>
    </div>
  );

const TypesCamions = () => {
  const [trucks, setTrucks] = useState<TruckProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Types de camions pour le transport en vrac | Vrac Québec";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "10 roues, 12 roues, semi-remorque : capacités, usages et contraintes d'accès de chaque type de camion utilisé pour le transport de matériaux en vrac au Québec.",
      );
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("jsc_public_truck_profiles" as never);
      setTrucks((data ?? []) as TruckProfile[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TransportBanner />
      <main className="container mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="text-center">
          <h1 className="font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
            Types de camions
          </h1>
          <p className="mt-3 font-body text-base text-muted-foreground">
            Le camion utilisé dépend de la quantité, de la distance et surtout de l'accès à votre
            terrain. Voici les configurations disponibles sur la plateforme.
          </p>
        </header>

        {loading ? (
          <p className="mt-10 text-center font-body text-sm text-muted-foreground">Chargement…</p>
        ) : trucks.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-border bg-muted/40 p-5 text-center font-body text-sm text-muted-foreground">
            Les fiches de camions sont en cours de préparation. Contactez-nous pour valider le type
            de camion adapté à votre terrain.
          </p>
        ) : (
          <section className="mt-8 space-y-4">
            {trucks.map((t) => (
              <article key={t.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                {t.public_image_url && (
                  <img src={t.public_image_url} alt={`Camion ${t.name}`} loading="lazy"
                    className="h-44 w-full object-cover sm:h-56" />
                )}
                <div className="p-5">
                  <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
                    <Truck className="h-5 w-5 text-primary" aria-hidden /> {t.name}
                  </h2>
                  <p className="mt-1 font-body text-sm text-muted-foreground">
                    {t.capacity_tonnes ? `Jusqu'à ${t.capacity_tonnes} tonnes par voyage` : "Capacité à confirmer"}
                    {t.capacity_m3 ? ` • environ ${t.capacity_m3} m³` : ""}
                    {t.axle_count ? ` • ${t.axle_count} essieux` : ""}
                  </p>
                  {t.public_description && (
                    <p className="mt-3 font-body text-sm leading-relaxed text-foreground">{t.public_description}</p>
                  )}
                  <List title="Usages courants" items={t.public_uses ?? []} />
                  <List title="Accès requis" items={t.access_requirements ?? []} />
                  <List title="Limitations" items={t.limitations ?? []} />
                </div>
              </article>
            ))}
          </section>
        )}

        <Link
          to="/calculateur"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-lg"
        >
          Calculer ma quantité et mes voyages <ArrowRight className="h-4 w-4" />
        </Link>
      </main>
    </div>
  );
};

export default TypesCamions;