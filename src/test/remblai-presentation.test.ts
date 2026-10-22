import { describe, expect, it } from 'vitest';
import { fictionalRequest } from '@/lib/remblai/preview';
import { confirmedDelivery, proposalAvailable, requestQuantity, requestStatus, requestedMaterials } from '@/lib/remblai/presentation';
describe('Présentation fidèle du suivi personnel', () => {
  it('une demande active sans proposition reste reçue', () => { expect(requestStatus(fictionalRequest())).toBe('Demande reçue'); });
  it('une demande de voyage seule ne prouve pas une proposition disponible', () => { const row=fictionalRequest(); row.proposals=[{id:'test',label:'Test',status:'demande'}]; expect(proposalAvailable(row)).toBe(false); });
  it('une soumission transmise correspond à une proposition disponible', () => { const row=fictionalRequest(); row.proposals=[{id:'test',label:'Test',status:'soumission_envoyee'}]; expect(proposalAvailable(row)).toBe(true); });
  it('une planification ne confirme jamais une livraison', () => { const row=fictionalRequest(); row.deliveries=[{id:'test',label:'Test',status:'planifie'}]; expect(confirmedDelivery(row)).toBe(false); expect(requestStatus(row)).toBe('Demande reçue'); });
  it('seul le marqueur explicite de confirmation existant confirme la livraison', () => { const row=fictionalRequest(); row.deliveries=[{id:'test',label:'Test',status:'confirmee'}]; expect(confirmedDelivery(row)).toBe(true); });
  it('la pause reste distincte d’une proposition', () => { const row=fictionalRequest(); row.availability='suspended'; row.proposals=[{id:'test',label:'Test',status:'soumission_envoyee'}]; expect(requestStatus(row)).toBe('Demande en pause'); });
  it('la fermeture conserve son état même avec une ancienne livraison', () => { const row=fictionalRequest(); row.availability='owner_closed'; row.deliveries=[{id:'test',label:'Test',status:'confirmee'}]; expect(requestStatus(row)).toBe('Demande fermée'); });
  it('le besoin confirmé requiert l’état et la confirmation réelle', () => { const row=fictionalRequest(); row.availability='available'; expect(requestStatus(row)).toBe('Demande reçue'); row.lastConfirmed='2026-10-22T23:23:00Z'; expect(requestStatus(row)).toBe('Besoin confirmé'); });
  it('la quantité originale conserve son unité, sans conversion', () => { expect(requestQuantity(fictionalRequest())).toBe('3 voyages'); });
  it('des valeurs absentes ne créent pas une quantité ou des matériaux', () => { const row=fictionalRequest(true); row.publicForm=undefined; expect(requestQuantity(row)).toBe('À confirmer'); expect(requestedMaterials(row)).toEqual([]); });
});