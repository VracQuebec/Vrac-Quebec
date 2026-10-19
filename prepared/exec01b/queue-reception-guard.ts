// Insert BEFORE sendLovableEmail in the EXISTING process-email-queue on authorized activation.
// Never replace the queue/retry worker; fail closed on a read failure.
export async function receptionMessageAllowed(payload:Record<string,unknown>,deps:{
 current:(p:Record<string,unknown>)=>Promise<boolean>;
 suppressed:(recipient:string)=>Promise<boolean>;
}){
 if(!payload.reception_guard)return true;
 if(await deps.suppressed(String(payload.to)))return false;
 return deps.current(payload);
}