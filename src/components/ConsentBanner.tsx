import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { OPEN_SETTINGS_EVENT, applyConsent, readConsent, saveConsent } from "@/lib/analytics/consent";
import { isPrivateAnalyticsPath } from "@/lib/analytics/ga4";

/** Bandeau Loi 25 : refuser aussi simple qu'accepter; choix modifiable via « Témoins ». */
export default function ConsentBanner() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    applyConsent();
    if (!readConsent()) setOpen(true);
    const onOpen = () => { setAnalytics(readConsent()?.analytics ?? false); setCustom(true); setOpen(true); };
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, []);

  // Espaces privés : aucune mesure, donc pas de bandeau (sauf ouverture volontaire).
  if (!open || (isPrivateAnalyticsPath(pathname) && !custom)) return null;
  const decide = (v: boolean) => { saveConsent(v); setOpen(false); setCustom(false); };

  return (
    <div role="dialog" aria-modal="false" aria-labelledby="vq-consent-title"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card px-4 py-4 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md sm:rounded-xl sm:border">
      <h2 id="vq-consent-title" className="font-display text-base font-bold text-foreground">Témoins et mesure d'audience</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Les témoins essentiels gardent votre session et vos saisies. Avec votre accord, Google Analytics mesure
        les pages publiques visitées, sans vos coordonnées ni vos dossiers. Aucun témoin publicitaire.{" "}
        <Link to="/confidentialite" className="underline">Politique de confidentialité</Link>
      </p>
      {custom && (
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span><strong>Essentiels</strong> — session, brouillons, ce choix</span>
            <span className="text-muted-foreground">Toujours actifs</span>
          </div>
          <label className="flex items-center justify-between gap-3">
            <span><strong>Mesure d'audience</strong> — Google Analytics</span>
            <Switch checked={analytics} onCheckedChange={setAnalytics} aria-label="Mesure d'audience" />
          </label>
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <span><strong>Publicité</strong></span><span>Non utilisée</span>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => decide(false)}>Refuser</Button>
        {custom
          ? <Button variant="outline" onClick={() => decide(analytics)}>Enregistrer mon choix</Button>
          : <Button variant="outline" onClick={() => { setAnalytics(readConsent()?.analytics ?? false); setCustom(true); }}>Personnaliser</Button>}
        <Button onClick={() => decide(true)}>Accepter</Button>
      </div>
    </div>
  );
}
