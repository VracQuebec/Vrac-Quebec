// Integration seam for submit-parcours/client-confirmation; no active imports changed.
// Invoke only AFTER the existing canonical submission is committed, from trusted
// server code. Never take recipient, request ID or portal URL from templateData.
import { digest,randomSecret } from '../../src/lib/remblai/service';
import { confirmationMessage,type Dependencies } from './endpoint';
export async function prepareSubmissionConfirmation(requestId:string,deps:Dependencies) {
 if(deps.enabled===false) throw Error('Follow-up disabled');
 const linkId=crypto.randomUUID(),secret=randomSecret();
 const result=await deps.rpc({kind:'issue',requestId,linkId,secretHash:await digest(secret)});
 if(result.denied||typeof result.contact!=='string') throw Error('Confirmation unavailable');
 const fragment=new URLSearchParams({requestId,linkId,secret});
 const url=`${deps.portalOrigin}/portail/remblai${deps.localHarness?'?server=local':''}#${fragment}`;
 // Prepared, not sent. Existing mail dispatcher must deduplicate by submission ID
 // and render this service content instead of sending a second confirmation.
 return {state:'prepared' as const,message:confirmationMessage(result.contact,String(result.name??''),url)};
}