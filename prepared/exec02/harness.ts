import postgres from 'postgres';
import {readFile,writeFile} from 'node:fs/promises';
import {makeEndpoint} from '../exec01b/endpoint.ts';
import {makeCoordinationEndpoint} from '../exec01b/coordination-endpoint.ts';
import {unknownConditions} from '../../src/lib/remblai/conditions.ts';
import {processReceptionLifecycle} from '../exec01b/lifecycle.ts';
import {localServiceMail} from '../exec01b/service-mail.ts';
const database='exec02_browser_'+crypto.randomUUID().replaceAll('-','');
const root=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});await root.unsafe(`CREATE DATABASE ${database} ENCODING 'UTF8' TEMPLATE template0`);await root.end();
const db=postgres(`postgresql://lovable@127.0.0.1:55439/${database}?sslmode=disable`,{ssl:false});
for(const f of ['src/test/fixtures/exec01b-base.sql','src/test/fixtures/exec01c-relations.sql','src/test/fixtures/exec02-base.sql','prepared/exec01b/schema.sql','prepared/exec01b/quota.sql','prepared/exec01b/coordination.sql','prepared/exec01b/lifecycle.sql'])await db.unsafe(await readFile(new URL('../../'+f,import.meta.url),'utf8'));
const staff={admin:crypto.randomUUID(),entrepreneur:crypto.randomUUID()},messages:any[]=[];
const role=(r:Request)=>{const cookie=r.headers.get('cookie')??'';for(const [role,id] of Object.entries(staff))if(cookie.includes(`exec02_session=${id}`))return {role:role as 'admin'|'entrepreneur',actorId:id};return null;};
const portal=makeEndpoint({enabled:true,localHarness:true,portalOrigin:'http://localhost:8080',corsOrigin:'http://localhost:8080',isAdmin:async r=>role(r)?.role==='admin',rpc:async p=>(await db`select exec01_dispatch(${db.json(p as any)}) r`)[0].r,captureOrSend:async m=>{if(!m.to.endsWith('.invalid'))throw Error('No real contact');messages.push(m);return 'captured-test';}});
const prepareMail=localServiceMail(async props=>{
 const child=Bun.spawn(['deno','run','--config','/tmp/exec01c-package/deno.json','prepared/exec02/render-capture.ts'],{stdin:JSON.stringify(props),stdout:'pipe',stderr:'pipe'});
 const result=await new Response(child.stdout).text();if(await child.exited!==0)throw Error('Local React Email rendering unavailable');
 return JSON.parse(result);
});
const coordinator=makeCoordinationEndpoint({enabled:true,local:true,origin:'http://localhost:8080',prepareMail,authenticate:async r=>role(r),rpc:async p=>(await db`select exec02_dispatch(${db.json(p as any)}) r`)[0].r});
const tick=()=>processReceptionLifecycle({enabled:true,due:async()=>(await db`select exec02_due() r`)[0].r,dispatch:async p=>{const response=await coordinator(new Request('http://localhost/coordination',{method:'POST',headers:{cookie:`exec02_session=${staff.admin}`},body:JSON.stringify(p)}));if(!response.ok)throw Error('Local lifecycle failed');return response.json();}});
// One minute wake-up, loopback only; no hosted schedule is installed.
setInterval(()=>{void tick().catch(()=>console.error('Local lifecycle retry pending'));},60000);
Bun.serve({hostname:'127.0.0.1',port:55440,fetch:async r=>{const url=new URL(r.url);
if(url.pathname==='/harness/login'){const user=url.searchParams.get('role')==='entrepreneur'?'entrepreneur':'admin';return new Response('Local fictional session',{headers:{'set-cookie':`exec02_session=${staff[user]}; HttpOnly; SameSite=Lax; Path=/`}});}
if(url.pathname==='/harness/create'&&role(r)?.role==='admin'&&r.method==='POST'){
 const id=crypto.randomUUID(),origin=crypto.randomUUID(),offerId=crypto.randomUUID();
 for(const [sid,dir] of [[id,'reception'],[origin,'evacuation']])await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type,parcours_direction,submission_number,exec01_contact_verified_at,exec01_owner_confirmed_at) values(${sid},ARRAY['Terre'],'terrain','100','inconnu','Fictif','Camille Exemple','camille@test.invalid','remblai',${dir},9003,now(),now())`;
 const c={...unknownConditions(),total:100,remaining:100,unit:'m3',minimumDelivery:10,minimumDay:10,progressive:'oui',materials:[{name:'Terre',stance:'accepte'},{name:'Souches',stance:'refuse'}],mixed:'accepte',vehicles:[{name:'10 roues',stance:'accepte'}],access:'Entrée libre',hours:'Créneau explicitement accepté',presence:'oui',environmental:'documente',projectFit:'adapte'};
 await db`insert into submission_fill_profile(submission_id,reception_conditions) values(${id},${db.json(c)})`;
 await db`insert into material_offers(id,source_type,source_id,owner_user_id,quantity_value,quantity_unit,principal_material,vehicle_type,availability_start,availability_end) values(${offerId},'chantier',${origin},${staff.entrepreneur},100,'m3','terre','10 roues',current_date,current_date+10)`;
 const response=await coordinator(new Request('http://localhost/coordination',{method:'POST',headers:{cookie:`exec02_session=${staff.admin}`},body:JSON.stringify({requestId:id,kind:'mail',operationId:crypto.randomUUID(),confirmed:true})}));if(!response.ok)return response;
 const captured=(await db`select payload from local_email_capture order by id desc limit 1`)[0].payload;
 const link=String(captured.html).match(/href="([^"]+)"/);if(!link)throw Error('Captured link missing');
 return Response.json({id,offerId,url:link[1].replaceAll('&amp;','&')});
}
if(url.pathname==='/harness/messages'&&role(r)?.role==='admin')return Response.json([...messages,...(await db`select payload from local_email_capture order by id`).map(row=>row.payload)]);
if(url.pathname==='/harness/tick'&&role(r)?.role==='admin'&&r.method==='POST')return Response.json(await tick());
if(url.pathname==='/portal')return portal(r);if(url.pathname==='/coordination')return coordinator(r);return new Response('Not found',{status:404});}});
await writeFile('/tmp/browser/exec02/ready.json',JSON.stringify({database}));console.log('Isolated EXEC02 ready; fictional contacts only.');
