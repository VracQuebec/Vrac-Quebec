import { z } from 'zod';
import {geoKey,resolveCity} from '../parcours/geo-referentiel';

export const EXEC04_CLOUD_ENABLED = false;
export const isExec04Local = () => typeof window !== 'undefined' && ['localhost','127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).get('exec04') === 'local';
export const purposes = ['service','promotion','partner_share'] as const;
export const channels = ['email','sms','app'] as const;
export const filterSchema = z.object({audience:z.enum(['owner','entrepreneur']).optional(),sector:z.string().max(150).optional(),material:z.string().max(100).optional(),remainingMin:z.number().nonnegative().optional(),unit:z.string().max(20).optional(),availability:z.string().max(50).optional(),confirmedBefore:z.string().datetime().optional(),trade:z.string().max(100).optional(),activeAfter:z.string().datetime().optional(),feature:z.string().max(100).optional()}).strict();
export type Segment = z.infer<typeof filterSchema>;
export type NetworkContact = {id:string;audience:'owner'|'entrepreneur';name:string;sector:string|null;region?:string|null;email?:string;materials:string[];remaining:number|null;unit:string|null;availability:string|null;confirmedAt:string|null;trade:string|null;activeAt:string|null;features:string[];scope:'network'|'private';companyId?:string};
export function matchesSegment(c:NetworkContact,s:Segment) {
 if(c.scope!=='network')return false;
 if(s.audience&&c.audience!==s.audience)return false;
 if(s.sector&&![c.sector,c.region||resolveCity(c.sector)?.region].some(v=>v&&geoKey(v)===geoKey(s.sector??'')))return false;
 if(s.material&&!c.materials.some(m=>m.toLocaleLowerCase('fr-CA')===s.material?.toLocaleLowerCase('fr-CA')))return false;
 if(s.remainingMin!=null&&(c.remaining==null||c.remaining<s.remainingMin||!s.unit||c.unit!==s.unit))return false;
 if(s.availability&&s.availability!==c.availability)return false;
 if(s.confirmedBefore&&(!c.confirmedAt||Date.parse(c.confirmedAt)>Date.parse(s.confirmedBefore)))return false;
 if(s.trade&&s.trade!==c.trade)return false;
 if(s.activeAfter&&(!c.activeAt||Date.parse(c.activeAt)<Date.parse(s.activeAfter)))return false;
 return !s.feature||c.features.includes(s.feature);
}
export type Permission = {purpose:typeof purposes[number];channel:typeof channels[number];state:'granted'|'withdrawn'|'unknown';source:string;proof:string;at:string;expiresAt:string|null};
export function permitted(p:Permission|null,purpose:Permission['purpose'],channel:Permission['channel'],at=new Date()) {
 return !!p&&p.purpose===purpose&&p.channel===channel&&p.state==='granted'&&!!p.proof&&!!p.source&&Number.isFinite(Date.parse(p.at))&&Date.parse(p.at)<=at.getTime()&&(!p.expiresAt||Date.parse(p.expiresAt)>at.getTime());
}
export const campaignTemplates = {
 confirmation:{label:'Confirmation avec lien personnel',purpose:'service',audience:'owner',subject:'Confirmation de votre demande — Vrac Québec',body:'Votre demande est enregistrée. Aucune livraison n’est confirmée. Consultez votre besoin et vos conditions depuis votre lien personnel.'},
 reconfirmation:{label:'Reconfirmation du besoin',purpose:'service',audience:'owner',subject:'Votre besoin de remblai est-il toujours actuel ?',body:'Confirmez votre besoin, modifiez vos conditions ou mettez la demande en pause depuis votre lien personnel. Le silence ne confirme aucune réception.'},
 offer:{label:'Offre compatible',purpose:'service',audience:'owner',subject:'Une proposition de réception à examiner',body:'Consultez le matériau, sa composition, la quantité et son unité, le véhicule, l’horaire et les conditions de la proposition dans votre dossier. Aucune réception n’est confirmée sans accord valable.'},
 appointment:{label:'Rendez-vous',purpose:'service',audience:'owner',subject:'Votre rendez-vous de réception',body:'Consultez le créneau, la quantité, le véhicule, la présence exigée et les conditions acceptées dans votre dossier. Seul un rendez-vous confirmé apparaît comme confirmé.'},
 welcome:{label:'Accueil entrepreneur',purpose:'promotion',audience:'entrepreneur',subject:'Bienvenue dans le réseau Vrac Québec',body:'Retrouvez vos demandes et recherchez les besoins de remblai dans votre espace entrepreneur. Les propositions demeurent soumises à la compatibilité et à une autorisation de réception.'},
 features:{label:'Fonctions disponibles',purpose:'promotion',audience:'entrepreneur',subject:'Vos outils disponibles dans Vrac Québec',body:'Votre espace entrepreneur réunit vos demandes, la carte des besoins de remblai et le comparateur. Les secteurs mémorisés et les nouveaux services préparés ne sont pas encore activés pour les dossiers réels.'},
} as const;
export type TemplateKey=keyof typeof campaignTemplates;
export function renderCampaign(key:TemplateKey,name:string,url:string,unsubscribe:string|null) {
 const t=campaignTemplates[key]; const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
 const footer=t.purpose==='promotion'?'Vous recevez ce message avec votre permission promotionnelle. Le retrait ne ferme aucune demande.':'Message de suivi de votre demande, distinct des promotions.';
 return {subject:t.subject,text:`Bonjour ${name},\n${t.body}\n${url}\n${footer}${unsubscribe?'\nSe désabonner : '+unsubscribe:''}`,html:`<!doctype html><html lang="fr"><head><meta name="referrer" content="no-referrer"></head><body><h1>Vrac Québec</h1><p>Bonjour ${esc(name)},</p><p>${esc(t.body)}</p><p><a href="${esc(url)}">${t.audience==='owner'?'Suivre ou modifier ma demande':'Mon espace entrepreneur'}</a></p><p>${esc(footer)}</p>${unsubscribe?`<a href="${esc(unsubscribe)}">Se désabonner</a>`:''}</body></html>`,tracking:false};
}
export async function exec04Call<T=any>(kind:string,data:Record<string,unknown>={}) : Promise<T> {
 if(!isExec04Local()&&!EXEC04_CLOUD_ENABLED)throw Error('Communications et services préparés, non activés pour les dossiers réels.');
 let url='http://localhost:55440/communications';const headers:Record<string,string>={'Content-Type':'application/json'};
 if(!isExec04Local()){
  const {supabase}=await import('@/integrations/supabase/client');
  const {data:{session}}=await supabase.auth.getSession();
  url=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/network-communications`;
  headers.apikey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(session)headers.Authorization=`Bearer ${session.access_token}`;
 }
 const response=await fetch(url,{method:'POST',credentials:isExec04Local()?'include':'omit',headers,body:JSON.stringify({kind,...data})});
 const result=await response.json();if(!response.ok)throw Error(result.error??'Action refusée.');return result;
}