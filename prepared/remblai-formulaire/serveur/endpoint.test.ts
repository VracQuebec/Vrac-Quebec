import { makeEndpoint } from './endpoint.ts';
import { publicEditPayload, emptyParcoursDraft } from './lib/public-form.ts';
function assert(value:unknown):asserts value {if(!value)throw Error('Assertion failed');}
Deno.test('standalone endpoint refuses mail without atomic adapter before mutation',async()=>{
 let calls=0;
 const endpoint=makeEndpoint({portalOrigin:'https://fixture.invalid',corsOrigin:'https://fixture.invalid',rpc:async()=>{calls++;return{};},isAdmin:async()=>true,captureOrSend:async()=>{throw Error('No mail permitted');}});
 const response=await endpoint(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({kind:'issue',requestId:'10000000-0000-0000-0000-000000000001'})}));
 assert(response.status===503);await response.text();assert(calls===0);
});
Deno.test('standalone public form rejects null without replacing existing values',()=>{
 const data={...emptyParcoursDraft,address:'123 rue Fictive',name:'Client fictif',phone:'4185550101',email:'fixture@test.invalid',materials:['Terre']};
 assert(publicEditPayload(data).address==='123 rue Fictive');
 let refused=false;try{publicEditPayload({...data,address:null} as unknown as typeof data);}catch{refused=true;}assert(refused);
});