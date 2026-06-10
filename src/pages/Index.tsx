import Questionnaire from "@/components/Questionnaire";
import heroTruck from "@/assets/hero-truck.jpg";
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

      {/* Hero — corporate banner style: left text, right photoreal truck */}
      <header className="relative w-full overflow-hidden bg-white">
        {/* Subtle green diagonal accent */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(115deg, transparent 0%, transparent 40%, hsl(89 74% 48%) 40%, hsl(89 74% 48%) 42%, transparent 42%, transparent 60%, hsl(89 74% 48%) 60%, hsl(89 74% 48%) 61%, transparent 61%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary" />

        <div className="relative container mx-auto px-6 py-10 md:py-14 lg:py-16 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center">
          {/* Left: text */}
          <div className="order-2 md:order-1 text-center md:text-left animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-primary/10 text-primary font-display font-semibold text-xs uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Livraison Québec & alentours
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-display font-extrabold text-foreground leading-[1.05] tracking-tight">
              Commande de matériaux{" "}
              <span className="text-primary">en vrac</span>
            </h1>
            <p className="mt-5 text-base lg:text-lg text-muted-foreground font-body max-w-xl mx-auto md:mx-0">
              Terre <span className="text-primary font-bold">•</span> Sable{" "}
              <span className="text-primary font-bold">•</span> Gravier{" "}
              <span className="text-primary font-bold">•</span> Pierre concassée{" "}
              <span className="text-primary font-bold">•</span> Remblai
            </p>
            <a
              href="#questionnaire"
              className="inline-block mt-7 px-8 py-3.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-base lg:text-lg shadow-[0_10px_30px_-8px_hsl(89_74%_48%/0.7)] hover:scale-[1.03] hover:shadow-[0_14px_40px_-8px_hsl(89_74%_48%/0.85)] transition-all"
            >
              Obtenir mon prix →
            </a>
          </div>

          {/* Right: photoreal truck */}
          <div className="order-1 md:order-2 relative">
            <img
              src={heroTruck}
              alt="Camion 12 roues moderne — Vrac Québec, livraison de matériaux en vrac"
              className="w-full h-auto object-contain drop-shadow-[0_25px_25px_rgba(0,0,0,0.15)]"
              fetchPriority="high"
              decoding="async"
              width={1536}
              height={1024}
            />
          </div>
        </div>
      </header>

      {/* Questionnaire */}
      {/* Extra bottom padding on mobile so the floating contact bar never overlaps interactive content (tiles / Suivant button). */}
      <main className="relative z-10 pb-32 md:pb-20 pt-8 md:pt-12">
        <div className="container mx-auto px-6">
          <div id="questionnaire">
            <Questionnaire />
          </div>
        </div>
      </main>

      {/* Floating mobile contact bar.
          pointer-events-none on the wrapper + pointer-events-auto on each link
          ensures only the buttons themselves capture taps — the surrounding gaps
          let the user interact with the questionnaire underneath. */}
      <div className="md:hidden fixed bottom-2 left-2 right-2 z-50 grid grid-cols-3 gap-1.5 pointer-events-none">
        <a
          href="tel:5819947717"
          className="pointer-events-auto flex items-center justify-center gap-1 px-2 py-2 rounded-full bg-primary text-primary-foreground font-display font-semibold text-xs shadow-lg"
        >
          📞 Appeler
        </a>
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
  );
};

export default Index;
