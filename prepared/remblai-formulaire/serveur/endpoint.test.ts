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
Deno.test('standalone denied photo authorization performs zero storage writes',async()=>{
 let puts=0;
 const endpoint=makeEndpoint({portalOrigin:'https://fixture.invalid',corsOrigin:'https://fixture.invalid',rpc:async()=>({denied:true}),isAdmin:async()=>false,captureOrSend:async()=>{throw Error('No mail');},storage:{put:async()=>{puts++;},sign:async()=>{throw Error('No sign');}}});
 const form=publicEditPayload({...emptyParcoursDraft,address:'123 rue Fictive',name:'Client fictif',phone:'4185550101',email:'fixture@test.invalid',materials:['Terre'],photos:[{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',category:'chantier'}]});
 const response=await endpoint(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({kind:'act',requestId:'10000000-0000-0000-0000-000000000001',linkId:'20000000-0000-0000-0000-000000000001',secret:'a'.repeat(64),confirmed:true,operationId:crypto.randomUUID(),version:1,action:'modifier',publicForm:form})}));
 assert(response.status===403);await response.text();assert(puts===0);
});