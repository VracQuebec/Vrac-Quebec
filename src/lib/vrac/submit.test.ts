import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_VRAC_DRAFT } from './catalog';
import { useQuoteSubmit } from './submit';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
const draft = { ...EMPTY_VRAC_DRAFT, leadToken: '11111111-1111-4111-8111-111111111111', materialId: 'sable', tonnes: '15', address: '12 rue Fictive', addressLat: 46, addressLng: -73 };

describe('Décisions explicites de soumission', () => {
  beforeEach(() => { invoke.mockReset(); });
  it('ne transforme pas une absence de réponse en refus', () => {
    const { result } = renderHook(useQuoteSubmit);
    expect(result.current.refused).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
  it('enregistre le refus sur le jeton existant, sans soumission ni rappel', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { result } = renderHook(useQuoteSubmit);
    await act(async () => { await result.current.refuse(draft); });
    expect(invoke).toHaveBeenCalledExactlyOnceWith('quote-submit', { body: { action: 'decision', decision: 'refusee', lead_token: draft.leadToken } });
    expect(result.current.refused).toBe(true);
    expect(result.current.result).toBeNull();
  });
  it('ne confirme jamais un refus échoué', async () => {
    invoke.mockResolvedValue({ data: { ok: false }, error: null });
    const { result } = renderHook(useQuoteSubmit);
    await act(async () => { await result.current.refuse(draft); });
    expect(result.current.refused).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
  it('permet la modification après refus sans créer de demande', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { result } = renderHook(useQuoteSubmit);
    await act(async () => { await result.current.refuse(draft); });
    act(() => result.current.resetDecision());
    expect(result.current.refused).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(draft.leadToken).toBe('11111111-1111-4111-8111-111111111111');
  });
  it('bloque les décisions concurrentes pendant le refus', async () => {
    let finish: ((value: unknown) => void) | undefined;
    invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(useQuoteSubmit);
    let first: Promise<void> | undefined;
    act(() => { first = result.current.refuse(draft); });
    expect(result.current.deciding).toBe(true);
    await act(async () => { await result.current.send(draft, 'submit'); });
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => { finish?.({ data: { ok: true }, error: null }); await first; });
    expect(result.current.deciding).toBe(false);
  });
});