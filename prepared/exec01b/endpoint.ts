// Prepared edge handler: dependency-injected RPC and email. No hosted access on import.
import { z } from 'zod';
import { conditionsSchema, unknownConditions, WAITING_MESSAGE } from '../../src/lib/remblai/conditions';
import { legacyReception } from '../../src/lib/remblai/cloud-contract';
import { preparePhotos, signPhotos, type PhotoStorage } from './photos';
import { digest, randomSecret } from '../../src/lib/remblai/service';
const credentials = { requestId: z.string().uuid(), linkId: z.string().uuid(), secret: z.string().regex(/^[a-f0-9]{64}$/) };
const bodySchema = z.discriminatedUnion('kind', [
 z.object({kind:z.literal('read'),...credentials}).strict(),
 z.object({kind:z.literal('code'),...credentials}).strict(),
 z.object({kind:z.literal('verify'),...credentials,code:z.string().regex(/^\d{6}$/)}).strict(),
 z.object({kind:z.literal('renew'),...credentials}).strict(),
 z.object({kind:z.literal('revoke'),...credentials,confirmed:z.literal(true)}).strict(),
 z.object({kind:z.literal('act'),...credentials,confirmed:z.literal(true),operationId:z.string().uuid(),version:z.number().int().positive(),action:z.enum(['modifier','confirmer','pause','reprendre','fermer']),conditions:conditionsSchema.optional()}).strict(),
 z.object({kind:z.literal('issue'),requestId:z.string().uuid()}).strict(),
 z.object({kind:z.literal('crm'),requestId:z.string().uuid()}).strict(),
]);
export type Message = { to:string; subject:string; html:string; text:string; purpose:'service'; tracking:false };
export type Dependencies = { rpc:(input:Record<string,unknown>)=>Promise<Record<string,unknown>>; isAdmin:(request:Request)=>Promise<boolean>; captureOrSend:(message:Message)=>Promise<'captured-test'|'sent'>; portalOrigin:string; corsOrigin:string; localHarness?:boolean; storage?:PhotoStorage; enabled?:boolean; quota?:(request:Request)=>Promise<boolean> };
function escape(value:string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c)); }
export function confirmationMessage(to:string,name:string,url:string):Message {
 return {to,subject:'Confirmation de votre demande — Vrac Québec',purpose:'service',tracking:false,
 html:`<html lang="fr"><meta name="referrer" content="no-referrer"><h1>Vrac Québec</h1><p>Bonjour ${escape(name)}, nous avons bien reçu votre demande de remblai.</p><p>${WAITING_MESSAGE}</p><a href="${escape(url)}">Suivre ou modifier ma demande</a></html>`,
 text:`Bonjour ${name},\n${WAITING_MESSAGE}\nSuivre ou modifier ma demande : ${url}`};
}
export function makeEndpoint(deps:Dependencies) {
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':deps.corsOrigin,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Vary':'Origin',...(deps.localHarness?{'Access-Control-Allow-Credentials':'true'}:{})}});
 return async (request:Request)=>{
  if(request.method==='OPTIONS') return reply({});
  if(deps.enabled===false) return reply({error:'Suivi non activé.'},503);
  if(request.method==='GET') return reply({message:'Ouvrez le suivi personnel. Aucune modification effectuée.'});
  if(request.method!=='POST') return reply({error:'Méthode refusée.'},405);
  const origin=request.headers.get('origin');
  if(origin && origin!==deps.corsOrigin) return reply({error:'Accès refusé.'},403);
  // Bound actual bytes, not only an attacker-supplied Content-Length.
  const reader=request.body?.getReader(); let raw='',size=0;
  if(!reader) return reply({error:'Requête invalide.'},400);
  const decoder=new TextDecoder();
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>60000000) {await reader.cancel();return reply({error:'Requête trop volumineuse.'},413);} raw+=decoder.decode(value,{stream:true}); }
  let json:unknown; try {json=JSON.parse(raw);} catch {return reply({error:'Requête invalide.'},400);}
  const parsed=bodySchema.safeParse(json); if(!parsed.success) return reply({error:'Requête invalide.'},400);
  const data=parsed.data;
  try {
   if((data.kind==='issue'||data.kind==='crm') && !await deps.isAdmin(request)) return reply({error:'Accès refusé.'},403);
   if(deps.quota && !await deps.quota(request)) return reply({error:'Trop de tentatives.'},429);
   const p:Record<string,unknown>={...data}; delete p.secret; delete p.code;
   if('secret' in data) p.secretHash=await digest(data.secret);
   let secret='',linkId='',code='';
   if(data.kind==='issue'||data.kind==='renew') {secret=randomSecret();linkId=crypto.randomUUID();if(data.kind==='issue'){p.linkId=linkId;p.secretHash=await digest(secret);}else{p.nextId=linkId;p.nextHash=await digest(secret);}}
   if(data.kind==='code') { const a=new Uint32Array(1); do{crypto.getRandomValues(a);}while((a[0]??0)>=4294000000);code=String((a[0]??0)%1000000).padStart(6,'0');p.codeHash=await digest(`${data.linkId}:${code}`); }
   if(data.kind==='verify') p.codeHash=await digest(`${data.linkId}:${data.code}`);
   if(data.kind==='act') {if(data.action==='modifier'&&!data.conditions) return reply({error:'Conditions requises.'},400);p.inputHash=await digest(JSON.stringify({action:data.action,version:data.version,conditions:data.conditions??null}));}
   if(data.kind==='act' && data.action==='modifier' && data.conditions) {
    const authorized=await deps.rpc({...p,kind:'photo_authorize'});
    if(authorized.denied) return reply({error:'Vérification récente requise.'},403);
    const previous=authorized.conditions as {photos?:{name:string;preview:string}[]} | null;
    p.conditions={...data.conditions,photos:await preparePhotos(data.requestId,data.conditions.photos,previous?.photos??[],deps.storage)};
   }
   const result=await deps.rpc(p);
   if(result.denied) return reply({error:'Accès ou action indisponible. Vérifiez votre lien et votre code.'},403);
   if(data.kind==='issue'||data.kind==='renew'||data.kind==='code') {
    if(typeof result.contact!=='string') throw Error('contact');
    let message:Message;
    if(data.kind==='code') message={to:result.contact,subject:'Code de vérification — Vrac Québec',html:`<p>Votre code : <strong>${code}</strong></p>`,text:`Votre code : ${code}`,purpose:'service',tracking:false};
    else { const fragment=new URLSearchParams({requestId:data.requestId,linkId,secret});const url=`${deps.portalOrigin}/portail/remblai${deps.localHarness?'?server=local':''}#${fragment}`;message=confirmationMessage(result.contact,String(result.name??''),url); }
    const delivery=await deps.captureOrSend(message);return reply({ok:true,delivery});
   }
   if('conditions' in result && result.conditions==null) result.conditions=result.legacy ? legacyReception(result.legacy as Parameters<typeof legacyReception>[0]) : unknownConditions();
   delete result.legacy;
   if(result.conditions && deps.storage) {
    const conditions=result.conditions as {photos:{name:string;preview:string}[]};
    result.conditions={...conditions,photos:await signPhotos(data.requestId,conditions.photos,deps.storage)};
   }
   return reply(result);
  }catch {return reply({error:'Service indisponible. Aucune donnée privée affichée.'},503);}
 };
}