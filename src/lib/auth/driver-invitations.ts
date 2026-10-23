import {supabase} from '@/integrations/supabase/client';
export const DRIVER_INVITATIONS_INSTALLED=false;
export async function driverInvitationCall<T>(name:string,args:Record<string,unknown>):Promise<T>{
 if(!DRIVER_INVITATIONS_INSTALLED)throw Error('Invitations chauffeurs non installées. Aucun accès activé.');
 const capture=name==='driver_invite_prepare';
 const {data,error}=await supabase.rpc((capture?'driver_invite_capture':name) as never,(capture?{...args,_origin:window.location.origin}:args) as never);
 if(error)throw Error(error.message);if(!data)throw Error('Résultat non confirmé.');return (capture?(data as unknown as {id:string}).id:data) as T;
}