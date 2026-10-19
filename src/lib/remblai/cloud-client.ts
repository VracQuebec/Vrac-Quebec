import { supabase } from '@/integrations/supabase/client';
import { REMBLAI_CLOUD_ENABLED, REMBLAI_FUNCTION } from './activation';
import type { RequestRecord, Action } from './service';
import { takeFragment, type PortalSession } from './isolated-client';
export async function cloudPortalCall<T>(input: Record<string, unknown>): Promise<T> {
 if (!REMBLAI_CLOUD_ENABLED) throw Error('Le suivi personnel n’est pas activé.');
 const { data, error } = await supabase.functions.invoke(REMBLAI_FUNCTION, { body: input });
 if (error || data?.error) throw Error('Suivi indisponible. Aucune donnée privée affichée.');
 return data as T;
}
export const cloudPortalService = {
 read: (linkId: string, secret: string, requestId: string) => cloudPortalCall<Omit<RequestRecord, 'history'>>({ kind: 'read', linkId, secret, requestId }),
 requestCode: async (linkId: string, secret: string, requestId: string, _deliver: unknown) => { await cloudPortalCall({ kind: 'code', linkId, secret, requestId }); },
 verifyCode: async (linkId: string, secret: string, requestId: string, code: string) => { await cloudPortalCall({ kind: 'verify', linkId, secret, requestId, code }); },
 act: (input: PortalSession & { action: Action; operationId: string; version: number; confirmed: boolean; conditions?: unknown }) => cloudPortalCall<Omit<RequestRecord, 'history'>>({ kind: 'act', ...input }),
 renew: async (linkId: string, _deliver: unknown) => { const session=takeFragment(); if (!session) throw Error('Lien personnel requis.'); await cloudPortalCall({kind:'renew',...session,linkId}); },
};
