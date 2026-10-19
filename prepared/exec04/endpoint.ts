import { z } from 'zod';
import { campaignTemplates,filterSchema,matchesSegment,renderCampaign,type NetworkContact,type TemplateKey } from '../../src/lib/marketplace/communications';
import { digest,randomSecret } from '../../src/lib/remblai/service';
const uuid=z.string().uuid();
const input=z.object({kind:z.enum(['network','campaign_list','campaign_save','prepare','capture','commissions','agreement','commission','finance_link','services','preferences','permission','service_create','service_action','service_admin','partner_list']),
 requestId:uuid.optional(),linkId:uuid.optional(),secret:z.string().regex(/^[a-f0-9]{64}$/).optional(),operationId:uuid.optional(),confirmed:z.boolean().optional(),
 campaignId:uuid.optional(),name:z.string().min(1).max(150).optional(),template:z.enum(['confirmation','reconfirmation','offer','appointment','welcome','features']).optional(),segment:filterSchema.optional(),frequencyHours:z.number().int().min(1).max(8760).optional(),
 audience:z.enum(['owner','entrepreneur']).optional(),subjectId:uuid.optional(),purpose:z.enum(['service','promotion','partner_share']).optional(),channel:z.enum(['email','sms','app']).optional(),state:z.enum(['granted','withdrawn']).optional(),source:z.string().min(1).max(150).optional(),proof:z.string().max(2000).optional(),expiresAt:z.string().datetime().optional(),
 categoryId:uuid.optional(),serviceId:uuid.optional(),partnerId:uuid.optional(),companyId:uuid.optional(),title:z.string().min(3).max(200).optional(),description:z.string().min(3).max(2000).optional(),action:z.enum(['qualify','share','refuse_share','respond','quote','cancel','result','dispute','known','acquire']).optional(),qualification:z.string().min(3).max(1000).optional(),reason:z.string().min(3).max(1000).optional(),response:z.string().min(3).max(2000).optional(),amount:z.number().nonnegative().max(10000000).optional(),
 commissionId:uuid.optional(),ruleId:uuid.optional(),agreement:z.object({basis:z.string().min(1).max(150),trigger:z.string().min(1).max(100),attribution:z.string().min(1).max(200),dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),rate:z.number().nonnegative().max(100).nullable(),fixed:z.number().nonnegative().nullable()}).strict().optional(),event:z.string().max(100).optional(),invoiceId:uuid.optional(),billingCompanyId:uuid.optional()}).strict();
export type CommDeps={enabled:boolean;local:boolean;origin:string;authenticate:(r:Request)=>Promise<{role:'admin'|'partner';actorId:string}|null>;rpc:(p:Record<string,unknown>)=>Promise<any>;captured?:(id:string)=>Promise<boolean>;quota?:(r:Request)=>Promise<boolean>};
const mutations=new Set(['campaign_save','prepare','capture','agreement','commission','finance_link','permission','service_create','service_action']);
export function makeCommunicationEndpoint(d:CommDeps){
 const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':d.origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Vary':'Origin'}});
 return async(r:Request)=>{
  if(r.method==='OPTIONS')return reply({});if(!d.enabled)return reply({error:'Communications et services non activés.'},503);
  if(r.headers.get('origin')&&r.headers.get('origin')!==d.origin)return reply({error:'Accès refusé.'},403);
  if(r.method==='GET')return reply({message:'Aucune modification effectuée.'});if(r.method!=='POST')return reply({error:'Méthode refusée'},405);
  const raw=await r.text();if(new TextEncoder().encode(raw).byteLength>100000)return reply({error:'Requête trop volumineuse'},413);
  let parsed;try{parsed=input.safeParse(JSON.parse(raw));}catch{return reply({error:'Requête invalide'},400);}if(!parsed.success)return reply({error:'Champs invalides'},400);
  const data=parsed.data;
  if(mutations.has(data.kind)&&(!data.operationId||data.confirmed!==true))return reply({error:'Confirmation explicite requise'},400);
  try{
   if(d.quota&&!await d.quota(r))return reply({error:'Trop de tentatives'},429);
   const staff=await d.authenticate(r);if(!staff&&(!data.linkId||!data.secret||!data.requestId))return reply({error:'Accès refusé'},403);
   const p:Record<string,unknown>={...data,role:staff?.role??'owner',actorId:staff?.actorId??data.linkId};delete p.secret;
   // Personal credentials remain in process memory/request body only; SQL receives the fingerprint.
   if(data.secret)p.secretHash=await digest(data.secret);
   p.inputHash=await digest(JSON.stringify({...data,secret:undefined}));
   if(data.kind==='campaign_save'&&(!data.template||!data.name||data.frequencyHours==null||!data.segment))return reply({error:'Campagne à compléter'},400);
   if(data.kind==='prepare'){
    if(staff?.role!=='admin')return reply({error:'Accès réservé'},403);
    const campaigns=await d.rpc({...p,kind:'campaign_list'});const c=campaigns.campaigns.find((c:any)=>c.id===data.campaignId);if(!c)return reply({error:'Campagne absente'},404);
    const contacts=await d.rpc({...p,kind:'network'}) as NetworkContact[];
    const t=campaignTemplates[c.template_key as TemplateKey];
    p.recipients=contacts.filter(c=>c.audience===t.audience&&matchesSegment(c,filterSchema.parse(campaigns.campaigns.find((x:any)=>x.id===data.campaignId).segment))).slice(0,200).map(c=>({id:c.id,audience:c.audience}));
   }
   if(data.kind==='capture'){
    if(!d.local||!d.captured||staff?.role!=='admin')return reply({error:'Capture disponible seulement sur le serveur isolé'},403);
    const rendered=[];
    for(let n=0;n<200;n++){
     const claim=await d.rpc({...p,kind:'campaign_claim'});if(claim.empty)break;if(claim.excluded)continue;
     if(claim.recover){const captured=await d.captured(claim.id);await d.rpc({...p,kind:'campaign_ack',messageId:claim.id,operationId:crypto.randomUUID(),state:captured?'captured_test':'failed',reason:captured?null:'capture_locale_indisponible'});continue;}
     if(!claim.render)break;
     const nextId=crypto.randomUUID(),secret=randomSecret();
     const url=claim.audience==='owner'?`${d.origin}/portail/remblai?server=local&exec04=local#${new URLSearchParams({requestId:claim.subjectId,linkId:nextId,secret})}`:`${d.origin}/entrepreneur`;
     const message=renderCampaign(claim.template as TemplateKey,claim.contact.name,url,claim.audience==='entrepreneur'?`${d.origin}/unsubscribe`:null);
     // Only capture-mode messages; existing global provider guards remain unchanged.
     const queued=await d.rpc({...p,kind:'campaign_claim',operationId:crypto.randomUUID(),messageId:claim.id,nextId,nextHash:await digest(secret),message:{...message,capture_only:true,templateName:'exec04-'+claim.template}});
     if(queued.ok){const captured=await d.captured(claim.id);await d.rpc({...p,kind:'campaign_ack',messageId:claim.id,operationId:crypto.randomUUID(),state:captured?'captured_test':'failed',reason:captured?null:'capture_locale_indisponible'});if(captured)rendered.push({id:claim.id,state:'captured_test',...message});}
    }
    return reply({state:'captured_test',messages:rendered});
   }
   const result=await d.rpc(p);return reply(result);
  }catch{return reply({error:'Action refusée : droits, permission, état ou conditions à vérifier.'},403);}
 };
}