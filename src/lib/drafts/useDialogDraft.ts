// NAV-01B — Raccord des fenêtres « état initialisé à l'ouverture » (flotte, administration…) au mécanisme commun useDraft.
// Aucune écriture métier : seule la saisie est conservée. La fenêtre appelle `base(obj)` quand elle initialise ses champs,
// `finalize()` après un enregistrement confirmé. Retour / fermeture / actualisation ne suppriment rien.
import { useCallback, useRef, useState } from "react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDraft } from "./useDraft";

export function useDialogDraft<T extends Record<string, unknown>>(opts: {
  open: boolean; module: string; form: string; company: string | null; recordId: string | null;
  data: T; setData: (d: T) => void; label: (d: T) => string; route?: string;
  /** Noms de fichiers sélectionnés (jamais le contenu : un fichier local ne survit pas à une actualisation). */
  fileNames?: string[];
  enabled?: boolean;
}) {
  const { user } = useAuthReady();
  const baseRef = useRef<string | null>(null);
  const [lostFiles, setLostFiles] = useState<string[]>([]);
  const base = useCallback(<U extends T>(obj: U): U => { baseRef.current = JSON.stringify(obj); setLostFiles([]); return obj; }, []);
  const on = opts.open && opts.enabled !== false && !!user;
  const store = useDraft<{ v: T; files: string[] }>({
    id: on ? { module: opts.module, form: opts.form, owner: user!.id, company: opts.company, recordId: opts.recordId } : null,
    data: { v: opts.data, files: opts.fileNames ?? [] },
    label: (d) => opts.label(d.v),
    route: opts.route,
    isEmpty: (d) => !Object.keys(d.v ?? {}).length || (JSON.stringify(d.v) === baseRef.current && !d.files?.length),
    onRestore: (d) => { if (d.v && Object.keys(d.v).length) opts.setData(d.v); setLostFiles(d.files ?? []); },
  });
  const barProps = {
    status: store.status, savedAt: store.savedAt, restored: !!store.restoredMeta, sync: store.sync, synced: store.synced,
    conflict: store.conflict, onUseServer: store.useServerVersion, onKeepLocal: store.keepLocalVersion,
    onRestartAsNew: store.restartAsNew, restartError: store.restartError, onRetry: store.retrySave,
  };
  return { store, base, barProps, lostFiles, finalize: store.finalize, discard: store.discard, active: on };
}
