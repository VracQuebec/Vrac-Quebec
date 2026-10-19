import {createLocal} from './local-db';
import {makeCommunicationEndpoint} from './endpoint';
import {makeEndpoint} from '../exec01b/endpoint';
import {makeCoordinationEndpoint} from '../exec01b/coordination-endpoint';
import {writeFile,mkdir} from 'node:fs/promises';
const {name,db,rpc,ids}=await createLocal();
const sessions=new Map<string,{role:'admin'|'partner';actorId:string}>();
const actor=async(r:Request)=>sessions.get((r.headers.get('cookie')??'').match(/exec04_session=([^;]+)/)?.[1]??'')??null;
const headers={'Access-Control-Allow-Origin':'http://localhost:8080','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const captured=async(id:string)=>{const m=(await db`select m.email,m.purpose,c.payload from mkt_promo_sends m join local_email_capture c on c.id=m.queue_id where m.id=${id}::uuid`)[0];if(!m||!m.email.endsWith('.invalid'))throw Error('Capture fictive uniquement');return (await db`select exec04_permission(${m.email},${m.purpose}) ok`)[0].ok;};
const endpoint=makeCommunicationEndpoint({enabled:true,local:true,origin:'http://localhost:8080',authenticate:actor,rpc,captured});
const messages:any[]=[];
const portal=makeEndpoint({enabled:true,localHarness:true,portalOrigin:'http://localhost:8080',corsOrigin:'http://localhost:8080',isAdmin:async r=>(await actor(r))?.role==='admin',rpc:async p=>(await db`select exec01_dispatch(${db.json(p as any)}) r`)[0].r,captureOrSend:async m=>{if(!m.to.endsWith('.invalid'))throw Error('No real contact');messages.push(m);return 'captured-test';}});
const coordinator=makeCoordinationEndpoint({enabled:true,local:true,origin:'http://localhost:8080',authenticate:async r=>{const a=await actor(r);return a?.role==='admin'?a:null;},rpc:async p=>(await db`select exec02_dispatch(${db.json(p as any)}) r`)[0].r});
Bun.serve({hostname:'127.0.0.1',port:55440,fetch:async r=>{
 const u=new URL(r.url);
 if(r.headers.get('origin')&&r.headers.get('origin')!=='http://localhost:8080')return new Response('Origin refused',{status:403,headers});
 if(r.method==='OPTIONS')return new Response('',{headers});
 if(u.pathname==='/harness/login'&&r.method==='POST'){const p=await r.json();if(!['admin','partner','foreign'].includes(p.role))return new Response('Fictional identity required',{status:400,headers});const key=crypto.randomUUID();const a=p.role==='partner'?{role:'partner' as const,actorId:ids.partner}:p.role==='foreign'?{role:'partner' as const,actorId:ids.foreignUser}:{role:'admin' as const,actorId:ids.admin};sessions.set(key,a);return Response.json({role:a.role},{headers:{...headers,'Set-Cookie':`exec04_session=${key}; HttpOnly; SameSite=Lax; Path=/`}});}
 if(u.pathname==='/harness/fixture'&&(await actor(r))?.role==='admin')return Response.json(ids,{headers});
 if(u.pathname==='/harness/messages'&&(await actor(r))?.role==='admin')return Response.json(messages,{headers});
 if(u.pathname==='/portal')return portal(r);
 if(u.pathname==='/coordination')return coordinator(r);
 if(u.pathname==='/communications')return endpoint(r);
 return new Response('Not found',{status:404,headers});
}});
await mkdir('/tmp/browser/exec04',{recursive:true});await writeFile('/tmp/browser/exec04/ready.json',JSON.stringify({database:name,ids}));
console.log('EXEC04 local PostgreSQL ready; fictional data, no external sender.');