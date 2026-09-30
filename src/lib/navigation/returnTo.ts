// NAV-01 — Retour au travail après une reconnexion.
// On mémorise la dernière page privée consultée (chemin interne + recherche) et le compte
// qui la consultait. Après connexion, on n'y renvoie que le MÊME compte, pour une adresse
// interne validée et récente. Aucune donnée privée n'est stockée ici : seulement le chemin
// (les brouillons eux-mêmes restent rangés par compte et entreprise dans draftStore).
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const KEY = "vq.returnTo";
const MAX_AGE_MS = 24 * 3600 * 1000;
const PRIVATE = /^\/(admin|entrepreneur|espace|crm|mon-|mes-|notifications|chauffeur|portail|partenaire)/;

type ReturnTo = { path: string; uid: string | null; at: number };

export function isSafeInternalPath(p: unknown): p is string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\")
    && !/^\/(login|forgot-password|reset-password)/.test(p);
}

export function readReturnTo(): ReturnTo | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || "null") as ReturnTo | null;
    if (!r || !isSafeInternalPath(r.path) || Date.now() - r.at > MAX_AGE_MS) return null;
    return r;
  } catch { return null; }
}
export function clearReturnTo() {
  try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch { /* ignore */ }
}
function save(r: ReturnTo) {
  try { const s = JSON.stringify(r); sessionStorage.setItem(KEY, s); localStorage.setItem(KEY, s); } catch { /* ignore */ }
}

/**
 * Destination après connexion pour `uid`. Même compte → page de travail; autre compte →
 * rien (le travail de l'autre compte n'est jamais repris) et `otherAccount` = true.
 */
export function consumeReturnTo(uid: string): { path: string | null; otherAccount: boolean } {
  const r = readReturnTo();
  clearReturnTo();
  if (!r) return { path: null, otherAccount: false };
  if (r.uid && r.uid !== uid) return { path: null, otherAccount: true };
  return { path: r.path, otherAccount: false };
}

/** Monté une fois dans le routeur : suit la dernière page privée et le compte courant. */
export function ReturnToTracker() {
  const loc = useLocation();
  const uid = useRef<string | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { uid.current = data.session?.user.id ?? null; });
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === "SIGNED_OUT") {
        // Déconnexion volontaire : on n'emmène pas la page privée vers une autre session.
        if (sessionStorage.getItem("vq.voluntarySignOut") === "1") { clearReturnTo(); sessionStorage.removeItem("vq.voluntarySignOut"); }
      }
      if (s?.user) uid.current = s.user.id;
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const path = loc.pathname + loc.search;
    if (loc.pathname === "/login") {
      if (last.current && sessionStorage.getItem("vq.voluntarySignOut") !== "1") save({ path: last.current, uid: uid.current, at: Date.now() });
      return;
    }
    if (PRIVATE.test(loc.pathname)) last.current = path;
  }, [loc.pathname, loc.search]);
  return null;
}

/** À appeler avant une déconnexion demandée par l'utilisateur. */
export function markVoluntarySignOut() {
  try { sessionStorage.setItem("vq.voluntarySignOut", "1"); clearReturnTo(); } catch { /* ignore */ }
}
