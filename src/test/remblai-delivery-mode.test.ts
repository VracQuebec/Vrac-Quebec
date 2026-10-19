import { describe, it, expect } from 'vitest';
import { deliveryCapture } from '../../supabase/functions/_shared/exec01/delivery-mode';

describe('EXEC-01 service mail activation', () => {
  it('always captures registered fictitious contacts even after real mail activation', () => {
    expect(deliveryCapture('exec01-publication@remblai.test', true, true)).toBe(true);
  });
  it('never sends to an unregistered reserved test contact', () => {
    expect(() => deliveryCapture('test@example.com', false, true)).toThrow();
  });
  it('does not force capture for real requesters when explicitly activated', () => {
    expect(deliveryCapture('demandeur@domaine-quebec.ca', false, true)).toBe(false);
  });
  it('blocks real service mail before activation', () => {
    expect(() => deliveryCapture('demandeur@domaine-quebec.ca', false, false)).toThrow();
  });
});