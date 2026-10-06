// Carte discrète invitant l'entrepreneur à ajouter Vrac Québec
// à son écran d'accueil. Aucune donnée métier n'est touchée.
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Download, Share, X, Smartphone } from "lucide-react";
import { useInstallApp } from "@/hooks/useInstallApp";

export default function InstallAppCard() {
  const { device, canInstallNatively, shouldInvite, install, dismiss } = useInstallApp();
  const [showSteps, setShowSteps] = useState(false);

  if (!shouldInvite) return null;

  const steps =
    device === "ios" ? (
      <ol className="mt-3 space-y-1.5 font-body text-xs text-muted-foreground">
        <li className="flex gap-2">
          <span className="font-bold text-primary">1.</span>
          <span className="inline-flex items-center gap-1">
            Touchez le bouton Partager <Share className="inline h-3.5 w-3.5" aria-hidden /> de Safari.
          </span>
        </li>
        <li className="flex gap-2"><span className="font-bold text-primary">2.</span> Sélectionnez « Sur l'écran d'accueil ».</li>
        <li className="flex gap-2"><span className="font-bold text-primary">3.</span> Touchez « Ajouter ».</li>
      </ol>
    ) : (
      <p className="mt-3 font-body text-xs text-muted-foreground">
        Ouvrez le menu de votre navigateur, puis sélectionnez « Ajouter à l'écran d'accueil »
        ou « Installer l'application ».
      </p>
    );

  return (
    <section
      aria-label="Ajouter Vrac Québec à votre écran d'accueil"
      className="relative border-t border-border py-3"
    >
      <Button variant="ghost"
        onClick={dismiss}
        aria-label="Fermer cette invitation"
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="flex items-start gap-3 pr-9">
        <span className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
          <Smartphone className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-sm font-bold">Installer Vrac Québec</h2>
          <p className="mt-0.5 font-body text-xs text-muted-foreground">
            Vrac Québec sur votre écran d’accueil.
          </p>
        </div>
      </div>

      {showSteps && steps}

      <div className="mt-2 flex flex-wrap gap-2">
        {canInstallNatively ? (
          <Button variant="ghost"
            onClick={() => void install()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-secondary px-3 font-display text-sm font-semibold text-foreground active:scale-[0.99]"
          >
            <Download className="h-4 w-4" /> Installer Vrac Québec
          </Button>
        ) : (
          <Button variant="ghost"
            onClick={() => setShowSteps((v) => !v)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-secondary px-3 font-display text-sm font-semibold text-foreground active:scale-[0.99]"
          >
            <Download className="h-4 w-4" /> {showSteps ? "Masquer les étapes" : "Ajouter à l'écran d'accueil"}
          </Button>
        )}
        <Button variant="ghost"
          onClick={dismiss}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-display text-sm font-semibold text-muted-foreground active:scale-[0.99]"
        >
          Plus tard
        </Button>
      </div>
    </section>
  );
}
