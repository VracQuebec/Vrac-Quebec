import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight, CheckCircle2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";

const BENEFITS = [
  "Accéder à notre réseau de sites de dépôt.",
  "Soumettre une demande de dépôt en quelques clics.",
  "Consulter les autorisations reçues.",
  "Voir les conditions d'acceptation de chaque site.",
  "Recevoir les notifications lorsque votre demande est acceptée.",
  "Consulter l'historique complet de vos demandes.",
  "Gérer votre entreprise à partir d'un seul tableau de bord.",
];

const EspaceEntrepreneur = () => {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();

  useEffect(() => {
    document.title = "Espace Entrepreneur | Déposez votre remblai — Vrac Québec";
  }, []);

  useEffect(() => {
    if (isReady && user) navigate("/entrepreneur", { replace: true });
  }, [isReady, user, navigate]);

  return (
    <main className="min-h-screen bg-background">
      <section className="container mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-display text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Réseau Vrac Québec
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
            Bienvenue dans l'Espace Entrepreneur
          </h1>
          <p className="mt-3 font-body text-base text-muted-foreground sm:text-lg">
            Déposez votre remblai plus rapidement grâce au réseau Vrac Québec.
          </p>
          <p className="mx-auto mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
            Que vous soyez excavateur, paysagiste, entrepreneur général ou transporteur, notre
            plateforme vous permet de trouver rapidement un site de dépôt adapté à vos besoins.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border-2 border-border bg-card p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold text-foreground">
            Avec votre compte entrepreneur, vous pourrez :
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5 font-body text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-6 py-3 font-display text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <LogIn className="h-4 w-4" aria-hidden /> Connexion Entrepreneur
          </Link>
          <Link
            to="/entrepreneur/inscription"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-display text-sm font-semibold text-primary-foreground transition-transform hover:gap-3"
          >
            <UserPlus className="h-4 w-4" aria-hidden /> Créer un compte gratuitement
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="mx-auto mt-10 max-w-2xl rounded-2xl bg-muted/50 p-5 text-center">
          <h2 className="font-display text-base font-bold text-foreground">Pourquoi créer un compte&nbsp;?</h2>
          <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">
            Un compte entrepreneur vous permet de suivre toutes vos demandes, d'accéder à nos sites
            de dépôt partenaires, de recevoir des réponses plus rapidement et de gérer vos projets
            au même endroit.
          </p>
        </div>
      </section>
    </main>
  );
};

export default EspaceEntrepreneur;