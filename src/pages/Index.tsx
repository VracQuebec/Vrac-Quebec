import Questionnaire from "@/components/Questionnaire";
import heroBanner from "@/assets/hero-banner.webp";
import heroBannerMobile from "@/assets/hero-banner-mobile.webp";
import TransportBanner from "@/components/TransportBanner";
import PrimaryCtas from "@/components/home/PrimaryCtas";
import ClienteleUniverses from "@/components/home/ClienteleUniverses";
import DompeShowcase from "@/components/home/DompeShowcase";
import HowItWorks from "@/components/home/HowItWorks";
import IntentSelector from "@/components/home/IntentSelector";
import { HardHat, Sparkles, Brain, MapPin, Truck, Zap } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* 1. Bandeau Vrac Québec — haut de page */}
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
              Terre à sortir ou terrain à remplir&nbsp;?{" "}
              <span className="text-primary">On trouve la meilleure solution près de votre chantier.</span>
            </h1>
            <p className="text-white/85 mt-6 max-w-2xl mx-auto font-body text-base lg:text-lg leading-relaxed">
              Terre • Sable • Pierre • Remblai • Transport • Sites de dépôt
            </p>
            <PrimaryCtas variant="hero" className="mt-8 max-w-4xl mx-auto" />
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
              Terre à sortir ou terrain à remplir&nbsp;?{" "}
              <span className="text-primary">On trouve la solution près de votre chantier.</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto font-body text-sm">
              Terre • Sable • Pierre • Remblai • Transport • Sites de dépôt
            </p>
            <PrimaryCtas className="mt-5 text-left" />
          </div>

          <div className="mb-12">
            <IntentSelector />
          </div>

          <div id="questionnaire">
            <Questionnaire />
          </div>

          <ClienteleUniverses />
          <DompeShowcase />
          <HowItWorks />

          {/* Espace entrepreneur — site public reste vitrine; les outils avancés vivent derrière la connexion */}
          <section
            aria-labelledby="espace-entrepreneur-title"
            className="mt-14 max-w-3xl mx-auto rounded-2xl border border-border bg-card p-6 sm:p-8 text-center"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-display font-bold uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              Espace entrepreneur
            </div>
            <h2
              id="espace-entrepreneur-title"
              className="mt-4 text-2xl sm:text-3xl font-display font-extrabold text-foreground leading-tight"
            >
              Trouvez la meilleure dompe{" "}
              <span className="text-primary">en moins de 60 secondes</span>.
            </h2>
            <p className="mt-4 text-sm sm:text-base text-muted-foreground font-body max-w-xl mx-auto leading-relaxed">
              Connectez-vous à votre espace entrepreneur pour accéder à notre assistant intelligent.
            </p>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground font-body max-w-xl mx-auto leading-relaxed">
              Il analyse automatiquement votre chantier et vous recommande les meilleurs sites disponibles selon le matériau à transporter, la distance, le temps de trajet, la disponibilité et le type de camion.
            </p>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground font-body max-w-xl mx-auto leading-relaxed">
              Une fois la meilleure option trouvée, votre demande est prise en charge par Vrac Québec, qui analyse, valide et coordonne l’accès au site.
            </p>

            {/* Avantages */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary shrink-0">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-display font-semibold text-foreground text-sm">Recommandation intelligente</p>
                  <p className="text-xs text-muted-foreground">Un site suggéré selon votre chantier.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-display font-semibold text-foreground text-sm">Distance et temps de trajet</p>
                  <p className="text-xs text-muted-foreground">Calculs automatisés en temps réel.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-display font-semibold text-foreground text-sm">Compatible avec votre camion</p>
                  <p className="text-xs text-muted-foreground">Seuls les sites adaptés sont affichés.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-display font-semibold text-foreground text-sm">Demande traitée par Vrac Québec</p>
                  <p className="text-xs text-muted-foreground">Vrac Québec coordonne l’accès au site.</p>
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
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
          </section>
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
