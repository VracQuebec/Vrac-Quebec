// Prepared, never deployed in EXEC03. Package project imports before installation.
import {createClient} from 'npm:@supabase/supabase-js@2';
import {makeSearchEndpoint} from './search-endpoint';
import {makeMapsProvider} from './maps-provider';
import {validPoint} from '../../src/lib/entrepreneur/search-sector';
const enabled=false; // No environment override; explicit activation required.
const env=(key:string)=>Deno.env.get(key)??'';
const maps=makeMapsProvider({enabled,gatewayKey:env('LOVABLE_API_KEY'),connectionKey:env('GOOGLE_MAPS_API_KEY'),fetcher:fetch});
const endpoint=makeSearchEndpoint({enabled,origin:env('EXEC03_APP_ORIGIN'),
 authenticate:async r=>{const token=r.headers.get('authorization');if(!token)return null;const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:token}},auth:{persistSession:false}});const {data,error}=await client.auth.getUser();if(error||!data.user)return null;const role=await client.rpc('is_approved_entrepreneur',{_uid:data.user.id});if(role.error||!role.data)return null;return {userId:data.user.id};},
 preference:async()=>{throw Error('Preferences use the authenticated database RPC directly');},
 route:async body=>{const p=body as {origin:{lat:number;lng:number};destination:{latitude:number;longitude:number}};const destination={lat:p.destination?.latitude,lng:p.destination?.longitude};if(!validPoint(p.origin)||!validPoint(destination))throw Error('Invalid route');return maps.route(p.origin,destination);},
 address:async input=>maps.address(input),
});
Deno.serve(r=>{if(!enabled)return Response.json({error:'Activation disabled'},{status:503});return endpoint(r);});