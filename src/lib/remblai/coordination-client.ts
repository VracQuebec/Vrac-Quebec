import { REMBLAI_CLOUD_ENABLED } from './activation';
import { isLocalServerMode, LOCAL_API } from './isolated-client';
export async function coordinationCall<T>(p:Record<string,unknown>):Promise<T>{
 if(isLocalServerMode(window.location.search,window.location.hostname)){
  const r=await fetch(`${LOCAL_API}/coordination`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
  const data=await r.json();if(!r.ok)throw Error(data.error??'Coordination indisponible.');return data;
 }
 if(!REMBLAI_CLOUD_ENABLED)throw Error('Coordination non activée.');
 const {supabase}=await import('@/integrations/supabase/client');
 const {data,error}=await supabase.functions.invoke('submission-reception',{body:p});if(error||data?.error)throw Error('Coordination indisponible.');return data;
}