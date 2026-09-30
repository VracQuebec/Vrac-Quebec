// NAV-01 / NAV-01B — Adaptateur de formulaire.
// Ordre : propriétaire établi → lecture (serveur puis appareil) → restauration → activation.
// Écriture locale pendant la saisie (≈400 ms après une pause, 2 s au plus), puis transmission
// au compte pour un utilisateur connecté (≈1,5 s). Version serveur contrôlée : un conflit garde
// les deux copies; une écriture tardive après finalisation/abandon est refusée par le serveur.
import { useCallback, useEffect, useRef, useState } from "react";
import { discardDraft, draftKey, keepConflictCopy, patchMeta, readDraft, writeDraft, type DraftIdentity, type DraftMeta } from "./draftStore";
import {
  closeServerDraft, fetchServerDraft, flushCloseQueue, isCloseQueued, isSynced, queueClose, reopenServerDraft,
  saveServerDraft, type DraftSyncError, type ServerDraft,
} from "./serverSync";

export type DraftStatus = "idle" | "dirty" | "saved_local" | "error" | "restored" | "finalized";
/** local = cet appareil seulement; pending = transmission en attente; synced = enregistré au compte. */
export type SyncStatus = "local" | "pending" | "synced" | "conflict" | "closed" | "denied";

const PAUSE_MS = 400;
const MAX_MS = 2000;
const PUSH_MS = 1500;
const SERVER_WAIT_MS = 4000;

