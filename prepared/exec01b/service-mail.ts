// Shared mail preparation. No provider call: only the existing queue consumes this payload.
export type ServiceMailContext = {requestId:string;kind:string;subject:string;url:string;summary:string;dedupeKey:string;recipient:string};
export type MailDependencies = {
  captureOnly?:boolean;
  sender:{from:string;domain:string};
  lookup:(recipient:string)=>Promise<{suppressed:boolean;unsubscribeToken:string|null}>;
  render:(props:{subject:string;summary:string;url:string})=>Promise<{html:string;text:string}>;
};
export function makeServiceMailPreparer(deps:MailDependencies){
 return async(context:ServiceMailContext)=>{
  const recipient=context.recipient.trim().toLowerCase();
  const reserved=/@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$/i.test(recipient);
  if(reserved&&!deps.captureOnly)return {blocked:true,reason:'reserved_contact'};
  if(deps.captureOnly&&!reserved)throw Error('Fictional capture contacts only');
  const permission=await deps.lookup(recipient);
  if(permission.suppressed)return {blocked:true,reason:'suppressed'};
  if(!permission.unsubscribeToken)throw Error('Unsubscribe token unavailable');
  const rendered=await deps.render({subject:context.subject,summary:context.summary,url:context.url});
  return {...rendered,subject:context.subject,to:recipient,from:deps.sender.from,sender_domain:deps.sender.domain,
   purpose:'transactional',label:'reception-service',unsubscribe_token:permission.unsubscribeToken,
   message_id:context.dedupeKey,idempotency_key:context.dedupeKey,queued_at:new Date().toISOString(),tracking:false};
 };
}
// The local capture uses the same payload contract. It never calls an email provider.
export function localServiceMail(){
 const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
 return makeServiceMailPreparer({captureOnly:true,sender:{from:'Vrac Québec <capture@test.invalid>',domain:'test.invalid'},
  lookup:async()=>({suppressed:false,unsubscribeToken:'local-capture-only'}),
  render:async p=>({text:`${p.subject}\n${p.summary}\nSuivre ou modifier ma demande : ${p.url}`,
   html:`<!DOCTYPE html><html lang="fr"><body><h1>Vrac Québec</h1><h2>${escape(p.subject)}</h2><p>${escape(p.summary)}</p><a href="${escape(p.url)}">Suivre ou modifier ma demande</a></body></html>`})});
}