import {supabase} from '@/integrations/supabase/client';
export const DRIVER_INVITATIONS_INSTALLED=false;
export async function driverInvitationCall<T>(name:string,args:Record<string,unknown>):Promise<T>{
 if(!DRIVER_INVITATIONS_INSTALLED)throw Error('Invitations chauffeurs non installées. Aucun accès activé.');
 const {data,error}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(error.message);if(!data)throw Error('Résultat non confirmé.');return data as T;
}