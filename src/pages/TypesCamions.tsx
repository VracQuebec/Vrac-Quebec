// Point 29 — Page informative « Types de camions ».
// Nomenclature = source de vérité unique (@/lib/trucks/catalog).
// Capacités / photos / usages = données administrables (jsc_trucks) uniquement :
// aucune capacité n'est inventée ici.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { supabase } from "@/integrations/supabase/client";
import { TRUCK_TYPES, type TruckTypeDef } from "@/lib/trucks/catalog";

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
  const [profiles, setProfiles] = useState<TruckProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Types de camions pour le transport en vrac | Vrac Québec";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "Camion 10 roues, 12 roues, semi-dompeur et fardier : à quoi sert chaque véhicule, usages typiques et contraintes d'accès pour le transport en vrac au Québec.",
      );
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("jsc_public_truck_profiles" as never);
      setProfiles((data ?? []) as TruckProfile[]);
      setLoading(false);
    })();
  }, []);

  const types = TRUCK_TYPES.filter((t) => t.key !== "autre");
  const profileFor = (t: TruckTypeDef) =>
    profiles.find((p) => p.truck_type === t.key) ?? null;

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

        <section className="mt-8 space-y-4">
          {types.map((t) => {
            const p = profileFor(t);
            const capacity = p?.capacity_tonnes
              ? `Jusqu'à ${p.capacity_tonnes} tonnes par voyage${p.capacity_m3 ? ` • environ ${p.capacity_m3} m³` : ""}`
              : null;
            return (
              <article key={t.key} className="overflow-hidden rounded-2xl border border-border bg-card">
                {p?.public_image_url && (
                  <img src={p.public_image_url} alt={`Camion ${t.label}`} loading="lazy"
                    className="h-44 w-full object-cover sm:h-56" />
                )}
                <div className="p-5">
                  <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-extrabold text-foreground">
                    <Truck className="h-5 w-5 shrink-0 text-primary" aria-hidden /> {t.label}
                    {t.usage === "machinerie" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-body text-xs font-medium text-muted-foreground">
                        Machinerie lourde
                      </span>
                    )}
                  </h2>
                  <p className="mt-2 font-body text-sm leading-relaxed text-foreground">
                    {p?.public_description ?? t.description}
                  </p>
                  <p className="mt-2 font-body text-sm text-muted-foreground">
                    {loading
                      ? "Chargement de la capacité…"
                      : capacity ??
                        "La capacité dépend du matériau transporté et de la configuration du véhicule."}
                  </p>
                  <p className="mt-2 font-body text-sm text-muted-foreground">
                    {t.usage === "machinerie"
                      ? "Utilisation typique : déplacement de machinerie et d'équipement lourd (pas de transport de matériaux en vrac)."
                      : "Utilisation typique : transport de terre, sable, gravier, pierre et remblai."}
                  </p>
                  <List title="Usages courants" items={p?.public_uses ?? []} />
                  <List title="Accès requis" items={p?.access_requirements ?? []} />
                  <List title="Limitations" items={p?.limitations ?? []} />
                </div>
              </article>
            );
          })}
        </section>

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