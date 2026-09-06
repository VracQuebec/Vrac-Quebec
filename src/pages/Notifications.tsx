// ============================================================
// CENTRE D'AVIS — page autonome accessible depuis les courriels
// (« Voir dans mon espace ») et depuis les espaces client/partenaire.
// ============================================================
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";

import FullPageState from "@/components/FullPageState";
import NotificationsPanel from "@/components/marketplace/NotificationsPanel";
import { useAuthReady } from "@/hooks/useAuthReady";

const Notifications = () => {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const [audience, setAudience] = useState<"client" | "partenaire">("client");

  useEffect(() => {
    if (isReady && !user) navigate("/login", { replace: true });
  }, [isReady, user, navigate]);

  if (!isReady) {
    return <FullPageState title="Chargement" message="Vos avis arrivent…" />;
  }

  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <title>Mes avis | Vrac Québec</title>
        <meta name="description" content="Consultez vos avis Vrac Québec et choisissez comment vous souhaitez être averti." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <UniversalNav />
      <section className="container mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
            <Bell className="h-6 w-6 text-primary" aria-hidden /> Mes avis
          </h1>
          <div className="flex rounded-xl border border-border p-1">
            {(["client", "partenaire"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className={`rounded-lg px-3 py-1.5 font-body text-sm ${
                  audience === a ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {a === "client" ? "Mes projets" : "Mon entreprise"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Suivez les nouvelles soumissions, les rappels et les confirmations. Vous choisissez ce que
          vous recevez par courriel.
        </p>
        <div className="mt-6">
          <NotificationsPanel userId={user?.id ?? null} audience={audience} />
        </div>
      </section>
    </main>
  );
};

export default Notifications;
