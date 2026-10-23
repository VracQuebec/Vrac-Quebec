import { describe, it, expect } from 'vitest';
import { newLocation, locationErrors, removeLocation, canAddLocation, multiPayload, MAX_LOCATIONS, MULTI_SITES_SERVER_READY } from '@/lib/parcours/multi-sites';

const ok = (k: string, lat: number) => ({ ...newLocation(k), address: `${k} rue Principale, Lévis`, lat, lng: -71.1, geocoded: true, materials: ['Terre'] });

describe('demande multi-emplacements', () => {
  it('une seule adresse valide', () => expect(locationErrors([ok('a', 46.1)])).toEqual({}));
  it('trois adresses distinctes, contact une fois', () => {
    const p = multiPayload({ name: 'X', email: 'x@a.ca', phone: '8195923495' }, [ok('a', 46.1), ok('b', 46.2), ok('c', 46.3)], 'k1');
    expect(p.locations.map((l) => l.latitude)).toEqual([46.1, 46.2, 46.3]);
    expect(p.locations[0]).not.toHaveProperty('email');
  });
  it('adresse non géolocalisée refusée parmi plusieurs', () => {
    const e = locationErrors([ok('a', 46.1), { ...ok('b', 46.2), geocoded: false, lat: null }]);
    expect(e.b).toMatch(/Emplacement B/);
    expect(e.a).toBeUndefined();
  });
  it('même position réutilisée refusée', () => expect(locationErrors([ok('a', 46.1), ok('b', 46.1)]).b).toMatch(/A/));
  it('retrait avant envoi, jamais le dernier', () => {
    expect(removeLocation([ok('a', 1), ok('b', 2)], 'a').map((l) => l.key)).toEqual(['b']);
    expect(removeLocation([ok('a', 1)], 'a')).toHaveLength(1);
  });
  it(`limite de ${MAX_LOCATIONS}`, () => expect(canAddLocation(Array.from({ length: 5 }, (_, i) => ok(`${i}`, i)))).toBe(false));
  it('activation serveur bloquée', () => expect(MULTI_SITES_SERVER_READY).toBe(false));
});
