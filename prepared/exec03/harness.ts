import postgres from 'postgres';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {makeSearchEndpoint} from './search-endpoint';
const name='exec03_'+crypto.randomUUID().replace(/-/g,'');
const root=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});
await root.unsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;`);
await root.unsafe(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);await root.end();
const db=postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`,{ssl:false});
for(const f of ['prepared/exec03/local-fixture.sql','prepared/exec03/preferences.sql'])await db.unsafe(await readFile(f,'utf8'));
const users=[crypto.randomUUID(),crypto.randomUUID()],companies=[{id:crypto.randomUUID(),name:'Excavation Exemple — TEST'},{id:crypto.randomUUID(),name:'Terrassement Fictif — TEST'}];
for(const c of companies){await db`insert into jsc_companies values(${c.id},${c.name})`;await db`insert into jsc_company_members(user_id,company_id) values(${users[0]},${c.id})`;}
const sessions=new Map<string,string>();
const actor=(r:Request)=>sessions.get((r.headers.get('cookie')??'').match(/exec03_session=([^;]+)/)?.[1]??'');
const chantiers=[{key:'test-quebec',label:'Chantier fictif Québec',address:'Adresse fictive Québec',city:'Québec',material:'Terre',quantity:'12 voyages',submissionId:crypto.randomUUID(),coords:{lat:46.81,lng:-71.21}},{key:'test-levis',label:'Chantier fictif Lévis',address:'Adresse fictive Lévis',city:'Lévis',material:'Terre',quantity:'12 voyages',submissionId:crypto.randomUUID(),coords:{lat:46.74,lng:-71.18}}];
const sites=[['Québec',46.81,-71.22],['Lévis',46.74,-71.18],['Gatineau',45.47,-75.7]].map(([city,lat,lng],i)=>({id:crypto.randomUUID(),dompe_number:String(9001+i),submission_number:9001+i,city,latitude:lat,longitude:lng,materials:['Terre'],truck_types_allowed:['10_roues'],accessibility:['10 roues'],request_type:'remblai',property_type:'terrain',quantity:'100 m³',tonnage:'',status:'en attente de livraison',priority:'normal',postal_prefix:'TEST',created_at:new Date().toISOString(),availability_status:'available',availability_updated_at:new Date().toISOString(),freshness:'confirmed',other_material:null,deliver_or_remove:'recevoir',contamination:null,machinery_available:null,machinery_description:null,is_assigned:false,availability_note:null,opening_hours:null,remaining_capacity:null}));
const endpoint=makeSearchEndpoint({enabled:true,origin:'http://localhost:8080',authenticate:async r=>{const id=actor(r);return id?{userId:id}:null;},preference:async(userId,companyId,sector)=>db.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${userId},true)`;return (await tx`select exec03_sector_preference(${companyId}::uuid,${sector===null?null:tx.json(sector as postgres.JSONValue)}) result`)[0].result;}),route:async()=>null,address:async()=>null});
const cors={'Access-Control-Allow-Origin':'http://localhost:8080','Access-Control-Allow-Credentials':'true','Vary':'Origin'};
Bun.serve({hostname:'127.0.0.1',port:55440,fetch:async r=>{
 const u=new URL(r.url);
 if(u.pathname==='/search/login'&&r.method==='POST'){if(r.headers.get('origin')!=='http://localhost:8080')return new Response('Origin refused',{status:403});const p=await r.json();const id=users[p.user===2?1:0],token=crypto.randomUUID();sessions.set(token,id);return Response.json({ok:true},{headers:{...cors,'Set-Cookie':`exec03_session=${token}; HttpOnly; SameSite=Lax; Path=/`}});}
 if(u.pathname==='/search/logout'&&r.method==='POST'){const cookie=(r.headers.get('cookie')??'').match(/exec03_session=([^;]+)/)?.[1];if(cookie)sessions.delete(cookie);return Response.json({ok:true},{headers:{...cors,'Set-Cookie':'exec03_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'}});}
 if(r.method==='OPTIONS')return endpoint(r);
 if(u.pathname==='/search/session'||u.pathname==='/search/sites'){
  const id=actor(r);if(!id)return Response.json({error:'Unauthorized'},{status:401,headers:cors});
  if(u.pathname.endsWith('sites'))return Response.json({sites,error:null},{headers:cors});
  return Response.json({userId:id,role:'entrepreneur',companies:id===users[0]?companies:[],chantiers:id===users[0]?chantiers:[]},{headers:cors});
 }
 return endpoint(r);
}});
await mkdir('/tmp/browser/exec03',{recursive:true});await writeFile('/tmp/browser/exec03/ready.json',JSON.stringify({database:name}));console.log('EXEC-03 local PostgreSQL ready; no external calls.');