export function useDraft<T>(opts: {
  id: DraftIdentity | null;        // null tant que le propriétaire n'est pas établi
  data: T;                         // valeurs déclarées par le formulaire (jamais de secret)
  isEmpty: (d: T) => boolean;      // un formulaire vierge n'écrase jamais un brouillon existant
  onRestore: (d: T, meta: DraftMeta) => void;
  label?: (d: T) => string;
  step?: (d: T) => number | null;  // étape pertinente (affichée dans « Reprendre mon travail »)
  route?: string;                  // adresse interne pour reprendre ce formulaire
}) {
  const { id, data, isEmpty, onRestore, label } = opts;
  const key = id ? draftKey(id) : null;
  const synced = isSynced(id);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [sync, setSync] = useState<SyncStatus>("local");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [restoredMeta, setRestoredMeta] = useState<DraftMeta | null>(null);
  const [conflict, setConflict] = useState<ServerDraft | null>(null);
  const [ready, setReady] = useState(false);
  const armed = useRef(false);
  const finalized = useRef(false);
  const meta = useRef<DraftMeta | null>(null);
  const latest = useRef(data); latest.current = data;
  const lastWritten = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushing = useRef(false);
  const firstPending = useRef<number | null>(null);
  const idRef = useRef(id); idRef.current = id;
  const cb = useRef({ isEmpty, onRestore, label, step: opts.step, route: opts.route });
  cb.current = { isEmpty, onRestore, label, step: opts.step, route: opts.route };

  // ---------- Transmission au compte ----------
  const push = useCallback(async () => {
    const cid = idRef.current;
    if (!cid || !synced || !key || finalized.current || pushing.current) return;
    const rec = readDraft<T>(key);
    if (!rec || !rec.meta.unsynced || rec.meta.recovery) return; // copie de récupération : jamais transmise sans action explicite
    if (isCloseQueued(cid.owner, cid)) return;
    pushing.current = true; setSync("pending");
    const extra = { label: rec.meta.label, route: cb.current.route ?? rec.meta.route ?? undefined, step: rec.meta.step ?? null };
    try {
      let res;
      try { res = await saveServerDraft(cid, rec.meta.serverRev ?? null, rec.data, extra); }
      catch (e) {
        // Clé close par une création précédente terminée : une NOUVELLE saisie (jamais synchronisée) repart proprement.
        if ((e as DraftSyncError).kind === "closed" && rec.meta.serverRev == null) { await reopenServerDraft(cid); res = await saveServerDraft(cid, null, rec.data, extra); }
        else throw e;
      }
      if (finalized.current) return;
      const cur = readDraft<T>(key);
      // Rien n'a changé pendant l'envoi → copie synchronisée; sinon on renverra la suite.
      const same = cur && JSON.stringify(cur.data) === JSON.stringify(rec.data);
      const m = patchMeta(key, { serverRev: res.rev, unsynced: !same });
      if (m) meta.current = m;
      setSync(same ? "synced" : "pending");
      if (!same) pushTimer.current = setTimeout(() => void push(), PUSH_MS);
    } catch (e) {
      const k = (e as DraftSyncError).kind;
      if (k === "offline" || k === "other") setSync("pending");
      else if (k === "denied") setSync("denied");
      else if (k === "closed") {
        // Clos ailleurs : la saisie de cet onglet reste affichée et gardée sur l'appareil (non synchronisée);
        // elle ne sera reprise au compte QUE sur action explicite (« Reprendre dans un nouveau brouillon »).
        // La saisie continue d'être enregistrée localement (copie de récupération distincte), jamais réactivée automatiquement.
        const m = patchMeta(key, { serverRev: null, unsynced: true, recovery: true }); if (m) meta.current = m; setSync("closed");
      }
      else if (k === "conflict") {
        try { const srv = await fetchServerDraft(cid); if (srv) { keepConflictCopy(key, srv.data, "serveur"); setConflict(srv); } } catch { /* reste en attente */ }
        setSync("conflict");
      }
    } finally { pushing.current = false; }
  }, [key, synced]);

  const schedulePush = useCallback(() => {
    if (!synced) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void push(), PUSH_MS);
  }, [push, synced]);

  const flush = useCallback(() => {
    const cid = idRef.current;
    if (!cid || !armed.current || finalized.current) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    firstPending.current = null;
    const d = latest.current; const s = JSON.stringify(d);
    if (s === lastWritten.current) return;
    if (!meta.current && cb.current.isEmpty(d)) return;
    const m = writeDraft(cid, d, meta.current, cb.current.label?.(d), { unsynced: synced ? true : undefined, step: cb.current.step?.(d) ?? null, route: cb.current.route ?? null });
    if (!m) { setStatus("error"); return; }
    meta.current = m; lastWritten.current = s; setSavedAt(m.updatedAt); setStatus("saved_local");
    if (synced && !m.recovery) { setSync((x) => (x === "conflict" || x === "denied" ? x : "pending")); schedulePush(); }
  }, [synced, schedulePush]);

  // ---------- Lecture et restauration ----------
  useEffect(() => {
    armed.current = false; finalized.current = false; meta.current = null; lastWritten.current = "";
    setStatus("idle"); setRestoredMeta(null); setSavedAt(null); setConflict(null); setSync("local"); setReady(false);
    if (!key || !id) return;
    let cancelled = false;
    const apply = (rec: { data: T; meta: DraftMeta }) => {
      meta.current = rec.meta; lastWritten.current = JSON.stringify(rec.data);
      cb.current.onRestore(rec.data, rec.meta);
      setRestoredMeta(rec.meta); setSavedAt(rec.meta.updatedAt); setStatus("restored");
    };
    const activate = () => setTimeout(() => { if (!cancelled) { armed.current = true; setReady(true); } }, 0);
    const local = readDraft<T>(key);

    if (!synced) { if (local) apply(local); const t = activate(); return () => { cancelled = true; clearTimeout(t); }; }

    void flushCloseQueue(id.owner);
    // Copie de récupération (brouillon clos ailleurs) : restaurée telle quelle, jamais resynchronisée automatiquement.
    if (local?.meta.recovery) { apply(local); setSync("closed"); const t = activate(); return () => { cancelled = true; clearTimeout(t); }; }
    const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), SERVER_WAIT_MS));
    Promise.race([fetchServerDraft(id), timeout]).then((srv) => {
      if (cancelled) return;
      if (srv === "timeout") { if (local) apply(local); setSync(local?.meta.unsynced ? "pending" : local ? "synced" : "local"); if (local?.meta.unsynced) schedulePush(); return; }
      if (srv && srv.status !== "active") {
        // Clos ailleurs (finalisé/abandonné) : une copie locale déjà synchronisée est périmée → supprimée.
        if (local && local.meta.serverRev != null) { discardDraft(key); setSync("closed"); return; }
        if (local) { apply(local); setSync("pending"); schedulePush(); }
        return;
      }
      if (!srv) {
        if (local && local.meta.serverRev != null && !local.meta.unsynced) { discardDraft(key); return; } // supprimé côté compte
        if (local) { apply(local); patchMeta(key, { unsynced: true }); setSync("pending"); schedulePush(); }
        return;
      }
      // Serveur actif
      const localRev = local?.meta.serverRev ?? null;
      if (!local || (!local.meta.unsynced && (localRev == null || srv.rev > localRev))) {
        const m = writeDraft(id, srv.data as T, local?.meta ?? null, srv.label ?? undefined, { serverRev: srv.rev, unsynced: false, step: srv.step, route: srv.route });
        apply({ data: srv.data as T, meta: m ?? ({ ...id, key, serverRev: srv.rev } as DraftMeta) });
        setSync("synced"); return;
      }
      apply(local);
      if (localRev === srv.rev) { setSync(local.meta.unsynced ? "pending" : "synced"); if (local.meta.unsynced) schedulePush(); return; }
      // Les deux copies ont changé : on garde les deux, la personne choisit.
      keepConflictCopy(key, srv.data, "serveur"); setConflict(srv); setSync("conflict");
    }).catch((e: DraftSyncError) => {
      if (cancelled) return;
      if (e.kind === "denied") { setSync("denied"); return; } // accès retiré : rien n'est restauré
      if (local) apply(local);
      setSync(local ? "pending" : "local");
    }).finally(() => { if (!cancelled) activate(); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const serialized = JSON.stringify(data);
  useEffect(() => {
    if (!armed.current || finalized.current || serialized === lastWritten.current) return;
    if (!meta.current && cb.current.isEmpty(data)) { if (timer.current) clearTimeout(timer.current); firstPending.current = null; setStatus("idle"); return; }
    setStatus("dirty");
    if (firstPending.current == null) firstPending.current = Date.now();
    const wait = Math.max(0, Math.min(PAUSE_MS, MAX_MS - (Date.now() - firstPending.current)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, wait);
  }, [serialized, flush]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    const onOnline = () => { if (idRef.current && synced) { void flushCloseQueue(idRef.current.owner); void push(); } };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); window.removeEventListener("online", onOnline);
      flush();
    };
  }, [flush, push, synced]);

  const close = useCallback((st: "finalized" | "discarded") => {
    if (timer.current) clearTimeout(timer.current);
    if (pushTimer.current) clearTimeout(pushTimer.current);
    const cid = idRef.current;
    if (key) discardDraft(key);
    if (cid && synced) {
      // Transmise tout de suite; mise en file si hors ligne (bloque toute réécriture tardive).
      queueClose({ owner: cid.owner, id: cid, status: st });
      void flushCloseQueue(cid.owner);
    }
  }, [key, synced]);

  /** Opération métier CONFIRMÉE : le brouillon disparaît et ne peut plus être recréé. */
  const finalize = useCallback(() => {
    finalized.current = true; close("finalized"); meta.current = null; setStatus("finalized"); setSync("local");
  }, [close]);

  /** « Abandonner le brouillon » : action explicite, distincte d'une simple sortie. */
  const discard = useCallback(() => {
    close("discarded");
    meta.current = null; lastWritten.current = ""; setRestoredMeta(null); setSavedAt(null); setStatus("idle"); setSync("local"); setConflict(null);
  }, [close]);

  /** Conflit : reprendre la version du compte (la copie locale reste gardée à part). */
  const useServerVersion = useCallback(() => {
    const cid = idRef.current;
    if (!conflict || !key || !cid) return;
    const loc = readDraft<T>(key); if (loc) keepConflictCopy(key, loc.data, "local");
    const m = writeDraft(cid, conflict.data as T, null, conflict.label ?? undefined, { serverRev: conflict.rev, unsynced: false });
    if (m) { meta.current = m; lastWritten.current = JSON.stringify(conflict.data); cb.current.onRestore(conflict.data as T, m); }
    setConflict(null); setSync("synced");
  }, [conflict, key]);

  /** Conflit : garder la version de cet appareil (elle remplace celle du compte, l'autre reste gardée). */
  const keepLocalVersion = useCallback(() => {
    if (!conflict || !key) return;
    const m = patchMeta(key, { serverRev: conflict.rev, unsynced: true }); if (m) meta.current = m;
    setConflict(null); setSync("pending"); void push();
  }, [conflict, key, push]);

  /** Après clôture ailleurs : reprendre la saisie affichée comme NOUVEAU brouillon (action explicite). */
  const restartAsNew = useCallback(async () => {
    const cid = idRef.current; if (!cid || !key) return;
    try { await reopenServerDraft(cid); } catch { /* hors ligne : la transmission suivante réessaiera */ }
    finalized.current = false;
    const m = writeDraft(cid, latest.current, null, cb.current.label?.(latest.current), { serverRev: null, unsynced: true, recovery: false, step: cb.current.step?.(latest.current) ?? null, route: cb.current.route ?? null });
    if (m) { meta.current = m; lastWritten.current = JSON.stringify(latest.current); setSavedAt(m.updatedAt); setStatus("saved_local"); }
    setSync("pending"); void push();
  }, [key, push]);

  return { restartAsNew, status, sync, synced, savedAt, restoredMeta, ready, conflict, flush, finalize, discard, useServerVersion, keepLocalVersion };
}
