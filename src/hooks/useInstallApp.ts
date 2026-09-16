// ============================================================
// Ajout à l'écran d'accueil : détection de l'appareil, du mode
// déjà installé, et du mécanisme d'installation natif lorsqu'il existe.
// Aucune donnée métier n'est touchée : uniquement l'affichage.
// ============================================================
import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type DeviceKind = "ios" | "android" | "desktop";

const DISMISS_KEY = "vq_install_invite_dismissed";
const INSTALLED_KEY = "vq_install_done";

export function detectDevice(ua: string, maxTouchPoints = 0): DeviceKind {
  const s = ua.toLowerCase();
  const iPadOS = /macintosh/.test(s) && maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(s) || iPadOS) return "ios";
  if (/android/.test(s)) return "android";
  return "desktop";
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    nav.standalone === true
  );
}

export function useInstallApp() {
  const [device, setDevice] = useState<DeviceKind>("desktop");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDevice(detectDevice(navigator.userAgent, navigator.maxTouchPoints));
    setInstalled(isStandaloneDisplay());
    try {
      setDismissed(
        localStorage.getItem(DISMISS_KEY) === "1" || localStorage.getItem(INSTALLED_KEY) === "1",
      );
    } catch {
      /* stockage indisponible : on affiche normalement */
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* noop */ }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return "unavailable" as const;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setPromptEvent(null);
    if (outcome === "accepted") {
      setInstalled(true);
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* noop */ }
    }
    return outcome;
  }, [promptEvent]);

  // Invitation réservée au tactile (téléphone / tablette), jamais sur ordinateur,
  // jamais si déjà installée ou déjà refusée.
  const canInstallNatively = promptEvent !== null;
  const shouldInvite = !installed && !dismissed && (device !== "desktop" || canInstallNatively);

  return { device, installed, dismissed, canInstallNatively, shouldInvite, install, dismiss };
}
