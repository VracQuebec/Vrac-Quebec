// NAV-01B — Contexte des listes (recherche, filtres, tri, page, défilement), mécanisme commun.
// Rangé en mémoire de l'onglet (sessionStorage) : survit à fiche → Retour et à l'actualisation,
// jamais dans l'adresse (aucune recherche personnelle dans l'URL, aucune entrée d'historique à la frappe).
// Clé séparée par compte, entreprise et liste : un autre compte ou une autre entreprise ne retrouve rien.
import { useCallback, useEffect, useRef, useState } from "react";

export type ListCtxId = { owner: string; company: string | null; list: string };

export const listCtxKey = (id: ListCtxId) => `vq.list.${id.owner}.${id.company ?? "-"}.${id.list}`;

export function readListCtx<T>(id: ListCtxId): T | null {
  try { const r = sessionStorage.getItem(listCtxKey(id)); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
}
export function writeListCtx<T>(id: ListCtxId, v: T) {
  try { sessionStorage.setItem(listCtxKey(id), JSON.stringify(v)); } catch { /* ignore */ }
}

/** État de liste persistant. `sanitize` écarte une valeur stockée devenue invalide. `ready` = contexte relu. */
export function useListContext<T extends object>(id: ListCtxId | null, initial: T, sanitize?: (v: unknown) => T | null) {
  const key = id ? listCtxKey(id) : null;
  const [value, setValue] = useState<T>(() => (id ? (sanitize ? sanitize(readListCtx(id)) : readListCtx<T>(id)) ?? initial : initial));
  const [readyKey, setReadyKey] = useState<string | null>(key);
  const initRef = useRef(initial); initRef.current = initial;
  useEffect(() => {
    if (!id || key === readyKey) return;
    const s = readListCtx(id);
    setValue((sanitize ? sanitize(s) : (s as T | null)) ?? initRef.current);
    setReadyKey(key);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((u: Partial<T> | ((p: T) => T)) => {
    setValue((p) => {
      const n = typeof u === "function" ? u(p) : { ...p, ...u };
      if (id) writeListCtx(id, { ...(readListCtx<object>(id) ?? {}), ...n });
      return n;
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, set, !!id && readyKey === key] as const;
}

/**
 * Défilement de la fenêtre : mémorisé pendant la consultation, rétabli une fois quand `ready`
 * (données affichées). `paused` = fiche ouverte par-dessus la liste (on ne mémorise pas).
 */
export function useListScroll(id: ListCtxId | null, ready: boolean, paused = false) {
  const key = id ? listCtxKey(id) + ".y" : null;
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!key || paused) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const h = () => { clearTimeout(t); t = setTimeout(() => { try { sessionStorage.setItem(key, String(Math.round(window.scrollY))); } catch { /* ignore */ } }, 120); };
    window.addEventListener("scroll", h, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener("scroll", h); };
  }, [key, paused]);
  useEffect(() => {
    if (!key || !ready || done.current === key) return;
    done.current = key;
    const y = Number(sessionStorage.getItem(key) ?? 0);
    if (!(y > 0)) return;
    let n = 0;
    const tick = () => { // la liste peut grandir en plusieurs rendus : on réessaie brièvement
      window.scrollTo(0, y);
      if (Math.abs(window.scrollY - y) > 4 && n++ < 20) setTimeout(tick, 75);
    };
    requestAnimationFrame(tick);
  }, [key, ready]);
}
