import type { RequestRecord } from './service';
import { quantityLabel } from './conditions';
import { normalizeQuantityUnit, parseQuantityValue } from '@/lib/parcours/normalisation';

// Display only: no lifecycle transition, permission or stored value is changed here.
const labels: Record<string, string> = {
  a_confirmer: 'À confirmer', a_valider: 'À valider', oui: 'Oui', non: 'Non',
  accepte: 'Souhaité', refuse: 'Non souhaité', preautorisee: 'Réception selon mes conditions',
  creneaux: 'Créneaux souhaités', par_demande: 'Confirmation pour chaque proposition',
  documente: 'Documents disponibles', non_admissible: 'Non admissible', adapte: 'Adapté', incompatible: 'Incompatible',
  demande: 'Demande en cours', soumission_envoyee: 'Proposition transmise',
  planifie: 'Planifiée — non confirmée', en_cours: 'En cours', termine: 'Terminée',
  confirmee: 'Confirmée', annule: 'Annulée', annulee: 'Annulée',
};
export function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return !text || /^(null|undefined|inconnue?s?|non renseignés?|a_confirmer|a_valider)$/i.test(text) || /\{\{|\$\{/.test(text) ? null : text;
}
export function clientLabel(value: string): string {
  return labels[value] ?? (value.includes('_') ? 'À confirmer' : optionalText(value)) ?? 'À confirmer';
}
export function proposalAvailable(row: Pick<RequestRecord, 'proposals'>) {
  return row.proposals.some(p => p.status === 'soumission_envoyee');
}
export function confirmedDelivery(row: Pick<RequestRecord, 'deliveries'>) {
  // Same explicit confirmation state as the existing page. Planning is not confirmation.
  return row.deliveries.some(d => d.status === 'confirmee');
}
export function requestStatus(row: Pick<RequestRecord, 'availability' | 'lastConfirmed' | 'proposals' | 'deliveries'>) {
  if (row.availability === 'owner_closed') return 'Demande fermée';
  if (row.availability === 'suspended') return 'Demande en pause';
  if (confirmedDelivery(row)) return 'Livraison confirmée';
  if (proposalAvailable(row)) return 'Proposition disponible';
  if (row.availability === 'available' && row.lastConfirmed) return 'Besoin confirmé';
  return 'Demande reçue';
}
export function requestQuantity(row: Pick<RequestRecord, 'conditions' | 'publicForm'>): string {
  const form = row.publicForm;
  if (form && !form.unavailableFields?.includes('quantityValue') && !form.unavailableFields?.includes('quantityUnit')) {
    if (form.quantityUnknown) return 'À confirmer';
    const value = parseQuantityValue(form.quantityValue);
    const unit = normalizeQuantityUnit(form.quantityUnit);
    if (value !== null && unit !== 'inconnu') return quantityLabel(value, unit);
  }
  return row.conditions.total !== null && row.conditions.unit !== 'inconnu' ? quantityLabel(row.conditions.total, row.conditions.unit) : 'À confirmer';
}
export function requestedMaterials(row: Pick<RequestRecord, 'conditions' | 'publicForm'>): string[] {
  const originals = row.publicForm?.materials.map(optionalText).filter((v): v is string => v !== null) ?? [];
  return originals.length ? originals : row.conditions.materials.filter(m => m.stance === 'accepte').map(m => m.name);
}