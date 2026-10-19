// Prepared entrypoint ONLY; bundle before copying to functions after authorization.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { makeEndpoint, type Message } from './endpoint.ts';
const env=(key:string)=>{const value=Deno.env.get(key);if(!value) throw Error('Missing configuration');return value;};
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
const origin=env('EXEC01_PORTAL_ORIGIN');
const handler=makeEndpoint({portalOrigin:origin,corsOrigin:origin,
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
Deno.serve(async request=>{
 if(request.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 try { const response=await handler(request);for(const [key,value] of Object.entries(corsHeaders)) response.headers.set(key,value);return response; }
 catch {return new Response(JSON.stringify({error:'Service indisponible.'}),{status:503,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});}
});