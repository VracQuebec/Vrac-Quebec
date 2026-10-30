import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";
import { isolatedSearch } from "@/lib/entrepreneur/search-runtime";
import {isExec04Local} from "@/lib/marketplace/communications";
import {isHelpLocal} from "@/lib/help/progress";
import {isPunchLocal} from "@/lib/punch/runtime";
import {isExec05Local} from "@/lib/finances/exec05";
import { startRdsOutbox } from "@/lib/fleet/rdsOutbox";
import { privateTelemetryBlocked } from '@/lib/analytics/privacy';
import { startVisibleViewport } from '@/lib/navigation/visibleViewport';

startVisibleViewport();

// EXEC-01 isolation: visiting a fictitious dossier must not flush a real outbox.
const personalFollowup = privateTelemetryBlocked() || isolatedSearch() || isExec04Local() || isHelpLocal() || isPunchLocal() || isExec05Local();
if (!personalFollowup) startRdsOutbox(supabase);
if (personalFollowup) {
  (window as unknown as Record<string, unknown>)["ga-disable-G-T6HYZVY8E0"] = true;
}

// Le service worker existant sert aussi de point d'installation PWA.
// Il ne met aucune page en cache et ne change donc aucun comportement métier.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => undefined);
  });
}

// Auto-reload once when a lazy chunk fails to load (usually after a redeploy
// invalidates hashed asset filenames). Guarded by sessionStorage to avoid loops.
const CHUNK_RELOAD_KEY = "__chunk_reload_attempted__";
function looksLikeChunkError(msg: string): boolean {
  return (
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}
function maybeReloadOnChunkError(msg: string) {
  if (!looksLikeChunkError(msg)) return;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch { /* noop */ }
  window.location.reload();
}
// Une fois l'application stable, on réarme la reprise : un prochain déploiement
// dans le même onglet pourra encore recharger une fois au lieu de rester bloqué.
window.setTimeout(() => { try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* noop */ } }, 15000);
window.addEventListener("error", (e) => {
  maybeReloadOnChunkError(e?.message ?? "");
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = (e as PromiseRejectionEvent)?.reason;
  const msg = reason?.message ?? String(reason ?? "");
  maybeReloadOnChunkError(msg);
});

const root = document.getElementById("root");
if (!root) throw new Error("Élément racine introuvable");
createRoot(root).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
