// Demande principale à plusieurs emplacements — règles d'interface pures.
// Activation serveur bloquée tant que la migration préparée n'est pas autorisée.
export const MULTI_SITES_SERVER_READY = false;
export const MAX_LOCATIONS = 5;

export interface LocationDraft {
  key: string; address: string; lat: number | null; lng: number | null; geocoded: boolean;
  materials: string[]; quantityValue: string; quantityUnit: string;
  vehicles: string[]; notes: string;
}

export const newLocation = (key: string): LocationDraft => ({
  key, address: '', lat: null, lng: null, geocoded: false, materials: [], quantityValue: '', quantityUnit: 'voyages', vehicles: [], notes: '',
});
export const locationLetter = (i: number) => String.fromCharCode(65 + i);

export function canAddLocation(list: LocationDraft[]) { return list.length < MAX_LOCATIONS; }
export function removeLocation(list: LocationDraft[], key: string) {
  return list.length <= 1 ? list : list.filter((l) => l.key !== key);
}

/** Erreurs par emplacement; jamais de point approximatif accepté silencieusement. */
export function locationErrors(list: LocationDraft[]): Record<string, string> {
  const errs: Record<string, string> = {};
  const seen = new Map<string, string>();
  list.forEach((l, i) => {
    const tag = `Emplacement ${locationLetter(i)}`;
    if (l.address.trim().length < 5) errs[l.key] = `${tag} : inscrivez l'adresse complète.`;
    else if (!l.geocoded || l.lat === null || l.lng === null) errs[l.key] = `${tag} : adresse introuvable, corrigez-la.`;
    else if (l.materials.length === 0) errs[l.key] = `${tag} : choisissez au moins un matériau.`;
    else if (l.quantityValue && !/^\d*(?:[.,]\d+)?$/.test(l.quantityValue)) errs[l.key] = `${tag} : quantité invalide.`;
    else {
      const c = `${l.lat.toFixed(6)},${l.lng.toFixed(6)}`;
      if (seen.has(c)) errs[l.key] = `${tag} : même position que l'emplacement ${seen.get(c)}.`;
      else seen.set(c, locationLetter(i));
    }
  });
  return errs;
}

/** Charge utile : coordonnées du demandeur une seule fois, emplacements séparés. */
export function multiPayload(contact: { name: string; email: string; phone: string }, list: LocationDraft[], idempotencyKey: string) {
  if (Object.keys(locationErrors(list)).length) throw new Error('Emplacements invalides');
  return {
    group: { ...contact, idempotency_key: idempotencyKey },
    locations: list.map((l) => ({ address: l.address.trim(), latitude: l.lat, longitude: l.lng, materials: l.materials,
      quantity: l.quantityValue ? `${l.quantityValue} ${l.quantityUnit}` : null, vehicles: l.vehicles, notes: l.notes.trim() })),
  };
}
