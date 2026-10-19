// PREPARED ONLY: no deployment, no environment override for activation.
import {createClient} from 'npm:@supabase/supabase-js@2';
import {makeCommunicationEndpoint} from './endpoint.ts';
import {digest} from '../../src/lib/remblai/service.ts';
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw Error('Configuration unavailable');return value;};
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
const origin=env('EXEC01_PORTAL_ORIGIN');
const handler=makeCommunicationEndpoint({enabled:false,local:false,origin,
 authenticate:async r=>{const token=r.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return null;const {data,error}=await db.auth.getUser(token);if(error||!data.user)return null;const admin=await db.rpc('has_role',{_user_id:data.user.id,_role:'admin'});if(admin.error)throw Error('Roles unavailable');return {role:admin.data===true?'admin':'partner',actorId:data.user.id};},
 quota:async r=>{const ip=r.headers.get('cf-connecting-ip');if(!ip)return false;const {data,error}=await db.rpc('exec01_quota',{_identity:await digest(ip)});return !error&&data===true;},
 rpc:async p=>{const {data,error}=await db.rpc('exec04_dispatch',{p});if(error)throw Error('Action refused');return data;},
});
Deno.serve(handler);