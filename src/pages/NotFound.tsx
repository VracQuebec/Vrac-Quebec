import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import TransportBanner from "@/components/TransportBanner";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <Helmet>
        <title>Page introuvable (404) | Vrac Québec</title>
        <meta name="description" content="Cette page n'existe pas ou a été déplacée. Retournez à l'accueil de Vrac Québec ou trouvez une dompe près de votre chantier." />
        <meta name="robots" content="noindex, follow" />
        <meta property="og:title" content="Page introuvable (404) | Vrac Québec" />
      </Helmet>
      <TransportBanner />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="mb-3 text-5xl font-bold">404</h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Cette page n'existe pas ou a été déplacée.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="/" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold">
              Retour à l'accueil
            </a>
            <a href="/depot-materiaux" className="px-5 py-2.5 rounded-xl border border-border bg-card font-semibold">
              Trouver une dompe
            </a>
            <a href="/remblai" className="px-5 py-2.5 rounded-xl border border-border bg-card font-semibold">
              Obtenir du remblai
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
