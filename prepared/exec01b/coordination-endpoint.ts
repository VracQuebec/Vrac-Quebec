import { z } from 'zod';
import { digest, randomSecret } from '../../src/lib/remblai/service';
import { evaluateReception, receptionPolicySchema } from '../../src/lib/remblai/coordination';
import type { MaterialOffer } from '../../src/lib/offers/types';
import { conditionsSchema } from '../../src/lib/remblai/conditions';
import {localServiceMail,type ServiceMailContext} from './service-mail';
const uuid=z.guid(),time=z.string().datetime({offset:true});
const schema=z.object({kind:z.enum(['list','policy','propose','accept','book','refuse','cancel','counter','change','exception','deliver','expire','mail','measure','correct','remind','communication']),requestId:uuid,
 linkId:uuid.optional(),secret:z.string().regex(/^[a-f0-9]{64}$/).optional(),operationId:uuid.optional(),confirmed:z.boolean().optional(),offerId:uuid.optional(),reservationId:uuid.optional(),quantity:z.number().nonnegative().max(999999).optional(),unit:z.enum(['tonnes','m3','verges3','voyages']).optional(),start:time.optional(),end:time.optional(),policy:receptionPolicySchema.optional(),tripId:uuid.optional(),reason:z.string().min(3).max(500).optional(),next:z.string().min(3).max(500).optional(),measurementId:uuid.optional(),ticketRef:z.string().min(1).max(100).optional(),receivedAt:time.optional(),outcome:z.enum(['accepted','refused']).optional(),communication:z.object({serviceEmail:z.boolean(),reminderHours:z.number().int().min(1).max(720),startHour:z.number().int().min(0).max(23),endHour:z.number().int().min(1).max(24),weekdays:z.array(z.number().int().min(1).max(7)).min(1).max(7)}).strict().refine(p=>p.endHour>p.startHour).optional()}).strict();
