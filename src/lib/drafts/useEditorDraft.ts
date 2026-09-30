// NAV-01B — Raccord des éditeurs « objet en cours ou null » (administration) au mécanisme commun useDraft.
// La préparation survit à « Annuler », au Retour, à l'actualisation et à la reprise depuis « Reprendre mon travail ».
// Rien n'est enregistré au serveur : seule la page appelle ses propres fonctions après un bouton explicite,
// puis `finalize()` après succès confirmé. Ouvrir une autre fiche ne remplace jamais silencieusement une préparation.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDraft } from "./useDraft";

export function useEditorDraft<T extends object>(opts: {
  form: string; value: T | null; setValue: (v: T | null) => void; label: (v: T) => string; route: string;
  company?: string | null; enabled?: boolean; module?: string;
}) {
  const { user } = useAuthReady();
  const [held, setHeld] = useState<T | null>(null);
  const baseRef = useRef<string | null>(null);
  useEffect(() => { if (opts.value) setHeld(opts.value); }, [opts.value]);
  const store = useDraft<T | Record<string, never>>({
    id: user && opts.enabled !== false ? { module: opts.module ?? "admin", form: opts.form, owner: user.id, company: opts.company ?? null, recordId: "editeur" } : null,
    data: held ?? {},
    label: (d) => (d && Object.keys(d).length ? opts.label(d as T) : "Préparation"),
    route: opts.route,
    isEmpty: (d) => !d || !Object.keys(d).length || JSON.stringify(d) === baseRef.current,
    onRestore: (d) => { if (d && Object.keys(d).length) { setHeld(d as T); opts.setValue(d as T); } },
  });
  const dirty = !!held && JSON.stringify(held) !== baseRef.current;
  /** Ouvre une fiche; si une autre préparation modifiée existe, demande avant de la remplacer. */
  const open = useCallback((v: T) => {
    if (held && JSON.stringify(held) !== baseRef.current && JSON.stringify(held) !== JSON.stringify(v)) {
      if (!window.confirm(`Une préparation non enregistrée existe (« ${opts.label(held)} »). La remplacer par cette fiche ?\nAnnuler rouvre la préparation en cours.`)) { opts.setValue(held); return; }
      store.discard();
    }
    baseRef.current = JSON.stringify(v); setHeld(v); opts.setValue(v);
  }, [held, opts, store]);
  const finalize = useCallback(() => { store.finalize(); baseRef.current = null; setHeld(null); }, [store]);
  const discard = useCallback(() => { store.discard(); baseRef.current = null; setHeld(null); opts.setValue(null); }, [store, opts]);
  /** « Annuler » : ferme l'éditeur sans effacer la préparation (reprise possible). */
  const close = useCallback(() => opts.setValue(null), [opts]);
  const barProps = {
    status: store.status, savedAt: store.savedAt, restored: !!store.restoredMeta, sync: store.sync, synced: store.synced,
    conflict: store.conflict, onUseServer: store.useServerVersion, onKeepLocal: store.keepLocalVersion,
    onRestartAsNew: store.restartAsNew, restartError: store.restartError, onRetry: store.retrySave,
  };
  return { open, close, finalize, discard, barProps, held, dirty, reopen: () => held && opts.setValue(held) };
}
