import { useEffect } from "react";

type Listener = (dirty: boolean) => void;

let dirty = false;
const listeners = new Set<Listener>();

export function setUnsavedChanges(value: boolean) {
  if (dirty === value) return;
  dirty = value;
  listeners.forEach((l) => l(value));
}

export function hasUnsavedChanges() {
  return dirty;
}

export function subscribeUnsavedChanges(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Déclare que la page/assistant courant contient des données non enregistrées. */
export function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    setUnsavedChanges(isDirty);
    return () => setUnsavedChanges(false);
  }, [isDirty]);
}
