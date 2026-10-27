import {supabase} from '@/integrations/supabase/client';
// Installed RPCs are exposed only in the unpublished development preview.
export const DRIVER_INVITATIONS_INSTALLED=import.meta.env.DEV;
// The installed capture RPC allowlists the canonical origin, not changing preview hostnames.
const captureOrigin=()=>window.location.origin==='http://localhost:8080'?window.location.origin:'https://vracquebec.ca';
export async function driverInvitationCall<T>(name:string,args:Record<string,unknown>):Promise<T>{
 if(!DRIVER_INVITATIONS_INSTALLED)throw Error('Invitations chauffeurs non installées. Aucun accès activé.');
 const capture=name==='driver_invite_prepare';
 if(name==='driver_invite_renew'){
  const {data:catalog,error:catalogError}=await supabase.rpc('driver_invite_options' as never,{_company:args._company} as never);
  if(catalogError)throw Error(catalogError.message);
  const item=(catalog as unknown as {invites:Array<{id:string;driver_id:string;email:string}>})?.invites?.find(i=>i.id===args._id);
  if(!item)throw Error('Invitation inaccessible.');
  const {data,error}=await supabase.rpc('driver_invite_capture' as never,{_company:args._company,_driver:item.driver_id,_email:item.email,_key:args._key,_token:args._token,_origin:captureOrigin(),_renew:args._id} as never);
  if(error)throw Error(error.message);return (data as unknown as {id:string}).id as T;
 }
 const {data,error}=await supabase.rpc((capture?'driver_invite_capture':name) as never,(capture?{...args,_origin:captureOrigin()}:args) as never);
 if(error)throw Error(error.message);if(!data)throw Error('Résultat non confirmé.');return (capture?(data as unknown as {id:string}).id:data) as T;
}