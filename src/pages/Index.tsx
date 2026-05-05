import Questionnaire from "@/components/Questionnaire";
import heroBanner from "@/assets/hero-banner.png";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Banner */}
      <header className="relative w-full overflow-hidden">
        <img
          src={heroBanner}
          alt="Vrac Québec — Sites de dépôt, terre, sable, gravier, remblai"
          className="w-full h-[280px] sm:h-[360px] md:h-[420px] object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      </header>

      {/* Questionnaire */}
      <main className="-mt-16 relative z-10 pb-12 md:pb-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-10">
            <h1 className="text-2xl md:text-4xl font-display font-extrabold text-foreground leading-tight">
              Commandez votre vrac{" "}
              <span className="text-primary">rapidement au Québec</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto font-body text-sm md:text-base">
              Terre, sable, pierre concassée, remblai — livraison rapide
            </p>
            <a
              href="#questionnaire"
              className="inline-block mt-5 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Obtenir mon prix →
            </a>
          </div>

          <div id="questionnaire">
            <Questionnaire />
          </div>
        </div>
      </main>

      {/* Floating mobile call button */}
      <a
        href="tel:5819947717"
        className="md:hidden fixed bottom-4 left-4 right-4 z-50 flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground font-display font-semibold text-sm shadow-lg"
      >
        📞 581-994-7717 — Appel rapide
      </a>

      {/* Footer */}
      <footer className="py-8 pb-24 md:pb-8 border-t border-border">
        <div className="container mx-auto px-6 flex items-center justify-between text-sm text-muted-foreground font-body">
          <span>© 2026 VracQuébec. Tous droits réservés.</span>
          <a href="/login" className="hover:text-foreground transition-colors">
            Administration
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Index;
