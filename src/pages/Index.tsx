import Questionnaire from "@/components/Questionnaire";
import heroBanner from "@/assets/hero-banner.png";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero — mobile: image banner; desktop: full hero with centered content */}
      <header className="relative w-full overflow-hidden">
        {/* Mobile image (kept as-is) */}
        <img
          src={heroBanner}
          alt="Vrac Québec — Sites de dépôt, terre, sable, gravier, remblai"
          className="md:hidden w-full h-[280px] sm:h-[360px] object-cover"
        />
        <div className="md:hidden absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

        {/* Desktop hero — premium left-aligned layout, branded camion + montagnes restent visibles à droite */}
        <div
          className="hidden md:flex relative w-full min-h-[600px] lg:min-h-[680px] xl:min-h-[740px] items-center bg-no-repeat"
          style={{
            backgroundImage: `url(${heroBanner})`,
            backgroundSize: "cover",
            backgroundPosition: "right 30%",
          }}
        >
          {/* Cinematic overlay: darker on the left where text sits, transparent on the right to showcase camion + montagnes */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-background/90" />

          <div className="relative z-10 container mx-auto px-8 lg:px-12">
            <div className="max-w-2xl">
              {/* Eyebrow / sous-titre subtil */}
              <p
                className="text-primary font-display font-semibold text-xs lg:text-sm tracking-[0.25em] uppercase animate-fade-in"
                style={{ animationDelay: "0ms", animationFillMode: "both" }}
              >
                Sites de Dépôt • Terre • Sable • Gravier • Remblai
              </p>

              {/* Titre principal */}
              <h1
                className="mt-6 text-4xl lg:text-[58px] xl:text-[64px] font-display font-extrabold text-white leading-[1.05] tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)] animate-fade-in"
                style={{ animationDelay: "120ms", animationFillMode: "both" }}
              >
                Commandez votre vrac{" "}
                <span className="text-primary">rapidement au Québec</span>
              </h1>

              {/* Sous-titre secondaire */}
              <p
                className="mt-7 max-w-xl font-body text-base lg:text-lg text-white/80 leading-relaxed animate-fade-in"
                style={{ animationDelay: "240ms", animationFillMode: "both" }}
              >
                Livraison rapide partout dans la région de Québec et Lévis.
              </p>

              {/* CTA premium */}
              <div
                className="mt-10 animate-fade-in"
                style={{ animationDelay: "360ms", animationFillMode: "both" }}
              >
                <a
                  href="#questionnaire"
                  className="group inline-flex items-center gap-3 px-10 py-4 rounded-xl bg-primary text-primary-foreground font-display font-bold text-base lg:text-lg shadow-[0_12px_36px_-10px_hsl(25_95%_53%/0.75)] hover:shadow-[0_18px_48px_-10px_hsl(25_95%_53%/0.9)] hover:-translate-y-0.5 transition-all duration-300"
                >
                  Recevoir mon estimation
                  <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </a>
                <p className="mt-4 text-white/60 text-xs lg:text-sm font-body">
                  Réponse rapide • Sans engagement • Entrepreneurs locaux
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Questionnaire */}
      <main className="-mt-16 md:mt-0 relative z-10 pb-12 md:pb-20 md:pt-12">
        <div className="container mx-auto px-6">
          {/* Mobile-only intro (desktop has hero text above) */}
          <div className="md:hidden text-center mb-10">
            <h1 className="text-2xl font-display font-extrabold text-foreground leading-tight">
              Commandez votre vrac{" "}
              <span className="text-primary">rapidement au Québec</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto font-body text-sm">
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

      {/* Floating mobile contact bar */}
      <div className="md:hidden fixed bottom-2 left-2 right-2 z-50 grid grid-cols-3 gap-1.5">
        <a
          href="tel:5819947717"
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-full bg-primary text-primary-foreground font-display font-semibold text-xs shadow-lg"
        >
          📞 Appeler
        </a>
        <a
          href="sms:15819947717?body=Bonjour%2C%20j%27aimerais%20avoir%20une%20soumission%20pour%20du%20mat%C3%A9riel%20en%20vrac."
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-full bg-foreground text-background font-display font-semibold text-xs shadow-lg"
        >
          💬 Texto
        </a>
        <a
          href="https://wa.me/15819947717?text=Bonjour%2C%20j%27aimerais%20avoir%20une%20soumission%20pour%20du%20mat%C3%A9riel%20en%20vrac."
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-full bg-[#25D366] text-white font-display font-semibold text-xs shadow-lg"
        >
          🟢 WhatsApp
        </a>
      </div>

      {/* Footer */}
      <footer className="py-8 pb-20 md:pb-8 border-t border-border">
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
