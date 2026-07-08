import { Link } from "react-router-dom";
import { Truck, PackagePlus, Send } from "lucide-react";

export default function BlogFooterCTA() {
  return (
    <section className="my-12 rounded-2xl overflow-hidden bg-foreground text-background">
      <div className="container mx-auto px-6 py-10 md:py-14">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-extrabold leading-tight">
            Prêt à passer <span className="text-primary">à l'action</span>?
          </h2>
          <p className="mt-3 text-background/75 font-body">
            Choisissez ce dont vous avez besoin — on s'occupe du reste.
          </p>
        </div>
        <div className="mt-8 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
          <Link
            to="/#questionnaire"
            className="group flex flex-col items-center text-center gap-2 px-5 py-5 rounded-xl bg-primary text-primary-foreground font-display font-bold shadow-lg hover:opacity-90 transition"
          >
            <PackagePlus className="w-6 h-6" />
            <span>Faire une demande de remblai</span>
          </Link>
          <Link
            to="/#questionnaire"
            className="group flex flex-col items-center text-center gap-2 px-5 py-5 rounded-xl border-2 border-primary text-primary font-display font-bold hover:bg-primary/10 transition"
          >
            <Truck className="w-6 h-6" />
            <span>Déposer des matériaux</span>
          </Link>
          <Link
            to="/#questionnaire"
            className="group flex flex-col items-center text-center gap-2 px-5 py-5 rounded-xl border-2 border-background/30 text-background font-display font-bold hover:bg-background/10 transition"
          >
            <Send className="w-6 h-6" />
            <span>Demander une soumission de transport</span>
          </Link>
        </div>
      </div>
    </section>
  );
}