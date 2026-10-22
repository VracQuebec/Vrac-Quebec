import { REMBLAI_CLOUD_ENABLED, REMBLAI_FUNCTION } from './activation';
import type { RequestRecord, Action } from './service';
import { takeFragment, type PortalSession } from './isolated-client';
// "denied": link/code refused or identity not yet verified; "retry": network, quota or server failure.
export type PortalFailure = 'denied' | 'retry';
export class PortalCallError extends Error { constructor(public failure: PortalFailure, message: string) { super(message); } }
export function classifyPortalStatus(status: number | null): PortalFailure {
 return status === 400 || status === 403 ? 'denied' : 'retry';
}
export async function cloudPortalCall<T>(input: Record<string, unknown>): Promise<T> {
 if (!REMBLAI_CLOUD_ENABLED) throw Error('Le suivi personnel n’est pas activé.');
 const { supabase } = await import('@/integrations/supabase/client');
 const { data, error } = await supabase.functions.invoke(REMBLAI_FUNCTION, { body: input });
 if (error || data?.error) {
  const ctx = (error as { context?: unknown } | null)?.context;
  const status = ctx instanceof Response ? ctx.status : null;
  const failure = classifyPortalStatus(status);
  // Never include the request body, token or code in the message.
  throw new PortalCallError(failure, failure === 'denied'
   ? 'Lien invalide, expiré ou révoqué, ou vérification requise. Aucune donnée privée affichée.'
   : 'Connexion au suivi impossible pour le moment. Vérifiez votre réseau puis réessayez.');
 }
 return data as T;
}
export const cloudPortalService = {
 read: (linkId: string, secret: string, requestId: string) => cloudPortalCall<Omit<RequestRecord, 'history'>>({ kind: 'read', linkId, secret, requestId }),
 requestCode: async (linkId: string, secret: string, requestId: string, _deliver: unknown) => { await cloudPortalCall({ kind: 'code', linkId, secret, requestId }); },
 verifyCode: async (linkId: string, secret: string, requestId: string, code: string) => { await cloudPortalCall({ kind: 'verify', linkId, secret, requestId, code }); },
 act: (input: PortalSession & { action: Action; operationId: string; version: number; confirmed: boolean; conditions?: unknown }) => cloudPortalCall<Omit<RequestRecord, 'history'>>({ kind: 'act', ...input }),
 renew: async (linkId: string, _deliver: unknown) => { const session=takeFragment(); if (!session) throw Error('Lien personnel requis.'); await cloudPortalCall({kind:'renew',...session,linkId}); },
};
