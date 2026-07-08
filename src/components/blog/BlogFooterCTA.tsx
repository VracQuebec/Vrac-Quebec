import { Link } from "react-router-dom";

export default function BlogFooterCTA() {
  return (
    <section className="my-12 rounded-2xl overflow-hidden bg-foreground text-background">
      <div className="container mx-auto px-6 py-10 md:py-14 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h2 className="text-2xl md:text-3xl font-display font-extrabold leading-tight">
            Prêt à passer <span className="text-primary">à l'action</span>?
          </h2>
          <p className="mt-3 text-background/75 font-body max-w-md">
            Que vous ayez besoin de matériaux ou d'un endroit où déposer votre remblai, on est là pour vous.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 md:justify-end">
          <Link
            to="/#questionnaire"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold shadow-lg hover:opacity-90 transition"
          >
            Faire une demande de remblai
          </Link>
          <Link
            to="/#questionnaire"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg border-2 border-primary text-primary font-display font-bold hover:bg-primary/10 transition"
          >
            Déposer des matériaux
          </Link>
        </div>
      </div>
    </section>
  );
}