import Questionnaire from "@/components/Questionnaire";
import heroBanner from "@/assets/hero-banner.webp";
import heroBannerMobile from "@/assets/hero-banner-mobile.webp";
import TransportBanner from "@/components/TransportBanner";
import { HardHat } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* 1. Transport JSC banner — top of the page */}
      <TransportBanner />

      {/* 2. Navigation bar with compact entrepreneur access on the right */}
      <nav className="w-full bg-foreground text-background border-b border-foreground/20">
        <div className="container mx-auto px-4 sm:px-6 py-1.5 flex items-center justify-end">
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-display font-semibold text-xs sm:text-sm shadow-sm hover:bg-primary/90 transition-colors"
          >
            <HardHat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Connexion entrepreneur
          </a>
        </div>
      </nav>

      {/* Hero — mobile: image banner; desktop: full hero with centered content */}
      <header className="relative w-full overflow-hidden">
        {/* Mobile image (kept as-is) */}
        <img
          src={heroBannerMobile}
          alt="Vrac Québec — Sites de dépôt, terre, sable, gravier, remblai"
          className="md:hidden w-full h-[280px] sm:h-[360px] object-cover"
          fetchPriority="high"
          decoding="async"
          loading="eager"
          width={800}
          height={447}
        />
        <div className="md:hidden absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

        {/* Desktop hero — image branding (VRAC QUÉBEC) stays visible up top, text content sits lower over a dark gradient with breathing room */}
        <div
          className="hidden md:flex relative w-full min-h-[600px] lg:min-h-[680px] xl:min-h-[740px] items-end bg-no-repeat"
          style={{
            backgroundImage: `url(${heroBanner})`,
            backgroundSize: "cover",
            backgroundPosition: "center 5%",
          }}
        >
          {/* Gradient: transparent on top to keep logo/camion visible, dark at bottom for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/5 to-black/75" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-background" />

          <div className="relative z-10 container mx-auto px-6 pb-10 lg:pb-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-3xl md:text-4xl lg:text-[2.75rem] font-display font-extrabold text-white leading-[1.2] max-w-[44rem] mx-auto drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
              Commandez votre vrac{" "}
              <span className="text-primary">rapidement au Québec</span>
            </h1>
            <p className="text-white/85 mt-10 max-w-lg mx-auto font-body text-base lg:text-lg leading-relaxed">
              Terre, sable, pierre concassée, remblai — livraison rapide partout dans la région de Québec et Lévis.
            </p>
            <a
              href="#questionnaire"
              className="inline-block mt-12 px-9 py-3.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-base lg:text-lg shadow-[0_10px_30px_-8px_hsl(89_74%_48%/0.7)] hover:scale-[1.03] hover:shadow-[0_14px_40px_-8px_hsl(89_74%_48%/0.85)] transition-all"
            >
              Obtenir mon prix →
            </a>
          </div>
        </div>
      </header>

      {/* Questionnaire */}
      {/* Extra bottom padding on mobile so the floating contact bar never overlaps interactive content (tiles / Suivant button). */}
      <main className="-mt-16 md:mt-0 relative z-10 pb-32 md:pb-20 md:pt-12">
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

          {/* Assistant de demande de transport rapide */}
          <div className="mt-10 max-w-3xl mx-auto">
            <a
              href="/demande-transport"
              className="block p-5 sm:p-6 rounded-2xl border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 hover:border-primary transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="text-4xl">⚡</div>
                <div className="flex-1">
                  <div className="font-display font-bold text-lg sm:text-xl text-foreground">
                    Assistant de demande de transport
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Trouvez la meilleure dompe en moins de 60 secondes.
                  </p>
                </div>
                <span className="hidden sm:inline text-primary font-display font-bold text-sm group-hover:translate-x-1 transition-transform">
                  Commencer →
                </span>
              </div>
            </a>
          </div>
        </div>
      </main>

      {/* Floating mobile contact bar.
          pointer-events-none on the wrapper + pointer-events-auto on each link
          ensures only the buttons themselves capture taps — the surrounding gaps
          let the user interact with the questionnaire underneath. */}
      <div className="md:hidden fixed bottom-2 left-2 right-2 z-50 flex flex-col gap-1.5 pointer-events-none">
        <div className="grid grid-cols-2 gap-1.5">
          <a
            href="tel:5819947717"
            className="pointer-events-auto flex items-center justify-center gap-1 px-2 py-2 rounded-full bg-primary text-primary-foreground font-display font-semibold text-xs shadow-lg"
          >
            📞 581-994-7717
          </a>
          <a
            href="tel:8195923495"
            className="pointer-events-auto flex items-center justify-center gap-1 px-2 py-2 rounded-full bg-primary text-primary-foreground font-display font-semibold text-xs shadow-lg"
          >
            📞 819-592-3495
          </a>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
        <a
          href="sms:15819947717?body=Bonjour%2C%20j%27aimerais%20avoir%20une%20soumission%20pour%20du%20mat%C3%A9riel%20en%20vrac."
          className="pointer-events-auto flex items-center justify-center gap-1 px-2 py-2 rounded-full bg-foreground text-background font-display font-semibold text-xs shadow-lg"
        >
          💬 Texto
        </a>
        <a
          href="https://wa.me/15819947717?text=Bonjour%2C%20j%27aimerais%20avoir%20une%20soumission%20pour%20du%20mat%C3%A9riel%20en%20vrac."
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto flex items-center justify-center gap-1 px-2 py-2 rounded-full bg-[#25D366] text-white font-display font-semibold text-xs shadow-lg"
        >
          🟢 WhatsApp
        </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 pb-20 md:pb-8 border-t border-border">
        <div className="container mx-auto px-6 flex flex-col items-center gap-5 text-sm text-muted-foreground font-body">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <a
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-base shadow-lg hover:opacity-90 transition-opacity"
            >
              <HardHat className="w-5 h-5" />
              Connexion entrepreneur
            </a>
            <a
              href="/entrepreneur/inscription"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-lg border-2 border-primary text-primary font-display font-bold text-base hover:bg-primary/10 transition-colors"
            >
              Devenir entrepreneur
            </a>
          </div>
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <span>© 2026 VracQuébec. Tous droits réservés.</span>
            <div className="flex items-center gap-4">
              <a href="/blog" className="hover:text-foreground transition-colors text-xs">
                Blogue
              </a>
              <a href="/login" className="hover:text-foreground transition-colors text-xs">
                Administration
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
