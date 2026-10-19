// @vitest-environment node
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {digest} from '../lib/remblai/service';
import {unknownConditions} from '../lib/remblai/conditions';
import {makeEndpoint} from '../../prepared/exec01b/endpoint';
const enabled=process.env.EXEC01B_LOCAL_TEST==='1';
const name=`exec01_install_${crypto.randomUUID().replace(/-/g,'')}`;
const root=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});
const db=postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`,{ssl:false});
const msg={subject:'TEST',html:'<p>TEST</p>',text:'TEST',from:'capture@test.invalid',sender_domain:'test.invalid'};
async function rpc(p:Record<string,unknown>){
 const input=p.kind==='act'?{...p,inputHash:await digest(JSON.stringify({action:p.action,version:p.version,conditions:p.conditions??null}))}:p;
 return (await db`select exec01_dispatch(${db.json(input as postgres.JSONValue)}) r`)[0].r;
}
async function mail(p:Record<string,unknown>){return (await db`select exec01_dispatch_mail(${db.json(p as postgres.JSONValue)},${db.json(msg)},true) r`)[0].r;}
async function file(p:Record<string,unknown>){return (await db`select exec01_photo_manage(${db.json(p as postgres.JSONValue)}) r`)[0].r;}
async function fixture(){
 const requestId=crypto.randomUUID(),linkId=crypto.randomUUID(),secretHash=await digest(crypto.randomUUID());
 await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type,parcours_direction) values(${requestId},ARRAY['Terre'],'terrain','inconnu','inconnu','Fictif','Fictif','exec01@test.invalid','remblai','reception')`;
 await db`insert into exec01_test_dossiers(submission_id) values(${requestId})`;
 return {requestId,linkId,secretHash};
}
beforeAll(async()=>{
 if(!enabled)return;
 const info=(await root`select current_setting('data_directory') d,inet_server_addr()::text host,inet_server_port() port`)[0];
 if(!String(info.d).startsWith('/tmp/exec-correctifs/')||!['127.0.0.1','127.0.0.1/32'].includes(info.host)||info.port!==55439)throw Error('Not a verified disposable loopback database');
 await root.unsafe(`CREATE DATABASE ${name} TEMPLATE template0`);
 for(const path of ['src/test/fixtures/exec01b-base.sql','src/test/fixtures/exec01c-relations.sql'])await db.unsafe(await readFile(path,'utf8'));
 await db.unsafe(`ALTER TABLE submissions ADD COLUMN photos jsonb;
 CREATE TABLE suppressed_emails(id uuid DEFAULT gen_random_uuid(),email text);
 CREATE TABLE email_unsubscribe_tokens(email text UNIQUE,token text,used_at timestamptz);
 CREATE FUNCTION enqueue_email(text,jsonb) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Provider path forbidden in test'; END $$;`);
 for(const path of ['schema.sql','quota.sql','confirmation-queue.sql','owner-mail.sql','owner-photos.sql'])await db.unsafe(await readFile(`prepared/exec01b/${path}`,'utf8'));
},30000);
afterAll(async()=>{await db.end();if(enabled)await root.unsafe(`DROP DATABASE IF EXISTS ${name}`);await root.end();});
describe.skipIf(!enabled)('EXEC01 additive SQL installation',()=>{
 it('requires verification of the current contact, not a previous address',async()=>{
  const f=await fixture();await mail({kind:'issue',...f});const codeHash=await digest(`${f.linkId}:123456`);
  await mail({kind:'code',...f,codeHash});await rpc({kind:'verify',...f,codeHash});
  await db`update submissions set email='new@test.invalid' where id=${f.requestId}`;
  const next={requestId:f.requestId,linkId:crypto.randomUUID(),secretHash:await digest('new-contact')};
  expect(await rpc({kind:'issue',...next})).toMatchObject({ok:true});
  expect(await rpc({kind:'read',...next})).toMatchObject({denied:true});
  expect(await rpc({kind:'renew',...next,nextId:crypto.randomUUID(),nextHash:await digest('renew')})).toMatchObject({denied:true});
  const nextCode=await digest(`${next.linkId}:654321`);await mail({kind:'code',...next,codeHash:nextCode});await rpc({kind:'verify',...next,codeHash:nextCode});
  expect((await rpc({kind:'read',...next})).id).toBe(f.requestId);
 });
 it('uses the actual captured link and code across the prepared endpoint and same dossier',async()=>{
  const f=await fixture();
  const objects=new Map<string,Uint8Array>();
  const handler=makeEndpoint({enabled:true,portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid',isAdmin:async()=>true,rpc,
   captureOrSend:async()=>{throw Error('Separate delivery forbidden');},
   dispatchMail:async(p,message)=>(await db`select exec01_dispatch_mail(${db.json(p as postgres.JSONValue)},${db.json({...message,from:msg.from,sender_domain:msg.sender_domain})},true) r`)[0].r,
   storage:{put:async(path,bytes)=>{expect(await file({kind:'begin',requestId:f.requestId,path})).toMatchObject({ok:true});objects.set(path,bytes);},sign:async(path)=>`https://test.invalid/private/${path}`},
  });
  const call=async(p:Record<string,unknown>)=>{const r=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(p)}));expect(r.status).toBe(200);return r.json();};
  await call({kind:'issue',requestId:f.requestId});
  const captured=(await db`select payload from exec01_mail_capture where submission_id=${f.requestId}`)[0].payload;
  const url=new URL(captured.text.split('Suivre ou modifier ma demande : ')[1]);
  const session=Object.fromEntries(new URLSearchParams(url.hash.slice(1)));
  expect(session.requestId).toBe(f.requestId);
  await call({kind:'code',...session});
  const codeMail=(await db`select payload from exec01_mail_capture where submission_id=${f.requestId} and dedupe_key like 'exec01-code-%'`)[0].payload;
  const code=codeMail.text.match(/\d{6}/)?.[0];expect(code).toMatch(/^\d{6}$/);
  await call({kind:'verify',...session,code});let row=await call({kind:'read',...session});
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  row=await call({kind:'act',...session,action:'modifier',version:row.version,operationId:crypto.randomUUID(),confirmed:true,conditions:{...unknownConditions(),photos:[{name:'Fictif',preview:'data:image/png;base64,'+btoa(String.fromCharCode(...bytes))}]}});
  const crm=await call({kind:'crm',requestId:f.requestId});expect(crm.id).toBe(f.requestId);expect(crm.conditions.photos[0].preview).toBe(row.conditions.photos[0].preview);expect(objects.size).toBe(1);
  expect(row.conditions.photos[0].signedUrl).toContain('/private/submissions/');
  for(const action of ['confirmer','pause','reprendre'])row=await call({kind:'act',...session,action,version:row.version,operationId:crypto.randomUUID(),confirmed:true});
  await call({kind:'revoke',...session,confirmed:true});
  const revoked=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({kind:'read',...session})}));expect(revoked.status).toBe(403);
 });
 it('captured confirmation → code → modification → same CRM → pause/resume → revoke',async()=>{
  const f=await fixture();await mail({kind:'issue',...f});
  expect(await rpc({kind:'read',...f})).toMatchObject({denied:true});
  const codeHash=await digest(`${f.linkId}:123456`);await mail({kind:'code',...f,codeHash});
  expect(await mail({kind:'code',...f,codeHash})).toMatchObject({denied:true});
  expect(await rpc({kind:'verify',...f,codeHash})).toMatchObject({ok:true});
  let row=await rpc({kind:'read',...f});
  const operationId=crypto.randomUUID();
  const edit={kind:'act',...f,action:'modifier',version:row.version,operationId,confirmed:true,conditions:{...unknownConditions(),instructions:'Consigne fictive',mode:'par_demande'}};
  row=await rpc(edit);expect(row.id).toBe(f.requestId);expect(await rpc(edit)).toEqual(row);
  const crm=await rpc({kind:'crm',requestId:f.requestId});expect(crm.conditions.instructions).toBe('Consigne fictive');expect(crm.history).toHaveLength(1);
  row=await rpc({kind:'act',...f,action:'pause',version:row.version,operationId:crypto.randomUUID(),confirmed:true});expect(row.availability).toBe('suspended');
  row=await rpc({kind:'act',...f,action:'reprendre',version:row.version,operationId:crypto.randomUUID(),confirmed:true});expect(row.availability).toBe('a_confirmer');
  expect(await rpc({kind:'revoke',...f,confirmed:true})).toMatchObject({ok:true});
  expect(await rpc({kind:'read',...f})).toMatchObject({denied:true});
 });
 it('captures initial confirmation once and never enters provider queue',async()=>{
  const f=await fixture();expect(await mail({kind:'issue',...f})).toMatchObject({ok:true,delivery:'captured-test'});
  expect(await mail({kind:'issue',...f,linkId:crypto.randomUUID()})).toMatchObject({ok:true,replay:true});
  expect((await db`select count(*)::int n from exec01_mail_capture where submission_id=${f.requestId}`)[0].n).toBe(1);
 });
 it('capture failure rolls back the generated verification code',async()=>{
  const f=await fixture();await mail({kind:'issue',...f});
  await db.unsafe(`CREATE FUNCTION reject_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'capture_unavailable'; END $$;
   CREATE TRIGGER reject_capture BEFORE INSERT ON exec01_mail_capture FOR EACH ROW EXECUTE FUNCTION reject_capture();`);
  try {await expect(mail({kind:'code',...f,codeHash:await digest('code')})).rejects.toThrow('capture_unavailable');
   expect((await db`select code_hash,code_requested_at from submission_portal_links where id=${f.linkId}`)[0]).toMatchObject({code_hash:null,code_requested_at:null});
  } finally {await db.unsafe('DROP TRIGGER reject_capture ON exec01_mail_capture; DROP FUNCTION reject_capture();');}
 });
 it('renewal replay returns one capture and verifies changed contact and revoked bearer',async()=>{
  const f=await fixture();await mail({kind:'issue',...f});const codeHash=await digest(`${f.linkId}:123456`);
  await mail({kind:'code',...f,codeHash});expect(await rpc({kind:'verify',...f,codeHash})).toMatchObject({ok:true});
  await db`update submission_portal_links set code_requested_at=now()-interval '61 seconds',expires_at=now()-interval '1 second' where id=${f.linkId}`;
  const renew={kind:'renew',...f,nextId:crypto.randomUUID(),nextHash:await digest('next')};
  expect(await mail(renew)).toMatchObject({ok:true});expect(await mail({...renew,nextId:crypto.randomUUID()})).toMatchObject({ok:true,replay:true});
  expect(await rpc({kind:'read',...f})).toMatchObject({denied:true});
  await db`update submissions set email='changed@test.invalid' where id=${f.requestId}`;
  expect(await mail(renew)).toMatchObject({denied:true});
 });
 it('retains references, in-flight operations and files younger than 24 hours; only claims old fictional orphans',async()=>{
  const f=await fixture(),path=`submissions/${f.requestId}/${'a'.repeat(64)}.png`;
  expect(await file({kind:'begin',...f,path})).toMatchObject({ok:true});
  expect(await file({kind:'claim',...f,path})).toMatchObject({claimed:false});
  await db`update exec01_photo_files set created_at=now()-interval '25 hours' where path=${path}`;
  expect(await file({kind:'claim',...f,path})).toMatchObject({claimed:false});
  await db`update exec01_photo_files set lease_until=now()-interval '1 minute' where path=${path}`;
  const c={...unknownConditions(),photos:[{name:'Fictif',preview:'private:'+path}]};
  await db`insert into submission_fill_profile(submission_id,reception_conditions) values(${f.requestId},${db.json(c)})`;
  expect(await file({kind:'claim',...f,path})).toMatchObject({claimed:false});
  await db`update submission_fill_profile set reception_conditions=${db.json(unknownConditions())} where submission_id=${f.requestId}`;
  const claim=await file({kind:'claim',...f,path});expect(claim.claimed).toBe(true);
  expect(await file({kind:'begin',...f,path})).toMatchObject({denied:true});
  expect(await file({kind:'finish',...f,path,claimId:claim.claimId,removed:true})).toMatchObject({ok:true});
  expect((await db`select state from exec01_photo_files where path=${path}`)[0].state).toBe('removed');
  expect((await db`select count(*)::int n from submission_portal_events where submission_id=${f.requestId}`)[0].n).toBe(2);
 });
 it('refuses capture and deletion for unregistered dossiers',async()=>{
  const f=await fixture();await db`delete from exec01_test_dossiers where submission_id=${f.requestId}`;
  expect(await mail({kind:'issue',...f})).toMatchObject({denied:true});
  expect(await file({kind:'claim',...f,path:`submissions/${f.requestId}/${'b'.repeat(64)}.png`})).toMatchObject({denied:true});
 });
});