import { describe, it, expect } from 'vitest';
import { classifyPortalStatus } from '@/lib/remblai/cloud-client';
describe('suivi remblai : classement des refus', () => {
  it('un refus 403 (lien refusé ou identité non vérifiée) mène à la vérification par code', () => { expect(classifyPortalStatus(403)).toBe('denied'); });
  it('une requête invalide 400 est un refus, jamais une nouvelle tentative', () => { expect(classifyPortalStatus(400)).toBe('denied'); });
  it('une erreur serveur 503 permet de réessayer', () => { expect(classifyPortalStatus(503)).toBe('retry'); });
  it('un trop grand nombre de tentatives 429 permet de réessayer plus tard', () => { expect(classifyPortalStatus(429)).toBe('retry'); });
  it('un échec réseau sans réponse permet de réessayer', () => { expect(classifyPortalStatus(null)).toBe('retry'); });
});
