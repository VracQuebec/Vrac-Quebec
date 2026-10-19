// Local server opt-in is available ONLY on loopback; never routes to shared Cloud.
import type { RequestRecord, Action } from './service';
export type PortalSession={requestId:string;linkId:string;secret:string};
export const LOCAL_API='http://localhost:55440';
export function isLocalServerMode(search:string,hostname:string) {
 return ['localhost','127.0.0.1'].includes(hostname) && new URLSearchParams(search).get('server')==='local';
}
let session:PortalSession|null=null;
export function takeFragment():PortalSession|null {
 if(session) return session;
 const early=(window as unknown as Record<string,unknown>).__vqPortalFragment;
 const p=new URLSearchParams(typeof early==='string'?early:window.location.hash.slice(1));
 delete (window as unknown as Record<string,unknown>).__vqPortalFragment;
 const requestId=p.get('requestId'),linkId=p.get('linkId'),secret=p.get('secret');
 // Credential is kept only in memory, never querystring or browser storage.
 window.history.replaceState(null,'',window.location.pathname+window.location.search);
 if(!requestId||!linkId||!secret) return null;
 session={requestId,linkId,secret};return session;
}
async function call<T>(data:Record<string,unknown>):Promise<T>{
 const res=await fetch(`${LOCAL_API}/portal`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await res.json();if(!res.ok) throw new Error(result.error??'Service local indisponible.');return result;
}
export const isolatedService={
 read:(linkId:string,secret:string,requestId:string)=>call<Omit<RequestRecord,'history'>>({kind:'read',linkId,secret,requestId}),
 requestCode:async(linkId:string,secret:string,requestId:string,_deliver:unknown)=>{await call({kind:'code',linkId,secret,requestId});},
 verifyCode:async(linkId:string,secret:string,requestId:string,code:string)=>{await call({kind:'verify',linkId,secret,requestId,code});},
 act:(input:{linkId:string;secret:string;requestId:string;action:Action;operationId:string;version:number;confirmed:boolean;conditions?:unknown})=>call<Omit<RequestRecord,'history'>>({kind:'act',...input}),
 renew:async(linkId:string,_deliver:unknown)=>{if(!session) throw Error('Lien requis.');await call({kind:'renew',...session,linkId});},
};
export async function readIsolatedCrm(requestId:string){return call<RequestRecord>({kind:'crm',requestId});}