// NAV-01 — Adaptateur de formulaire : restaurer AVANT d'activer la sauvegarde,
// écrire localement pendant la saisie (≈400 ms après une pause, 2 s au plus en saisie continue),
// écrire aussi à la perte de visibilité, à la fermeture de page et au démontage.
import { useCallback, useEffect, useRef, useState } from "react";
import { discardDraft, draftKey, readDraft, writeDraft, type DraftIdentity, type DraftMeta } from "./draftStore";

export type DraftStatus = "idle" | "dirty" | "saved_local" | "error" | "restored" | "finalized";

const PAUSE_MS = 400;
const MAX_MS = 2000;

export function useDraft<T>(opts: {
  id: DraftIdentity | null;        // null tant que le propriétaire n'est pas établi
  data: T;                         // valeurs déclarées par le formulaire (jamais de secret)
  isEmpty: (d: T) => boolean;      // un formulaire vierge n'écrase jamais un brouillon existant
  onRestore: (d: T, meta: DraftMeta) => void;
  label?: (d: T) => string;
}) {
  const { id, data, isEmpty, onRestore, label } = opts;
  const key = id ? draftKey(id) : null;
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [restoredMeta, setRestoredMeta] = useState<DraftMeta | null>(null);
  const [ready, setReady] = useState(false); // lecture/restauration terminée
  const armed = useRef(false);      // sauvegarde active seulement après la restauration
  const finalized = useRef(false);  // après finalisation/abandon, aucune écriture tardive
  const meta = useRef<DraftMeta | null>(null);
  const latest = useRef(data); latest.current = data;
  const lastWritten = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPending = useRef<number | null>(null);
  const cb = useRef({ isEmpty, onRestore, label }); cb.current = { isEmpty, onRestore, label };

  const flush = useCallback(() => {
    if (!id || !armed.current || finalized.current) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    firstPending.current = null;
    const d = latest.current; const s = JSON.stringify(d);
    if (s === lastWritten.current) return;
    if (!meta.current && cb.current.isEmpty(d)) return;
    const m = writeDraft(id, d, meta.current, cb.current.label?.(d));
    if (!m) { setStatus("error"); return; }
    meta.current = m; lastWritten.current = s; setSavedAt(m.updatedAt); setStatus("saved_local");
  }, [id]);

  // 1) propriétaire établi → 2) lecture → 3) restauration → 4) activation.
  useEffect(() => {
    armed.current = false; finalized.current = false; meta.current = null; lastWritten.current = "";
    setStatus("idle"); setRestoredMeta(null); setSavedAt(null);
    if (!key) return;
    const rec = readDraft<T>(key);
    if (rec) {
      meta.current = rec.meta; lastWritten.current = JSON.stringify(rec.data);
      cb.current.onRestore(rec.data, rec.meta);
      setRestoredMeta(rec.meta); setSavedAt(rec.meta.updatedAt); setStatus("restored");
    }
    // Activation au tour suivant : la restauration a eu le temps d'appliquer ses valeurs.
    const t = setTimeout(() => { armed.current = true; setReady(true); }, 0);
    return () => { clearTimeout(t); setReady(false); };
  }, [key]);

  const serialized = JSON.stringify(data);
  useEffect(() => {
    if (!armed.current || finalized.current || serialized === lastWritten.current) return;
    setStatus("dirty");
    if (firstPending.current == null) firstPending.current = Date.now();
    const wait = Math.max(0, Math.min(PAUSE_MS, MAX_MS - (Date.now() - firstPending.current)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, wait);
  }, [serialized, flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  /** Opération métier confirmée : le brouillon disparaît et ne peut plus être recréé. */
  const finalize = useCallback(() => {
    finalized.current = true; if (timer.current) clearTimeout(timer.current);
    if (key) discardDraft(key); meta.current = null; setStatus("finalized");
  }, [key]);

  /** « Abandonner le brouillon » : action explicite, distincte d'une simple sortie. */
  const discard = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (key) discardDraft(key);
    meta.current = null; lastWritten.current = ""; setRestoredMeta(null); setSavedAt(null); setStatus("idle");
  }, [key]);

  return { status, savedAt, restoredMeta, flush, finalize, discard };
}
