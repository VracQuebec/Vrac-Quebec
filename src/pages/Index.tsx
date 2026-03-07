import Questionnaire from "@/components/Questionnaire";
import { Truck } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">
              Vrac<span className="text-primary">Québec</span>
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-body hidden sm:block">
            Matériaux en vrac • Livraison rapide
          </span>
        </div>
      </nav>

      {/* Hero + Questionnaire */}
      <main className="py-12 md:py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight">
              Trouvez votre matériel<br />
              <span className="text-primary">en quelques clics</span>
            </h1>
            <p className="text-muted-foreground mt-4 max-w-md mx-auto font-body">
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
