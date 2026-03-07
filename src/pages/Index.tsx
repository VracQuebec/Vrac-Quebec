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
              Trouvez votre matériel{" "}
              <span className="text-primary">en quelques clics</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto font-body text-sm md:text-base">
              Terre, sable, gravier, roche concassée — répondez à quelques questions et recevez une soumission rapidement.
            </p>
          </div>

          <Questionnaire />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
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
