// Insert ONLY after the canonical sender's suppression/unsubscribe checks.
// This replaces its ordinary enqueue, never adds a second confirmation.
import { confirmationMessage } from './endpoint';
import { digest, randomSecret } from '../../src/lib/remblai/service';

type Submission = {id:string; request_type:string; parcours_direction:string|null; email:string|null; name:string|null};
type QueueDependencies = {
 enabled:boolean; portalOrigin:string;
 rpc:(input:Record<string,unknown>)=>Promise<Record<string,unknown>>;
 envelope:{messageId:string; from:string; senderDomain:string; unsubscribeToken:string};
};
export async function enqueueOwnerConfirmation(sub:Submission,deps:QueueDependencies) {
 if(!deps.enabled || sub.request_type!=='remblai' || sub.parcours_direction!=='reception')return null;
 if(!sub.email || /@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$/i.test(sub.email.trim()))throw Error('Contact non distribuable');
 const origin=new URL(deps.portalOrigin);
 if(origin.protocol!=='https:' || origin.pathname!=='/' || origin.search || origin.hash || origin.username || origin.password)throw Error('Origine personnelle invalide');
 const linkId=crypto.randomUUID(),secret=randomSecret();
 const url=`${origin.origin}/portail/remblai#${new URLSearchParams({requestId:sub.id,linkId,secret})}`;
 const message=confirmationMessage(sub.email,sub.name??'',url);
 const result=await deps.rpc({requestId:sub.id,linkId,secretHash:await digest(secret),contactHash:await digest(sub.email.trim().toLowerCase()),message:{
  message_id:deps.envelope.messageId,from:deps.envelope.from,sender_domain:deps.envelope.senderDomain,
  subject:message.subject,html:message.html,text:message.text,unsubscribe_token:deps.envelope.unsubscribeToken,
 }});
 if(result.denied || result.ok!==true)throw Error('Confirmation non mise en file');
 // The credential exists only in the queued message, never in the response/log.
 return {queued:true,replay:result.replay===true};
}