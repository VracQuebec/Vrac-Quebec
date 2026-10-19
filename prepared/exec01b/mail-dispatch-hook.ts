// Insert at send-transactional-email's canonical client-confirmation branch,
// AFTER suppression/idempotency checks and BEFORE render/enqueue. Never deployed here.
import { prepareSubmissionConfirmation } from './confirmation-hook';
import type { Dependencies } from './endpoint';
export async function prepareExistingClientConfirmation(
 submission:{id:string;request_type:string;parcours_direction:string|null},deps:Dependencies,
) {
 if(deps.enabled!==true||submission.request_type!=='remblai'||submission.parcours_direction!=='reception')return null;
 const prepared=await prepareSubmissionConfirmation(submission.id,deps);
  return {...prepared,templateName:'client-confirmation' as const,idempotencyKey:`client-confirm-${submission.id}`,tracking:false as const};
 // Existing queue receives prepared.message.html/text instead of React rendering;
 // recipient comes from exec01_dispatch, not anonymous templateData.
}