import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";
import { startRdsOutbox } from "@/lib/fleet/rdsOutbox";

startRdsOutbox(supabase);

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
