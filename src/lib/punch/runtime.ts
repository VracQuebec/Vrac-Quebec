import {supabase} from '@/integrations/supabase/client';
import {createClient} from '@supabase/supabase-js';
export const EXEC06_HOSTED_ENABLED=false;
export const isPunchLocal=()=>typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname)&&new URLSearchParams(window.location.search).get('punch_test')==='local';
let localUser='';
export function setPunchTestUser(user:string){localUser=user;}
const local=isPunchLocal()?createClient('http://localhost:55446','local-disposable-only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,headers:{...Object.fromEntries(new Headers(options?.headers)),'x-test-user':localUser}})}}):null;
export const punchDb:any=local??supabase;
export const punchExtended=()=>isPunchLocal()||EXEC06_HOSTED_ENABLED;
export const punchUser=async()=>local?localUser:(await supabase.auth.getUser()).data.user?.id??null;
export const torontoInput=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T');
export const torontoDay=(d=new Date())=>torontoInput(d).slice(0,10);
export function torontoInstant(value:string){const candidates:string[]=[];for(const offset of ['-04:00','-05:00']){const d=new Date(value+offset);if(!Number.isNaN(d.getTime())&&torontoInput(d)===value)candidates.push(d.toISOString());}if(candidates.length!==1)throw Error('Heure Toronto inexistante ou ambiguë : demander une correction avec un horaire explicite.');return candidates[0];}
