import { geoKey, resolveCity } from '../parcours/geo-referentiel';
export interface Point { lat: number; lng: number }
export interface Sector {
  mode: 'quebec' | 'places' | 'radius' | 'polygon';
  cities: string[]; regions: string[]; center: Point | null; address: string;
  radiusKm: number | null; polygon: Point[];
  maxRoadKm: number | null; maxMinutes: number | null;
}
export const emptySector = (): Sector => ({mode:'quebec',cities:[],regions:[],center:null,address:'',radiusKm:null,polygon:[],maxRoadKm:null,maxMinutes:null});
export const validPoint = (p: Point | null | undefined): p is Point => !!p && Number.isFinite(p.lat) && Math.abs(p.lat)<=90 && Number.isFinite(p.lng) && Math.abs(p.lng)<=180;
export function validateSector(value: unknown): Sector {
  const s = value as Sector;
  if (!s || !['quebec','places','radius','polygon'].includes(s.mode)) throw Error('Secteur invalide');
  if (![s.cities,s.regions].every(a=>Array.isArray(a)&&a.length<=100&&a.every(v=>typeof v==='string'&&v.length<=150))) throw Error('Villes ou régions invalides');
  if (typeof s.address!=='string'||s.address.length>500||!Array.isArray(s.polygon)||s.polygon.length>200||!s.polygon.every(validPoint)) throw Error('Zone invalide');
  if (s.center!==null&&!validPoint(s.center)) throw Error('Origine invalide');
  for (const n of [s.radiusKm,s.maxRoadKm,s.maxMinutes]) if (n!==null&&(!Number.isFinite(n)||n<=0)) throw Error('Limite invalide');
  if (s.mode==='radius'&&(!validPoint(s.center)||s.radiusKm===null)) throw Error('Adresse validée et rayon requis');
  if (s.mode==='polygon'&&s.polygon.length<3) throw Error('Trois sommets minimum');
  return structuredClone(s);
}
export function geographicKm(a:Point,b:Point) {
  const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function insidePolygon(p:Point,vertices:Point[]) {
  let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
    const a=vertices[i],b=vertices[j];
    const cross=(p.lng-a.lng)*(b.lat-a.lat)-(p.lat-a.lat)*(b.lng-a.lng);
    if(Math.abs(cross)<1e-10&&p.lng>=Math.min(a.lng,b.lng)&&p.lng<=Math.max(a.lng,b.lng)&&p.lat>=Math.min(a.lat,b.lat)&&p.lat<=Math.max(a.lat,b.lat))return true;
    if((a.lat>p.lat)!==(b.lat>p.lat)&&p.lng<(b.lng-a.lng)*(p.lat-a.lat)/(b.lat-a.lat)+a.lng)inside=!inside;
  }
  return inside;
}
export interface SearchSite {id:string;latitude:number|null;longitude:number|null;city?:string|null;region?:string|null}
export const canDrawSector = (drawing:boolean,mode:Sector['mode']) => drawing && mode==='polygon';
export function searchGeography<T extends SearchSite>(site:T):T & {city:string|null;region:string|null} {
 const city=site.city?.trim()||null;
 return {...site,city,region:site.region?.trim()||resolveCity(city)?.region||null};
}
export interface RouteFact {distanceKm:number|null;minutes:number|null;source:string;calculatedAt:string;heavyTruckValidated:false;approximateDestination:boolean}
export function inSector(site:SearchSite,s:Sector,route?:RouteFact|null) {
  const point=site.latitude!==null&&site.longitude!==null?{lat:site.latitude,lng:site.longitude}:null;
  let match=true;
  if(s.mode==='places') {
 const region=site.region?.trim()||resolveCity(site.city)?.region;
 const unknown=(!site.city?.trim()&&s.cities.length>0)||(!region&&s.regions.length>0);
 match=unknown||s.cities.some(c=>geoKey(c)===geoKey(site.city??''))||s.regions.some(r=>geoKey(r)===geoKey(region??''));
 }
  if(s.mode==='radius')match=validPoint(point)&&validPoint(s.center)&&s.radiusKm!==null&&geographicKm(point,s.center)<=s.radiusKm;
  if(s.mode==='polygon')match=validPoint(point)&&s.polygon.length>=3&&insidePolygon(point,s.polygon);
  // Unknown route stays visible as pending, never becomes zero or an invented exclusion.
  if(s.maxRoadKm!==null&&route?.distanceKm!=null&&route.distanceKm>s.maxRoadKm)match=false;
  if(s.maxMinutes!==null&&route?.minutes!=null&&route.minutes>s.maxMinutes)match=false;
  return match;
}
export function sectorLabel(s:Sector) {
  const base=s.mode==='quebec'?'Tout le Québec':s.mode==='places'?[...s.cities,...s.regions].join(' · ')||'Villes / régions à choisir':s.mode==='radius'?`Rayon géographique ${s.radiusKm??'—'} km`:`Zone dessinée · ${s.polygon.length} sommets`;
  return [base,s.maxRoadKm!==null?`≤ ${s.maxRoadKm} km routiers`:null,s.maxMinutes!==null?`≤ ${s.maxMinutes} min`:null].filter(Boolean).join(' · ');
}