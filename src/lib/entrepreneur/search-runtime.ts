import type { Sector, RouteFact } from './search-sector';
// A switch only selects the adapter; data/security still require the authenticated loopback PostgreSQL server.
export const isolatedSearch = () => typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname)&&new URLSearchParams(window.location.search).get('exec03')==='local';
export const SEARCH_CLOUD_ENABLED=false;
export const localSearchOrigin='http://localhost:55440';
export async function localSearchCall<T>(path:string,body?:unknown):Promise<T> {
  if(!isolatedSearch())throw Error('Serveur isolé requis');
  const response=await fetch(`${localSearchOrigin}/search/${path}`,{credentials:'include',method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok)throw Error(response.status===401?'Connexion TEST requise':'Traitement isolé indisponible');
  return response.json();
}
export interface SearchSession {userId:string;companies:{id:string;name:string}[];role:'entrepreneur';chantiers:{key:string;label:string;address:string;city:string;material:string;quantity:string;submissionId:string;coords:{lat:number;lng:number}}[]}
export const loadSectorPreference=(companyId:string)=>localSearchCall<{sector:Sector|null}>('preferences?company='+encodeURIComponent(companyId));
export const saveSectorPreference=(companyId:string,sector:Sector)=>localSearchCall('preferences',{companyId,sector});
const cache=new Map<string,{at:number;fact:RouteFact|null}>();
const pending=new Map<string,Promise<RouteFact|null>>();
export async function cachedRoute(key:string,lookup:()=>Promise<RouteFact|null>,now=Date.now()) {
  const hit=cache.get(key);if(hit&&now-hit.at<(hit.fact?900000:30000))return hit.fact;
  const running=pending.get(key);if(running)return running;
  const promise=lookup().then(fact=>{cache.set(key,{at:now,fact});if(cache.size>500)cache.delete(cache.keys().next().value??'');return fact;}).finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
}