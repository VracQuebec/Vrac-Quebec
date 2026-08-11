// Points 6 & 33 — landing remblai économique (trafic Marketplace, mobile d'abord).
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Coins, MapPin, Recycle, ShieldCheck } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";

const BENEFITS = [
  { icon: Coins, t: "Économisez", d: "Le matériau provenant de surplus de chantier peut être beaucoup plus économique qu'un matériau neuf." },
  { icon: Recycle, t: "Réutilisez", d: "Un surplus de chantier peut devenir utile sur un autre projet, au lieu d'être transporté loin." },
  { icon: MapPin, t: "Réduisez le transport", d: "Nous cherchons d'abord les solutions les plus locales possible autour de votre terrain." },
];

const Remblai = () => {
  useEffect(() => {
    document.title = "Remblai économique près de chez vous | Vrac Québec";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "Besoin de remplir un terrain? Des surplus de terre, sable ou remblai provenant de chantiers peuvent être disponibles dans votre secteur. Vérifiez les possibilités."
      );
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TransportBanner />

      <main className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
            <Recycle className="h-3.5 w-3.5" aria-hidden /> Remblai économique
          </span>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold leading-tight text-foreground">
            Besoin de remplir un terrain&nbsp;?
          </h1>
          <p className="mt-4 font-body text-base leading-relaxed text-muted-foreground">
            Des surplus de terre, sable ou remblai provenant de chantiers peuvent être disponibles
            dans votre secteur. Vrac Québec cherche la solution compatible la plus proche.
          </p>
          <Link
            to="/acheter-materiaux"
            className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-display text-base font-bold uppercase tracking-wide text-primary-foreground shadow-lg"
          >
            Voir ce qui est disponible dans mon secteur <ArrowRight className="h-5 w-5" />
          </Link>
        </header>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-border bg-card p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-3 font-display text-base font-extrabold uppercase tracking-wide text-foreground">{t}</h2>
              <p className="mt-1.5 font-body text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>

        <p className="mt-8 flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-4 font-body text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          La disponibilité des surplus varie selon les chantiers en cours et le secteur. Aucun
          matériau gratuit n'est garanti : l'acceptabilité, la quantité et le coût dépendent du
          matériau, de sa provenance et de la distance de transport.
        </p>

        <div className="mt-8 rounded-2xl border-2 border-primary/40 bg-primary/5 p-6 text-center">
          <p className="font-display text-lg font-extrabold text-foreground">
            Vous avez plutôt des matériaux à sortir&nbsp;?
          </p>
          <Link
            to="/depot-materiaux"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary px-5 py-3 font-display text-sm font-bold text-primary hover:bg-primary/10"
          >
            Trouver une solution pour mon matériel <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Remblai;
