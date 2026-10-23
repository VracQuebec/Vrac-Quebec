// Prepared adapter only; not imported by active screens. No sender, URL override or browser gate.
export const DRIVER_INVITATIONS_INSTALLED=false;
export type InvitationCall=<T>(name:string,args:Record<string,unknown>)=>Promise<T>;
export async function closedInvitationCall<T>():Promise<T>{throw Error('Invitations chauffeurs non installées. Aucun accès activé.');}
export async function activateDriverInvitation(token:string,call:InvitationCall=closedInvitationCall){
 if(token.length<40)throw Error('Invitation inaccessible.');
 const result=await call<{company_id:string;driver_id:string;user_id:string}>('driver_invite_accept',{_token:token});
 if(!result.company_id||!result.driver_id||!result.user_id)throw Error('Activation non confirmée.');
 return result;
}
export async function prepareDriverInvitation(company:string,driver:string,email:string,key:string,token:string,call:InvitationCall=closedInvitationCall){
 const id=await call<string>('driver_invite_prepare',{_company:company,_driver:driver,_email:email,_key:key,_token:token});
 if(!id)throw Error('Invitation non confirmée.');return id;
}