// Insert at send-transactional-email's canonical client-confirmation branch,
// AFTER suppression/idempotency checks and BEFORE render/enqueue. Never deployed here.
import { prepareSubmissionConfirmation } from './confirmation-hook';
import type { Dependencies } from './endpoint';
import {makeCoordinationEndpoint,type CoordinationDependencies} from './coordination-endpoint';
// New atomic seam; use instead of prepareExistingClientConfirmation on activation.
// Caller must perform existing suppression/unsubscribe checks first. SQL reads canonical contact.
export async function enqueueExistingClientConfirmation(submissionId:string,operationId:string,deps:CoordinationDependencies){
 if(!deps.enabled)return {state:'disabled' as const};
 const handler=makeCoordinationEndpoint({...deps,authenticate:async()=>({role:'admin',actorId:operationId})});
 const response=await handler(new Request(`${deps.origin}/coordination`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'mail',requestId:submissionId,operationId,confirmed:true})}));
 if(!response.ok)throw Error('Confirmation non mise en file');
 return {state:'queued' as const,...await response.json()};
}
export async function prepareExistingClientConfirmation(
 submission:{id:string;request_type:string;parcours_direction:string|null},deps:Dependencies,
) {
 if(deps.enabled!==true||submission.request_type!=='remblai'||submission.parcours_direction!=='reception')return null;
 const prepared=await prepareSubmissionConfirmation(submission.id,deps);
  return {...prepared,templateName:'client-confirmation' as const,idempotencyKey:`client-confirm-${submission.id}`,tracking:false as const};
 // Existing queue receives prepared.message.html/text instead of React rendering;
 // recipient comes from exec01_dispatch, not anonymous templateData.
}