export type CoordinationDependencies={enabled:boolean;origin:string;local?:boolean;rpc:(p:Record<string,unknown>)=>Promise<Record<string,unknown>>;authenticate:(r:Request)=>Promise<{role:'admin'|'entrepreneur';actorId:string}|null>;quota?:(r:Request)=>Promise<boolean>;prepareMail?:(context:ServiceMailContext)=>Promise<Record<string,unknown>>};
export function makeCoordinationEndpoint(deps:CoordinationDependencies){
 const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':deps.origin,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS',...(deps.local?{'Access-Control-Allow-Credentials':'true'}:{})}});
 return async(r:Request)=>{
  if(r.method==='OPTIONS')return reply({});if(!deps.enabled)return reply({error:'Coordination non activée.'},503);
  if(r.method==='GET')return reply({message:'Aucune action effectuée.'});
  if(r.method!=='POST')return reply({error:'Méthode refusée.'},405);
  if(r.headers.get('origin')&&r.headers.get('origin')!==deps.origin)return reply({error:'Accès refusé.'},403);
  const raw=await r.text();if(raw.length>100000)return reply({error:'Requête trop grande.'},413);
  let parsed;try{parsed=schema.safeParse(JSON.parse(raw));}catch{return reply({error:'Requête invalide.'},400);}if(!parsed.success)return reply({error:'Requête invalide.'},400);
  const data=parsed.data;
  try{
   if(deps.quota&&!await deps.quota(r))return reply({error:'Trop de tentatives.'},429);
   const staff=await deps.authenticate(r);const p:Record<string,unknown>={...data,role:staff?.role??'owner',actorId:staff?.actorId};delete p.secret;
   if(!staff){if(!data.linkId||!data.secret)return reply({error:'Accès refusé.'},403);p.secretHash=await digest(data.secret);}
   if(data.kind!=='list'&&(!data.operationId||data.confirmed!==true))return reply({error:'Confirmation explicite requise.'},400);
   if(data.kind==='policy'&&!data.policy)return reply({error:'Conditions explicites requises.'},400);
   if(['accept','book','refuse','cancel','counter','change','exception','deliver','expire'].includes(data.kind)&&!data.reservationId)return reply({error:'Référence requise.'},400);
   if(['propose','counter','change'].includes(data.kind)&&(!data.start||!data.end||Date.parse(data.end)<=Date.parse(data.start)))return reply({error:'Horaire invalide.'},400);
   if(data.kind==='deliver'&&!data.tripId)return reply({error:'Voyage réel requis.'},400);
   if(['measure','correct'].includes(data.kind)&&(!staff||staff.role!=='admin'||!data.tripId||!data.reservationId||data.quantity==null||!data.unit||!data.ticketRef||!data.receivedAt||!data.outcome))return reply({error:'Mesure, billet et voyage requis.'},400);
   if(data.kind==='correct'&&(!data.measurementId||!data.reason))return reply({error:'Correction liée et motif requis.'},400);
   if(data.kind==='communication'&&!data.communication)return reply({error:'Préférences explicites requises.'},400);
   if(data.kind==='exception'&&(!data.reason||!data.next))return reply({error:'Motif et prochaine action requis.'},400);
   if(data.kind==='propose'||data.kind==='change'){
    if(!staff)return reply({error:'Accès refusé.'},403);
    let offerId=data.offerId,quantity=data.quantity,unit=data.unit;
    if(data.kind==='change'){
     const view=await deps.rpc({...p,kind:'list'});const rows=(view.rows??[]) as {id:string;offerId:string;quantity:number;unit:string}[];const row=rows.find(x=>x.id===data.reservationId);if(!row)return reply({error:'Accès refusé.'},403);offerId=row.offerId;quantity=row.quantity;unit=row.unit;
    }
    if(!offerId||quantity==null||!unit)return reply({error:'Offre, quantité et unité requises.'},400);
    const context=await deps.rpc({...p,kind:'context',offerId});if(context.denied)return reply({error:'Accès refusé.'},403);
    const offer=context.offer as MaterialOffer;const c=conditionsSchema.safeParse(context.conditions);
    if(!c.success)return reply({error:'Conditions historiques incomplètes : validation requise.'},409);
    p.offerId=offerId;p.evaluation=evaluateReception(offer,c.data,quantity,unit,(context.documents??[]) as {condition_key:string;stance:string}[]);
    p.expectedOffer=offer;p.expectedConditions=context.conditions;
    if(!offer.availability_start||!offer.availability_end||!data.start||!data.end){(p.evaluation as {result:string;reasons:unknown[]}).result='NEEDS_REVIEW';(p.evaluation as {reasons:unknown[]}).reasons.push({level:'REVIEW',code:'PERIOD',label:'Disponibilité du chantier inconnue.'});}
    else if(data.start.slice(0,10)<offer.availability_start||data.end.slice(0,10)>offer.availability_end){(p.evaluation as {result:string;reasons:unknown[]}).result='INCOMPATIBLE';(p.evaluation as {reasons:unknown[]}).reasons.push({level:'BLOCKER',code:'PERIOD',label:'Horaire hors disponibilité du chantier.'});}
   }
   p.inputHash=await digest(JSON.stringify(data.kind==='mail'?{kind:'mail',requestId:data.requestId}:data));
   if(data.kind!=='list'){
    // Stable dedupe derived from actor + operation, not visitor contact. SQL commits link + queue + action together.
    const nextId=crypto.randomUUID(),secret=randomSecret();p.nextId=nextId;p.nextHash=await digest(secret);
    const url=`${deps.origin}/portail/remblai${deps.local?'?server=local':''}#${new URLSearchParams({requestId:data.requestId,linkId:nextId,secret})}`;
    const subjects:Record<string,string>={propose:'Proposition de réception',accept:'Réception confirmée',book:'Rendez-vous confirmé',refuse:'Réception refusée',change:'Changement : nouvel accord requis',counter:'Autre moment proposé',expire:'Rappel : proposition expirée',cancel:'Réservation annulée',deliver:'Réception enregistrée',policy:'Conditions de réception enregistrées',exception:'Réception à vérifier',mail:'Confirmation de votre demande'};
    const subject=['accept','book','propose'].includes(data.kind)?'Décision de réception : consultez les conditions':subjects[data.kind]??(data.kind==='remind'?'Proposition sans réponse — aucune réception confirmée':'Suivi de réception');
    const summary='Consultez le matériau, la quantité, le véhicule, l’horaire et la décision dans votre dossier. Le silence ne vaut jamais accord.';
    if(!deps.local&&!deps.prepareMail)throw Error('Managed mail preparation not connected');
    p.dedupeKey=data.kind==='mail'?`client-confirm-${data.requestId}`:`exec02-${staff?.actorId??data.linkId}-${data.operationId}`;
    const context=await deps.rpc({...p,kind:'mail_context'});if(context.denied)return reply({error:'Accès refusé.'},403);
    const prepare=deps.prepareMail??localServiceMail();
    p.message=context.verified?await prepare({requestId:data.requestId,kind:data.kind,subject,url,summary,dedupeKey:String(p.dedupeKey),recipient:String(context.recipient)}):{blocked:true,reason:'unverified_contact'};
   }
   const result=await deps.rpc(p);if(result.denied)return reply({error:'Accès refusé ou accord à relire.'},403);return reply(result);
  }catch{return reply({error:'Coordination indisponible. Aucune confirmation enregistrée en cas d’échec.'},503);}
 };
}