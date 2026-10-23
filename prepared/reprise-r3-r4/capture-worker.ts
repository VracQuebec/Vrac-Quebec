// Seam called by the EXISTING queue worker, before address suppression/provider branch.
// Full payload lives only in the existing queue. Journal stores no bearer URL/password/token.
export async function captureDriverTestMessage(payload:Record<string,unknown>,deps:{receipt:(value:Record<string,unknown>)=>Promise<void>;remove:()=>Promise<void>}){
 if(payload.label!=='driver-invitation-test')return false;
 if(payload.capture_only!==true||payload.mode!=='TEST_CAPTURE_ONLY'||typeof payload.to!=='string'||!/(\.invalid|\.test|\.example|@example\.com)$/i.test(payload.to))throw Error('Capture chauffeur refusée');
 await deps.receipt({message_id:payload.message_id,template_name:'driver-invitation-test',recipient_email:payload.to,status:'suppressed',metadata:{capture_only:true,capture_result:'captured-test'}});
 await deps.remove();return true;
}