// Prepared entrypoint ONLY; bundle before copying to functions after authorization.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { makeEndpoint, type Message } from './endpoint.ts';
import { digest } from '../../src/lib/remblai/service.ts';
import { makeCoordinationEndpoint } from './coordination-endpoint.ts';
import {makeServiceMailPreparer} from './service-mail.ts';
import {renderReceptionMail} from './reception-service-email.tsx';
import {processReceptionLifecycle} from './lifecycle.ts';
const env=(key:string)=>{const value=Deno.env.get(key);if(!value) throw Error('Missing configuration');return value;};
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
const origin=env('EXEC01_PORTAL_ORIGIN');
// Reuse the sender constants exported by the existing sender on authorized packaging;
// no manually changed sender-domain configuration is introduced here.
const prepareMail=makeServiceMailPreparer({sender:{from:env('EXEC01_EXISTING_FROM'),domain:env('EXEC01_EXISTING_SENDER_DOMAIN')},render:renderReceptionMail,
 lookup:async recipient=>{
  const blocked=await db.from('suppressed_emails').select('id').eq('email',recipient).maybeSingle();if(blocked.error)throw Error('Suppression unavailable');
  if(blocked.data)return {suppressed:true,unsubscribeToken:null};
  const existing=await db.from('email_unsubscribe_tokens').select('token,used_at').eq('email',recipient).maybeSingle();if(existing.error)throw Error('Unsubscribe lookup unavailable');
  if(existing.data?.used_at)return {suppressed:true,unsubscribeToken:null};
  if(existing.data?.token)return {suppressed:false,unsubscribeToken:existing.data.token};
  const insert=await db.from('email_unsubscribe_tokens').upsert({email:recipient,token:crypto.randomUUID()},{onConflict:'email',ignoreDuplicates:true});if(insert.error)throw Error('Unsubscribe insert unavailable');
  const stored=await db.from('email_unsubscribe_tokens').select('token,used_at').eq('email',recipient).single();if(stored.error||!stored.data)throw Error('Unsubscribe unavailable');
  return {suppressed:!!stored.data.used_at,unsubscribeToken:stored.data.token};
 }});
const handler=makeEndpoint({portalOrigin:origin,corsOrigin:origin,
 enabled:false, // Separate authorization required; no environment override.
 quota:async request=>{
  const ip=request.headers.get('cf-connecting-ip');
  if(!ip)return false; // Trusted gateway header required, no user-controlled fallback.
  const {data,error}=await db.rpc('exec01_quota',{_identity:await digest(ip)});
  return !error&&data===true;
 },
 storage:{
  put:async(path,bytes,mime)=>{const {error}=await db.storage.from('lead-photos').upload(path,bytes,{contentType:mime,upsert:false});if(error&& !String(error.message).includes('already exists'))throw Error('Private storage unavailable');},
  sign:async(path,seconds)=>{const {data,error}=await db.storage.from('lead-photos').createSignedUrl(path,seconds);if(error||!data)throw Error('Private photo unavailable');return data.signedUrl;},
 },
 rpc:async p=>{const {data,error}=await db.rpc('exec01_dispatch',{p});if(error) throw Error('RPC unavailable');return data;},
 isAdmin:async request=>{
  const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token) return false;
  const {data,error}=await db.auth.getUser(token);if(error||!data.user) return false;
  const role=await db.rpc('has_role',{_user_id:data.user.id,_role:'admin'});return !role.error&&role.data===true;
 },
 captureOrSend:async(message:Message)=>{
  // Fail closed. This lot has no real provider sending path.
  if(env('EXEC01_MAIL_MODE')!=='capture') throw Error('Sending not authorized');
  const capture=new URL(env('EXEC01_CAPTURE_URL'));
  if(!['localhost','127.0.0.1'].includes(capture.hostname)||capture.protocol!=='http:') throw Error('Capture must be local');
  if(!/@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$/i.test(message.to)) throw Error('Fictional contacts only');
  const response=await fetch(capture,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)});
  if(!response.ok) throw Error('Capture unavailable');return 'captured-test';
 },
});
const coordination=makeCoordinationEndpoint({enabled:false,origin,
 prepareMail,
 rpc:async p=>{const {data,error}=await db.rpc('exec02_dispatch',{p});if(error)throw Error('RPC unavailable');return data;},
 authenticate:async request=>{
  const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return null;
  const {data,error}=await db.auth.getUser(token);if(error||!data.user)return null;
  const admin=await db.rpc('has_role',{_user_id:data.user.id,_role:'admin'});if(!admin.error&&admin.data===true)return {role:'admin',actorId:data.user.id};
  const entrepreneur=await db.rpc('has_role',{_user_id:data.user.id,_role:'entrepreneur'});
  if(entrepreneur.error||entrepreneur.data!==true)return null;
  return {role:'entrepreneur',actorId:data.user.id};
 },
 quota:async request=>{const ip=request.headers.get('cf-connecting-ip');if(!ip)return false;const {data,error}=await db.rpc('exec01_quota',{_identity:await digest(ip)});return !error&&data===true;},
});
const lifecycleCoordination=makeCoordinationEndpoint({enabled:false,origin,prepareMail,
 rpc:async p=>{const {data,error}=await db.rpc('exec02_dispatch',{p});if(error)throw Error('RPC unavailable');return data;},
 authenticate:async()=>({role:'admin',actorId:env('EXEC02_SYSTEM_ACTOR_ID')}),
});
Deno.serve(async request=>{
 if(request.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 try {
  if(new URL(request.url).pathname.endsWith('/reception-lifecycle')){
   // Disabled without an environment override; authenticated internal scheduler only on activation.
   if(request.method!=='POST'||request.headers.get('authorization')!==`Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`)return new Response('Forbidden',{status:403,headers:corsHeaders});
   return Response.json(await processReceptionLifecycle({enabled:false,due:async()=>{const {data,error}=await db.rpc('exec02_due');if(error)throw Error('Due jobs unavailable');return data;},dispatch:async p=>{const response=await lifecycleCoordination(new Request(`${origin}/submission-reception`,{method:'POST',body:JSON.stringify(p)}));if(!response.ok)throw Error('Lifecycle retry required');return response.json();}}),{headers:{...corsHeaders,'Cache-Control':'no-store'}});
  }
  return await (new URL(request.url).pathname.endsWith('/submission-reception')?coordination(request):handler(request));
 }
 catch {return new Response(JSON.stringify({error:'Service indisponible.'}),{status:503,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});}
});