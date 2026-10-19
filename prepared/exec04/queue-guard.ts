// Integrate before the existing provider send; the existing queue owns retries/delivery.
export async function targetedMessageAllowed(payload:Record<string,unknown>,current:(p:Record<string,unknown>)=>Promise<boolean>){
 if(payload.capture_only===true)return false;
 if(!payload.exec04_guard)return true;
 return current(payload);
}