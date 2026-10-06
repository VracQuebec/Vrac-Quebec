import { lazy, Suspense, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import Questionnaire from "@/components/Questionnaire";
import heroBanner from "@/assets/hero-banner-clean.webp";
import heroBannerMobile from "@/assets/hero-banner-mobile-clean.webp";
import TransportBanner from "@/components/TransportBanner";
import IntentChoice, { type IntentKey } from "@/components/home/IntentChoice";
import DompeShowcase from "@/components/home/DompeShowcase";
import HowItWorks from "@/components/home/HowItWorks";
import WhyVracQuebec from "@/components/home/WhyVracQuebec";
import CircularEconomy from "@/components/home/CircularEconomy";
import IntentSelector from "@/components/home/IntentSelector";
import LogoVracQuebec from "@/components/LogoVracQuebec";
import { trackEvent } from "@/lib/analytics/ga4";
const ParcoursForm = lazy(() => import("@/components/parcours/ParcoursForm"));
const SiteAssistant = lazy(() => import("@/components/assistant/SiteAssistant"));
import { ArrowDown, ClipboardList, HardHat, Sparkles } from "lucide-react";

const Index = () => {
  // Aucun parcours n'est ouvert par défaut : le visiteur choisit d'abord son intention.
  const [intent, setIntent] = useState<IntentKey | null>(null);
  const parcoursRef = useRef<HTMLDivElement | null>(null);

  const selectIntent = (key: IntentKey) => {
    setIntent(key);
    trackEvent("intent_select", { intent: key });
    requestAnimationFrame(() => {
      const el = parcoursRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Matériaux en vrac à Québec — terre, gravier, pierre concassée</title>
        <meta name="description" content="Livraison de terre, gravier, pierre concassée, sable et remblai à Québec et Lévis. Trouvez aussi une dompe pour disposer de vos surplus. Soumission gratuite." />
        <link rel="canonical" href="https://vracquebec.ca/" />
        <meta property="og:title" content="Matériaux en vrac à Québec — terre, gravier, pierre concassée" />
        <meta property="og:description" content="Livraison de matériaux en vrac, disposition de surplus, recherche de dompe et transport dans la région de Québec." />
        <meta property="og:url" content="https://vracquebec.ca/" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Matériaux en vrac à Québec — terre, gravier, pierre concassée",
          url: "https://vracquebec.ca/",
          inLanguage: "fr-CA",
          isPartOf: { "@type": "WebSite", name: "Vrac Québec", url: "https://vracquebec.ca" },
          about: [
            { "@type": "Service", name: "Livraison de terre, gravier et pierre concassée en vrac", areaServed: { "@type": "City", name: "Québec" } },
            { "@type": "Service", name: "Disposition de terre et de surplus de matériaux (dompe)", areaServed: { "@type": "City", name: "Québec" } },
            { "@type": "Service", name: "Transport de matériaux pour chantier", areaServed: { "@type": "City", name: "Québec" } },
          ],
        })}</script>
      </Helmet>
      {/* 1. Bandeau Vrac Québec — haut de page */}
      <TransportBanner />

      {/* 2. Navigation principale — logo Vrac Québec + accès entrepreneur */}
      <nav className="w-full bg-foreground/95 text-background">
        <div className="container mx-auto flex items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <LogoVracQuebec />
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-body text-[11px] text-background/70 transition-colors hover:text-primary sm:text-xs"
          >
            <HardHat className="h-3.5 w-3.5" aria-hidden />
            Connexion entrepreneur
          </a>
        </div>
      </nav>


      {/* Hero — mobile: image banner; desktop: full hero with centered content */}
      <header className="relative w-full overflow-hidden">
        {/* Mobile image */}
        <img
          src={heroBannerMobile}
          alt="Vrac Québec — Sites de dépôt, terre, sable, gravier, remblai"
          className="md:hidden w-full h-[240px] sm:h-[300px] object-cover"
          fetchPriority="high"
          decoding="async"
          loading="eager"
          width={800}
          height={447}
        />
        {/* Mobile overlays : cibler la zone de texte imprimé pour le rendre secondaire */}
        <div className="md:hidden absolute inset-0 bg-black/40" />
        <div className="md:hidden absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.62)_0%,_transparent_70%)]" />
        <div className="md:hidden absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent" />

        {/* Desktop hero */}
        <div
          className="hidden md:flex relative w-full min-h-[460px] lg:min-h-[500px] items-center bg-no-repeat"
          style={{
            backgroundImage: `url(${heroBanner})`,
            backgroundSize: "cover",
            backgroundPosition: "center 85%",
          }}
        >
          {/* Voile global très léger : conserve la luminosité du camion et des matériaux */}
          <div className="absolute inset-0 bg-black/30" />
          {/* Voile ciblé : assombrir fortement la zone centrale où se trouvent les textes imprimés et le contenu HTML */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.78)_0%,_rgba(0,0,0,0.40)_50%,_transparent_78%)]" />
          {/* Renforcement vertical pour le bas de l'image */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/50" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />

          <div className="relative z-10 container mx-auto px-6 py-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Rendu desktop du titre : le <h1> unique de la page vit dans le bloc ci-dessous
                (indexation mobile-first), ce libellé reste strictement identique visuellement. */}
            <p className="text-4xl lg:text-5xl xl:text-[3.2rem] font-display font-extrabold text-white leading-[1.1] max-w-[50rem] mx-auto drop-shadow-[0_2px_20px_rgba(0,0,0,0.85)]">
              Trouvez le bon matériau ou la bonne solution pour{" "}
              <span className="text-primary">votre chantier.</span>
            </p>
            <p className="text-white/90 mt-5 max-w-2xl mx-auto font-body text-base lg:text-lg leading-relaxed drop-shadow-[0_1px_10px_rgba(0,0,0,0.75)]">
              Vrac Québec vous aide à trouver des matériaux, disposer de vos surplus, trouver une dompe
              ou coordonner le transport.
            </p>
            <a
              href="#choix"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 font-display text-base font-bold uppercase tracking-wide text-primary-foreground shadow-xl transition-transform hover:scale-[1.02]"
            >
              Choisir mon besoin <ArrowDown className="h-5 w-5" aria-hidden />
            </a>
          </div>
        </div>
      </header>

      {/* Questionnaire */}
      {/* Extra bottom padding on mobile so the floating contact bar never overlaps interactive content (tiles / Suivant button). */}
      <main className="-mt-12 md:mt-0 relative z-10 pb-32 md:pb-20 md:pt-8">
        <div className="container mx-auto px-5 sm:px-6 max-w-6xl">
          {/* Mobile-only intro (desktop has hero text above) */}
          <div className="md:hidden text-center mb-6">
            {/* <h1> unique de la page (visible en mobile-first, masqué visuellement en desktop). */}
            <h1 className="text-[1.6rem] font-display font-extrabold text-foreground leading-tight">
              Trouvez le bon matériau ou la bonne solution pour{" "}
              <span className="text-primary">votre chantier.</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto font-body text-sm leading-relaxed">
              Vrac Québec vous aide à trouver des matériaux, disposer de vos surplus, trouver une dompe
              ou coordonner le transport.
            </p>
            <a
              href="#choix"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-lg"
            >
              Choisir mon besoin <ArrowDown className="h-4 w-4" aria-hidden />
            </a>
          </div>

          {/* Niveau 1 — choix principal */}
          <IntentChoice selected={intent} onSelect={selectIntent} />

          {/* Niveau 2 — parcours affiché uniquement après sélection d'une intention */}
          <div ref={parcoursRef} className="scroll-mt-24">
            {intent === "materiaux" && (
              <div className="mt-14 sm:mt-16">
                <IntentSelector />
                <div id="questionnaire" className="mt-10 scroll-mt-24">
                  <Questionnaire initialService="materiel_remplissage" />
                </div>
              </div>
            )}
            {intent === "sortir" && (
              <div className="mt-14 sm:mt-16">
                <Suspense fallback={<p className="text-muted-foreground">Chargement…</p>}><ParcoursForm variant="evacuation" /></Suspense>
              </div>
            )}
          </div>

          {/* Niveau 2 — recherche de dompe */}
          <div className="mt-20 sm:mt-24">
            <DompeShowcase />
          </div>

          {/* Niveau 3 — réassurance */}
          <div className="mt-20 sm:mt-24">
            <WhyVracQuebec />
          </div>
          <div className="mt-20 sm:mt-24">
            <HowItWorks />
          </div>

          {/* Niveau 4 — mission */}
          <div className="mt-20 sm:mt-24">
            <CircularEconomy />
          </div>

          {/* Place de marché — obtenir plusieurs soumissions d'entreprises vérifiées */}
          <section
            aria-labelledby="soumissions-title"
            className="mx-auto mt-20 max-w-4xl rounded-2xl border-2 border-primary/40 bg-card p-6 text-center sm:mt-24 sm:p-10"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
              <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              Demandes de soumissions
            </div>
            <h2
              id="soumissions-title"
              className="mt-4 font-display text-xl font-extrabold leading-tight text-foreground sm:text-2xl"
            >
              Un seul formulaire, plusieurs prix d'entreprises vérifiées.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground sm:text-base">
              Excavation, transport, pavage, aménagement, déneigement, location de machinerie&nbsp;: décrivez
              votre projet en quelques questions simples. Nous transmettons votre demande aux bonnes
              entreprises et vous comparez les soumissions au même endroit. Gratuit et sans engagement.
            </p>
            <ul className="mx-auto mt-5 grid max-w-2xl gap-2 text-left sm:grid-cols-3">
              {[
                "Aucune question inutile",
                "Vos coordonnées restent privées",
                "Réponses regroupées en ligne",
              ].map((t) => (
                <li key={t} className="rounded-xl bg-muted/60 px-3 py-2 font-body text-sm text-foreground">
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/obtenir-des-soumissions"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-display text-base font-bold text-primary-foreground shadow-lg transition-opacity hover:opacity-90 sm:w-auto"
              >
                Obtenir des soumissions
              </a>
              <a
                href="/mes-soumissions"
                className="inline-flex w-full items-center justify-center rounded-lg border-2 border-border px-6 py-3 font-display text-base font-bold text-foreground transition-colors hover:border-primary hover:text-primary sm:w-auto"
              >
                Suivre mes demandes
              </a>
            </div>
          </section>


          {/* Espace entrepreneur — site public reste vitrine; les outils avancés vivent derrière la connexion */}
          <section
            aria-labelledby="espace-entrepreneur-title"
            className="mt-20 sm:mt-24 max-w-3xl mx-auto rounded-2xl bg-muted/50 p-6 sm:p-10 text-center"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-foreground text-xs font-display font-bold uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              Espace entrepreneur
            </div>
            <h2
              id="espace-entrepreneur-title"
              className="mt-4 text-xl sm:text-2xl font-display font-extrabold text-foreground leading-tight"
            >
              Déjà entrepreneur&nbsp;? Accédez à votre espace professionnel.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground font-body max-w-xl mx-auto leading-relaxed">
              L’assistant intelligent de recherche de dompes est réservé aux entrepreneurs connectés. Votre demande est
              ensuite prise en charge et coordonnée par Vrac Québec.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
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

          {/* Maillage interne — accès direct aux pages de contenu et parcours (SEO + navigation). */}
          <nav
            aria-labelledby="liens-utiles-title"
            className="mt-16 sm:mt-20 max-w-4xl mx-auto text-center"
          >
            <h2
              id="liens-utiles-title"
              className="text-sm font-display font-bold uppercase tracking-wide text-muted-foreground"
            >
              Ressources Vrac Québec
            </h2>
            <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {[
                { href: "/materiaux", label: "Catalogue de matériaux en vrac" },
                { href: "/remblai", label: "Remblai pour remplir un terrain" },
                { href: "/depot-materiaux", label: "Trouver une dompe" },
                { href: "/obtenir-des-soumissions", label: "Obtenir des soumissions" },
                { href: "/place-de-marche", label: "Réseau d'entreprises partenaires" },
                { href: "/soumission", label: "Estimation de livraison" },
                { href: "/calculateur", label: "Calculateur de quantité" },
                { href: "/types-de-camions", label: "Types de camions" },
                { href: "/livraison", label: "Secteurs desservis" },
                { href: "/blog", label: "Guides et conseils" },
              ].map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 font-body text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* Secteurs les plus demandés — envoie de l'autorité vers les pages locales existantes. */}
            <h2 className="mt-10 text-sm font-display font-bold uppercase tracking-wide text-muted-foreground">
              Livraison par secteur
            </h2>
            <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {[
                { href: "/livraison/quebec", label: "Matériaux en vrac à Québec" },
                { href: "/pierre-concassee-beauport", label: "Pierre concassée à Beauport" },
                { href: "/pierre-concassee-levis", label: "Pierre concassée à Lévis" },
                { href: "/gravier-0-3-4-beaupre", label: "Gravier 0-3/4 à Beaupré" },
                { href: "/livraison-pierre-portneuf", label: "Livraison de pierre à Portneuf" },
                { href: "/livraison/charlesbourg", label: "Livraison à Charlesbourg" },
                { href: "/livraison/sainte-foy", label: "Livraison à Sainte-Foy" },
                { href: "/livraison/stoneham-et-tewkesbury", label: "Livraison à Stoneham" },
              ].map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 font-body text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
      <Suspense fallback={null}><SiteAssistant /></Suspense>

      {/* Floating mobile contact bar.
          pointer-events-none on the wrapper + pointer-events-auto on each link
          ensures only the buttons themselves capture taps — the surrounding gaps
          let the user interact with the questionnaire underneath. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden">
        <div className="no-scrollbar pointer-events-auto flex gap-1.5 overflow-x-auto">
          <a
            href="tel:+18195923495"
            className="flex min-h-11 min-w-[6.5rem] shrink-0 flex-col items-center justify-center rounded-full bg-primary px-3 py-1.5 font-display text-[11px] font-semibold leading-tight text-primary-foreground shadow-lg"
          >
            <span>📞 Appeler</span>
            <span className="text-[9px] opacity-90">Québec / Lévis</span>
          </a>
          <a
            href="sms:18195923495?body=Bonjour%2C%20j%27aimerais%20avoir%20une%20soumission%20pour%20du%20mat%C3%A9riel%20en%20vrac."
            className="flex min-h-11 min-w-[6.5rem] shrink-0 flex-col items-center justify-center rounded-full bg-foreground px-3 py-1.5 font-display text-[11px] font-semibold leading-tight text-background shadow-lg"
          >
            <span>💬 Texto</span>
            <span className="text-[9px] opacity-80">Réponse rapide</span>
          </a>
          <a
            href="#questionnaire"
            className="flex min-h-11 min-w-[6.5rem] shrink-0 flex-col items-center justify-center rounded-full bg-primary px-3 py-1.5 font-display text-[11px] font-semibold leading-tight text-primary-foreground shadow-lg"
          >
            <span>📝 Demande</span>
            <span className="text-[9px] opacity-90">En 60 secondes</span>
          </a>
        <a
          href="tel:+18195923495"
          className="flex min-h-11 min-w-[11rem] shrink-0 items-center justify-center gap-1 rounded-full border border-border bg-card px-3 py-2 font-display text-[11px] font-semibold text-foreground shadow-lg"
        >
          📞 Répartition · 819-592-3495
        </a>
        <a
          href="https://wa.me/18195923495?text=Bonjour%2C%20j%27aimerais%20avoir%20une%20soumission%20pour%20du%20mat%C3%A9riel%20en%20vrac."
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 min-w-[7rem] shrink-0 items-center justify-center gap-1 rounded-full bg-primary px-3 py-2 font-display text-xs font-semibold text-primary-foreground shadow-lg"
        >
          🟢 WhatsApp
        </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8 pb-24 md:pb-8">
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
