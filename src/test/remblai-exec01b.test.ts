// @vitest-environment node
// Real SQL/RPC/HTTP handler tests on an empty loopback PostgreSQL instance.
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { makeEndpoint,type Message } from '../../prepared/exec01b/endpoint';
import { unknownConditions } from '../lib/remblai/conditions';
import { isLocalServerMode } from '../lib/remblai/isolated-client';
const enabled=process.env.EXEC01B_LOCAL_TEST==='1';
const databaseName=`exec01b_${crypto.randomUUID().replace(/-/g,'')}`;
const adminDb=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});
const db=postgres(`postgresql://lovable@127.0.0.1:55439/${databaseName}?sslmode=disable`,{ssl:false,max:5});
const mail:Message[]=[];
const handler=makeEndpoint({portalOrigin:'http://localhost:8080',corsOrigin:'http://localhost:8080',isAdmin:async r=>r.headers.get('authorization')==='Bearer local-test-admin',captureOrSend:async m=>{if(!m.to.endsWith('.invalid'))throw Error('Real mail forbidden');mail.push(m);return 'captured-test';},rpc:async p=>{
 const rows=await db`select public.exec01_dispatch(${db.json(p as postgres.JSONValue)}) as result`;return rows[0].result;
}});
async function call(p:Record<string,unknown>,admin=false){const response=await handler(new Request('http://localhost/portal',{method:'POST',headers:{'content-type':'application/json',...(admin?{authorization:'Bearer local-test-admin'}:{})},body:JSON.stringify(p)}));return {status:response.status,body:await response.json()};}
async function dossier(verified=true){
 const id=crypto.randomUUID();await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,city,submission_number,exec01_contact_verified_at,internal_notes) values(${id},ARRAY['Terre'],'terrain','inconnu','inconnu','Adresse fictive','Camille Exemple','camille@test.invalid','Québec',1,${verified?new Date():null},'PRIVATE')`;
 expect((await call({kind:'issue',requestId:id},true)).body.delivery).toBe('captured-test');
 const link=mail.at(-1)?.text.split('Suivre ou modifier ma demande : ')[1];if(!link) throw Error('No capture');
 const params=new URLSearchParams(new URL(link).hash.slice(1));return {requestId:id,linkId:params.get('linkId'),secret:params.get('secret')};
}
async function verify(f:Awaited<ReturnType<typeof dossier>>){expect((await call({kind:'code',...f})).status).toBe(200);const code=mail.at(-1)?.text.match(/\d{6}/)?.[0];if(!code)throw Error('Missing captured code');expect((await call({kind:'verify',...f,code})).status).toBe(200);return code;}
async function read(f:Awaited<ReturnType<typeof dossier>>){const response=await call({kind:'read',...f});expect(response.status).toBe(200);return response.body;}
async function act(f:Awaited<ReturnType<typeof dossier>>,action:string,extra:Record<string,unknown>={}){const r=await read(f);return call({kind:'act',...f,action,version:r.version,operationId:crypto.randomUUID(),confirmed:true,...extra});}
beforeAll(async()=>{
 if(!enabled) return;
 await adminDb.unsafe(`CREATE DATABASE ${databaseName} ENCODING 'UTF8' TEMPLATE template0`);
 await db.unsafe(await readFile(new URL('./fixtures/exec01b-base.sql',import.meta.url),'utf8'));
 await db.unsafe(await readFile(new URL('../../prepared/exec01b/schema.sql',import.meta.url),'utf8'));
},30000);
afterAll(async()=>{await db.end();if(enabled)await adminDb.unsafe(`DROP DATABASE IF EXISTS ${databaseName}`);await adminDb.end();});
describe.skipIf(!enabled)('EXEC-01B isolated PostgreSQL',()=>{
 it('local mode cannot target a public origin',()=>{expect(isLocalServerMode('?server=local','localhost')).toBe(true);expect(isLocalServerMode('?server=local','vracquebec.ca')).toBe(false);});
 it('captures confirmation, verifies original contact by random code, modifies same CRM dossier',async()=>{
  const f=await dossier(false);expect((await call({kind:'read',...f})).status).toBe(403);const code=await verify(f);
  expect((await call({kind:'verify',...f,code})).status).toBe(403);
  const c={...unknownConditions(),total:1000,remaining:600,unit:'m3'};
  expect((await act(f,'modifier',{conditions:c})).status).toBe(200);
  const crm=await call({kind:'crm',requestId:f.requestId},true);expect(crm.body.conditions.remaining).toBe(600);expect(crm.body.history).toHaveLength(1);
  const rows=await db`select remaining_capacity,quantity_unit,status from submissions where id=${f.requestId}`;expect(rows[0]).toMatchObject({remaining_capacity:'600 m3',quantity_unit:'m3',status:'nouvelle'});
  expect((await act(f,'pause')).body.availability).toBe('suspended');expect((await act(f,'reprendre')).body.availability).toBe('a_confirmer');expect((await act(f,'confirmer')).body.availability).toBe('available');
  expect((await act(f,'fermer')).body.availability).toBe('owner_closed');
 });
 it('GET scanner and public reads make no mutations or mail',async()=>{const f=await dossier();const before=await db`select * from submission_portal_links where id=${f.linkId}`;const n=mail.length;expect((await handler(new Request('http://localhost/portal'))).status).toBe(200);await read(f);expect(await db`select * from submission_portal_links where id=${f.linkId}`).toEqual(before);expect(mail).toHaveLength(n);});
 it('refuses another dossier and invalid secret without private projection',async()=>{const a=await dossier(),b=await dossier();const r=await call({kind:'read',...a,requestId:b.requestId});expect(r.status).toBe(403);expect(JSON.stringify(r.body)).not.toContain('Camille');expect((await call({kind:'read',...a,secret:'0'.repeat(64)})).status).toBe(403);});
 it('stores bearer and six-digit code hashes only',async()=>{const f=await dossier();await verify(f);const rows=await db`select * from submission_portal_links where id=${f.linkId}`;expect(rows[0].secret_hash).toHaveLength(64);expect(rows[0].secret_hash).not.toBe(f.secret);expect(rows[0].code_hash).toBeNull();});
 it('five bad codes commit and block the valid code',async()=>{const f=await dossier();await call({kind:'code',...f});const code=mail.at(-1)?.text.match(/\d{6}/)?.[0];for(let i=0;i<5;i++)expect((await call({kind:'verify',...f,code:code==='000000'?'111111':'000000'})).status).toBe(403);expect((await call({kind:'verify',...f,code})).status).toBe(403);expect((await db`select failures from submission_portal_links where id=${f.linkId}`)[0].failures).toBe(5);});
 it('throttles repeated code delivery for 60 seconds',async()=>{const f=await dossier();expect((await call({kind:'code',...f})).status).toBe(200);const n=mail.length;expect((await call({kind:'code',...f})).status).toBe(403);expect(mail).toHaveLength(n);});
 it('requires recent verification and explicit confirmation',async()=>{const f=await dossier();expect((await act(f,'pause')).status).toBe(403);await verify(f);expect((await act(f,'pause',{confirmed:false})).status).toBe(400);await db`update submission_portal_links set verified_at=now()-interval '11 minutes' where id=${f.linkId}`;expect((await act(f,'pause')).status).toBe(403);});
 it('serializes concurrent double submissions with exactly one history entry',async()=>{const f=await dossier();await verify(f);const row=await read(f);const input={kind:'act',...f,confirmed:true,action:'pause',version:row.version,operationId:crypto.randomUUID()};const [a,b]=await Promise.all([call(input),call(input)]);expect(a.status).toBe(200);expect(b).toEqual(a);expect((await db`select count(*)::int n from submission_portal_events where submission_id=${f.requestId}`)[0].n).toBe(1);expect((await call({...input,action:'fermer'})).status).toBe(403);});
 it('optimistic locking detects an intervening CRM edit and CRM reads portal updates',async()=>{const f=await dossier();await verify(f);const row=await read(f);await db`update submissions set status='en_analyse' where id=${f.requestId}`;expect((await act(f,'pause',{version:row.version})).status).toBe(403);expect((await read(f)).status).toBe('en_analyse');});
 it('expiry, renewal to stored contact, and explicit revocation invalidate old links',async()=>{const f=await dossier();await verify(f);await db`update submission_portal_links set expires_at=now()-interval '1 second',code_requested_at=now()-interval '61 seconds' where id=${f.linkId}`;expect((await call({kind:'read',...f})).status).toBe(403);expect((await call({kind:'renew',...f})).body.delivery).toBe('captured-test');const url=mail.at(-1)?.text.split('Suivre ou modifier ma demande : ')[1];if(!url)throw Error();const p=new URLSearchParams(new URL(url).hash.slice(1));const next={requestId:f.requestId,linkId:p.get('linkId'),secret:p.get('secret')};expect((await call({kind:'read',...f})).status).toBe(403);await verify(next);expect((await call({kind:'revoke',...next,confirmed:true})).status).toBe(200);expect((await call({kind:'read',...next})).status).toBe(403);});
 it('legacy unknown conditions and preferences grant no delivery or environmental approval',async()=>{const f=await dossier();const row=await read(f);expect(row.conditions.mode).toBe('a_confirmer');expect(row.conditions.remaining).toBeNull();await verify(f);expect((await act(f,'modifier',{conditions:{...unknownConditions(),environmental:'documente'}})).status).toBe(403);const r=await act(f,'modifier',{conditions:{...unknownConditions(),mode:'preautorisee',periodStart:'2026-10-20',periodEnd:'2026-10-25',explicitConditions:'Conditions TEST'}});expect(r.body.availability).toBe('a_confirmer');expect(r.body.deliveries).toEqual([]);});
 it('denies anonymous SQL/RPC reads and unprivileged CRM endpoint',async()=>{await expect(db.begin(async tx=>{await tx`SET LOCAL ROLE anon`;return tx`select exec01_dispatch('{"kind":"crm"}'::jsonb)`;})).rejects.toThrow();await expect(db.begin(async tx=>{await tx`SET LOCAL ROLE authenticated`;return tx`select * from submission_portal_links`;})).rejects.toThrow();const f=await dossier();expect((await call({kind:'crm',requestId:f.requestId})).status).toBe(403);});
 it('history cannot be edited',async()=>{const f=await dossier();await verify(f);await act(f,'pause');await expect(db`update submission_portal_events set action='fermer' where submission_id=${f.requestId}`).rejects.toThrow('immutable_history');});
});