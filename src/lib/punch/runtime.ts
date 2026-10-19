import {supabase} from '@/integrations/supabase/client';
import {createClient} from '@supabase/supabase-js';
import {isHelpLocal} from '@/lib/help/progress';
export const EXEC06_HOSTED_ENABLED=false;
export const isPunchLocal=()=>typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname)&&new URLSearchParams(window.location.search).get('punch_test')==='local';
let localUser='';
export function setPunchTestUser(user:string){localUser=user;}
const local=isPunchLocal()||isHelpLocal()?createClient(isHelpLocal()?'http://localhost:55447':'http://localhost:55446','local-disposable-only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,headers:{...Object.fromEntries(new Headers(options?.headers)),'x-test-user':localUser}})}}):null;
export const punchDb:any=local??supabase;
export const punchExtended=()=>isPunchLocal()||isHelpLocal()||EXEC06_HOSTED_ENABLED;
export const punchUser=async()=>local?localUser:(await supabase.auth.getUser()).data.user?.id??null;
export const torontoInput=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T');
export const torontoDay=(d=new Date())=>torontoInput(d).slice(0,10);
export function torontoInstant(value:string){const candidates:string[]=[];for(const offset of ['-04:00','-05:00']){const d=new Date(value+offset);if(!Number.isNaN(d.getTime())&&torontoInput(d)===value)candidates.push(d.toISOString());}if(candidates.length!==1)throw Error('Heure Toronto inexistante ou ambiguë : demander une correction avec un horaire explicite.');return candidates[0];}

export function torontoMonday(d=new Date()){const day=torontoDay(d);const x=new Date(day+"T12:00:00Z");x.setUTCDate(x.getUTCDate()-(x.getUTCDay()+6)%7);return x.toISOString().slice(0,10);}
export function intervalMinutes(start:string,end:string|null,from:string,to:string,now=Date.now()){const a=Math.max(new Date(start).getTime(),new Date(torontoInstant(from+"T00:00")).getTime());const next=new Date(to+"T12:00:00Z");next.setUTCDate(next.getUTCDate()+1);const b=Math.min(end?new Date(end).getTime():now,new Date(torontoInstant(next.toISOString().slice(0,10)+"T00:00")).getTime());return Math.max(0,(b-a)/60000);}
