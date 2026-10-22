// Prepared edge handler: dependency-injected RPC and email. No hosted access on import.
import { z } from 'zod';
import { publicEditSchema } from '../../src/lib/remblai/public-form';
import { prepareOriginalPhotos, signOriginalPhotos } from '../remblai-formulaire/photos';
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
 z.object({kind:z.literal('act'),...credentials,confirmed:z.literal(true),operationId:z.string().uuid(),version:z.number().int().positive(),action:z.enum(['modifier','confirmer','pause','reprendre','fermer']),conditions:conditionsSchema.optional(),publicForm:publicEditSchema.optional()}).strict(),
 z.object({kind:z.literal('issue'),requestId:z.string().uuid()}).strict(),
 z.object({kind:z.literal('crm'),requestId:z.string().uuid()}).strict(),
 z.object({kind:z.literal('cleanup'),requestId:z.string().uuid(),paths:z.array(z.string().max(180)).max(20),confirmed:z.literal(true)}).strict(),
]);
export type Message = { to:string; subject:string; html:string; text:string; purpose:'service'; tracking:false };
export type Dependencies = { rpc:(input:Record<string,unknown>)=>Promise<Record<string,unknown>>; isAdmin:(request:Request)=>Promise<boolean>; captureOrSend:(message:Message)=>Promise<'captured-test'|'sent'>; dispatchMail?:(input:Record<string,unknown>,message:Omit<Message,'to'>)=>Promise<Record<string,unknown>>; cleanup?:(id:string,paths:string[])=>Promise<{removed:number}>; portalOrigin:string; corsOrigin:string; localHarness?:boolean; storage?:PhotoStorage; enabled?:boolean; quota?:(request:Request)=>Promise<boolean> };
function escape(value:string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c)); }
export function confirmationMessage(to:string,name:string,url:string):Message {
 return {to,subject:'Confirmation de votre demande — Vrac Québec',purpose:'service',tracking:false,
 html:`<html lang="fr"><meta name="referrer" content="no-referrer"><h1>Vrac Québec</h1><p>Bonjour ${escape(name)}, nous avons bien reçu votre demande de remblai.</p><p>${WAITING_MESSAGE}</p><a href="${escape(url)}">Suivre ou modifier ma demande</a></html>`,
 text:`Bonjour ${name},\n${WAITING_MESSAGE}\nSuivre ou modifier ma demande : ${url}`};
}
export function makeEndpoint(deps:Dependencies) {
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':deps.corsOrigin,'Access-Control-Allow-Headers':'Content-Type, Authorization, apikey, x-client-info','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Vary':'Origin',...(deps.localHarness?{'Access-Control-Allow-Credentials':'true'}:{})}});
 const renderResult=async(result:Record<string,unknown>,requestId:string)=>{
  if('conditions' in result && result.conditions==null) result.conditions=result.legacy ? legacyReception(result.legacy as Parameters<typeof legacyReception>[0]) : unknownConditions();
  delete result.legacy;
  if(result.conditions && deps.storage) {const c=result.conditions as {photos:{name:string;preview:string}[]};result.conditions={...c,photos:await signPhotos(requestId,c.photos,deps.storage)};}
  if(result.publicForm && deps.storage) {const f=result.publicForm as {photos:{url:string;category:string}[]};result.publicForm={...f,photos:await signOriginalPhotos(requestId,f.photos,deps.storage)};}
  return reply(result);
 };
 return async (request:Request)=>{
  if(request.method==='OPTIONS') return reply({});
  if(deps.enabled===false) return reply({error:'Suivi non activé.'},503);
  if(request.method==='GET') return reply({message:'Ouvrez le suivi personnel. Aucune modification effectuée.'});
  if(request.method!=='POST') return reply({error:'Méthode refusée.'},405);
  const origin=request.headers.get('origin');
  if(origin && origin!==deps.corsOrigin) return reply({error:'Accès refusé.'},403);
  if(deps.quota && !await deps.quota(request)) return reply({error:'Trop de tentatives.'},429);
  // Bound actual bytes, not only an attacker-supplied Content-Length.
  const reader=request.body?.getReader(); let raw='',size=0;
  if(!reader) return reply({error:'Requête invalide.'},400);
  const decoder=new TextDecoder();
  try {while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>60000000) {await reader.cancel();return reply({error:'Requête trop volumineuse.'},413);} raw+=decoder.decode(value,{stream:true}); }}
  catch {return reply({error:'Requête invalide.'},400);}
  let json:unknown; try {json=JSON.parse(raw);} catch {return reply({error:'Requête invalide.'},400);}
  const parsed=bodySchema.safeParse(json); if(!parsed.success) return reply({error:'Requête invalide.'},400);
  const data=parsed.data;
  if(data.kind==='act' && data.publicForm && data.conditions) return reply({error:'Choisissez un seul formulaire.'},400);
  if(deps.localHarness && !['localhost','127.0.0.1'].includes(new URL(deps.portalOrigin).hostname))
   return reply({error:'Environnement local requis.'},503);
  // No mutation may precede a separately failing mail delivery outside local capture tests.
  if(['issue','renew','code'].includes(data.kind) && !deps.dispatchMail && !deps.localHarness)
   return reply({error:'Envoi sécurisé indisponible. Réessayez plus tard.'},503);
  try {
   if((data.kind==='issue'||data.kind==='crm'||data.kind==='cleanup') && !await deps.isAdmin(request)) return reply({error:'Accès refusé.'},403);
   if(data.kind==='cleanup') {
    if(!deps.cleanup)return reply({error:'Nettoyage indisponible.'},503);
    return reply(await deps.cleanup(data.requestId,data.paths));
   }
   const p:Record<string,unknown>={...data}; delete p.secret; delete p.code;
   if('secret' in data) p.secretHash=await digest(data.secret);
   let secret='',linkId='',code='';
   if(data.kind==='issue'||data.kind==='renew') {secret=randomSecret();linkId=crypto.randomUUID();if(data.kind==='issue'){p.linkId=linkId;p.secretHash=await digest(secret);}else{p.nextId=linkId;p.nextHash=await digest(secret);}}
   if(data.kind==='code') { const a=new Uint32Array(1); do{crypto.getRandomValues(a);}while((a[0]??0)>=4294000000);code=String((a[0]??0)%1000000).padStart(6,'0');p.codeHash=await digest(`${data.linkId}:${code}`); }
   if(data.kind==='verify') p.codeHash=await digest(`${data.linkId}:${data.code}`);
   if(data.kind==='act') {if(data.action==='modifier'&&!data.conditions&&!data.publicForm) return reply({error:'Conditions requises.'},400);p.inputHash=await digest(JSON.stringify({action:data.action,version:data.version,conditions:data.conditions??null,publicForm:data.publicForm??null}));}
   if(data.kind==='act' && data.action==='modifier' && data.conditions) {
    const authorized=await deps.rpc({...p,kind:'photo_authorize'});
    if(authorized.replay) {
     const replay=authorized.replay as Record<string,unknown>;
     return renderResult(replay,data.requestId);
    }
    if(authorized.denied) return reply({error:'Vérification récente requise.'},403);
    const previous=authorized.conditions as {photos?:{name:string;preview:string}[]} | null;
    const photos=data.conditions.photos.map(photo=>{if(typeof photo.name!=='string'||typeof photo.preview!=='string')throw Error('Photo invalide');return {name:photo.name,preview:photo.preview};});
    p.conditions={...data.conditions,photos:await preparePhotos(data.requestId,photos,previous?.photos??[],deps.storage)};
   }
   if(data.kind==='act' && data.action==='modifier' && data.publicForm) {
    const authorized=await deps.rpc({...p,kind:'photo_authorize'});
    if(authorized.denied) return reply({error:'Vérification récente requise.'},403);
    if(authorized.replay) {
      const replay=authorized.replay as Record<string,unknown>;
      return renderResult(replay,data.requestId);
    }
    const previous=authorized.publicForm as {photos?:{url:string;category:string}[]} | undefined;
    if(!previous) return reply({error:'Formulaire original indisponible.'},503);
    const photos=data.publicForm.photos.map(p=>{if(typeof p.url!=='string'||typeof p.category!=='string')throw Error('Photo invalide');return {url:p.url,category:p.category};});
    p.publicForm={...data.publicForm,photos:await prepareOriginalPhotos(data.requestId,photos,previous.photos??[],deps.storage)};
   }
   // The hosted adapter commits code/link + queue/capture in ONE transaction.
   // No contact, code or bearer is returned from that transaction to the browser.
   if(deps.dispatchMail && ['issue','renew','code'].includes(data.kind)) {
    const url=`${deps.portalOrigin}/portail/remblai#${new URLSearchParams({requestId:data.requestId,linkId,secret})}`;
    const message=data.kind==='code'
     ? {subject:'Code de vérification — Vrac Québec',html:`<p>Votre code : <strong>${code}</strong></p>`,text:`Votre code : ${code}`,purpose:'service' as const,tracking:false as const}
     : confirmationMessage('', '', url);
    const {to:_discarded,...content}={to:'',...message};
    const delivered=await deps.dispatchMail(p,content);
    if(delivered.denied)return reply({error:'Accès ou action indisponible.'},403);
    if(delivered.ok!==true)throw Error('Mail transaction unavailable');
    return reply({ok:true,delivery:delivered.delivery,replay:delivered.replay===true});
   }
   const result=await deps.rpc(p);
   if(result.denied) return reply({error:'Accès ou action indisponible. Vérifiez votre lien et votre code.'},403);
   if(data.kind==='issue'||data.kind==='renew'||data.kind==='code') {
    if(typeof result.contact!=='string') throw Error('contact');
    let message:Message;
    if(data.kind==='code') message={to:result.contact,subject:'Code de vérification — Vrac Québec',html:`<p>Votre code : <strong>${code}</strong></p>`,text:`Votre code : ${code}`,purpose:'service',tracking:false};
    else { const fragment=new URLSearchParams({requestId:data.requestId,linkId,secret});const url=`${deps.portalOrigin}/portail/remblai${deps.localHarness?'?server=local':''}#${fragment}`;message=confirmationMessage(result.contact,String(result.name??''),url); }
    const delivery=await deps.captureOrSend(message);
    if(delivery!=='captured-test')throw Error('Local delivery must be capture-only');
    return reply({ok:true,delivery});
   }
   return renderResult(result,data.requestId);
  }catch {return reply({error:'Service indisponible. Aucune donnée privée affichée.'},503);}
 };
}