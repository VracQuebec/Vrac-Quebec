// Integrate before the existing provider send; the existing queue owns retries/delivery.
export async function targetedMessageAllowed(payload:Record<string,unknown>,current:(p:Record<string,unknown>)=>Promise<boolean>){
 if(payload.capture_only===true)return false;
 // Defense in depth for prepared transports: a missing campaign marker cannot send TEST data.
 if(payload.mode==='TEST_CAPTURE_ONLY')return false;
 const recipients=Array.isArray(payload.to)?payload.to:[payload.to];
 if(recipients.some(value=>typeof value==='string'&&/(\.invalid|\.test|\.example|@example\.com)(?:>|\s)*$/i.test(value.trim())))return false;
 if(!payload.exec04_guard)return true;
 return current(payload);
}