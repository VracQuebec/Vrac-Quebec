import {validPoint,type Point,type RouteFact} from '../../src/lib/entrepreneur/search-sector';
// Provider injected into authenticated endpoint; no browser Places API and no automatic/batch polling.
export function makeMapsProvider(deps:{enabled:boolean;gatewayKey:string;connectionKey:string;fetcher:typeof fetch}) {
 const cache=new Map<string,{expires:number;value:unknown}>();
 const pending=new Map<string,Promise<unknown>>();
 async function request(path:string,body:unknown,mask:string) {
  if(!deps.enabled)throw Error('External Maps calls disabled');
  if(!deps.gatewayKey||!deps.connectionKey)throw Error('Maps connection missing');
  const key=JSON.stringify([path,body,mask]);const hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit.value;
  const running=pending.get(key);if(running)return running;
  const promise=(async()=>{
   const response=await deps.fetcher(`https://connector-gateway.lovable.dev/google_maps/${path}`,{method:'POST',headers:{Authorization:`Bearer ${deps.gatewayKey}`,'X-Connection-Api-Key':deps.connectionKey,'Content-Type':'application/json','X-Goog-FieldMask':mask},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   if(!response.ok){const text=await response.text();if(response.status===403){let reason='';try{reason=JSON.parse(text)?.error?.details?.find((d:{reason?:string})=>d.reason)?.reason??'';}catch{}throw Error(`[403] ${reason==='API_KEY_HTTP_REFERRER_BLOCKED'?'Server key: use IP restrictions or None, not browser referrers':reason==='API_KEY_SERVICE_BLOCKED'?'Enable Routes API or Places API (New) on the server key':text}`);}throw Error(`[${response.status}] ${text}`);}
   const value=await response.json();cache.set(key,{expires:Date.now()+900000,value});if(cache.size>500)cache.delete(cache.keys().next().value??'');return value;
  })().finally(()=>pending.delete(key));pending.set(key,promise);return promise;
 }
 return {
  async route(origin:Point,destination:Point):Promise<RouteFact|null>{
   if(!validPoint(origin)||!validPoint(destination))throw Error('Invalid coordinates');
   if(!deps.enabled)return null;
   const raw=await request('routes/distanceMatrix/v2:computeRouteMatrix',{origins:[{waypoint:{location:{latLng:{latitude:origin.lat,longitude:origin.lng}}}}],destinations:[{waypoint:{location:{latLng:{latitude:destination.lat,longitude:destination.lng}}}}],travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'},'originIndex,destinationIndex,status,condition,distanceMeters,duration');
   const cell=Array.isArray(raw)?raw.find(c=>(c.originIndex??0)===0&&(c.destinationIndex??0)===0):null;
   if(!cell||cell.status?.code||cell.condition!=='ROUTE_EXISTS'||typeof cell.duration!=='string'||!/^\d+(?:\.\d+)?s$/.test(cell.duration))return null;
   const meters=cell.distanceMeters??0,seconds=Number(cell.duration.slice(0,-1));
   if(!Number.isFinite(meters)||meters<0||!Number.isFinite(seconds)||seconds<0)return null;
   return {distanceKm:meters/1000,minutes:seconds/60,source:'Google Routes DRIVE TRAFFIC_UNAWARE',calculatedAt:new Date().toISOString(),heavyTruckValidated:false,approximateDestination:true};
  },
  async suggestions(input:string,sessionToken:string){if(input.length<3||input.length>300||!sessionToken)throw Error('Invalid autocomplete input');return request('places/v1/places:autocomplete',{input,sessionToken,includedRegionCodes:['ca'],languageCode:'fr'},'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');},
  async address(input:string):Promise<Point|null>{if(input.length<3||input.length>500)throw Error('Invalid address');const raw=await request('places/v1/places:searchText',{textQuery:input,regionCode:'CA',languageCode:'fr',maxResultCount:1},'places.location,places.formattedAddress');const p=(raw as {places?:{location?:{latitude:number;longitude:number}}[]}).places?.[0]?.location;const point=p?{lat:p.latitude,lng:p.longitude}:null;return validPoint(point)?point:null;}
 };
}