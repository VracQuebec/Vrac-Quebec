// ============================================================
// FIL CONDUCTEUR « CHANTIER »
// Le chantier actif suit l'entrepreneur d'un écran à l'autre :
// accueil → chantier → carte → comparateur → demande → suivi.
// Aucune donnée inventée : uniquement ce qui est déjà enregistré
// dans les demandes de l'utilisateur (vue calculée existante).
// Persistance : sessionStorage (comme le handoff du parcours).
// ============================================================
import type { Chantier } from "@/lib/parcours/chantiers";
import { reliableCoords } from "@/lib/parcours/sens-besoin";

export const ACTIVE_CHANTIER_KEY = "vq_chantier_actif_v1";

export interface ActiveChantier {
  key: string;
  label: string;
  city: string | null;
  address: string | null;
  material: string | null;
  quantity: string | null;
  submissionId: string | null;
  coords: { lat: number; lng: number } | null;
}

/** Construit le contexte à partir d'un chantier calculé (lecture seule). */
export const toActiveChantier = (c: Chantier): ActiveChantier => {
  const last = c.submissions[0] ?? null;
  return {
    key: c.key,
    label: c.label,
    city: c.city,
    address: c.address,
    material: last?.material ?? null,
    quantity: last?.quantity ?? null,
    submissionId: last?.id ?? null,
    // Jamais un centre de ville approximatif : le point doit être confirmé.
    coords: last ? reliableCoords(last) : null,
  };
};

export const saveActiveChantier = (c: ActiveChantier | null) => {
  try {
    if (!c) sessionStorage.removeItem(ACTIVE_CHANTIER_KEY);
    else sessionStorage.setItem(ACTIVE_CHANTIER_KEY, JSON.stringify(c));
  } catch {
    /* quota indisponible : le contexte reste simplement non mémorisé */
  }
};

export const loadActiveChantier = (): ActiveChantier | null => {
  try {
    const raw = sessionStorage.getItem(ACTIVE_CHANTIER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveChantier;
    return parsed && typeof parsed === "object" && typeof parsed.key === "string" ? parsed : null;
  } catch {
    return null;
  }
};

/** Préremplissage transmis au formulaire de demande (`applyPrefill`). */
export const prefillFromChantier = (c: ActiveChantier): Record<string, unknown> => ({
  submissionId: c.submissionId,
  address: c.coords ? c.address ?? "" : "",
  coords: c.coords,
});
