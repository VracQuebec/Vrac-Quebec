// @vitest-environment node
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {emptyParcoursDraft,publicEditPayload,publicEditSchema,publicStepError} from '../lib/remblai/public-form';
import {prepareOriginalPhotos,signOriginalPhotos} from '../../prepared/remblai-formulaire/photos';
import {assertSavedRequest} from '../lib/remblai/service';
import {makeEndpoint} from '../../prepared/exec01b/endpoint';
const enabled=process.env.REMBLAI_FORM_LOCAL==='1';
const db=postgres('postgresql://postgres@127.0.0.1:55438/postgres?sslmode=disable',{ssl:false});
const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
const la='20000000-0000-0000-0000-000000000001',lb='20000000-0000-0000-0000-000000000002';
const initial={...emptyParcoursDraft,address:'123 rue Fictive, Québec',postalCode:'G1A 1A1',quantityValue:'3.5',quantityUnit:'m3',projectUsage:'Projet fictif',materials:['Terre','Autre'],otherMaterial:'Petites roches',accessHeavyTruck:'oui',accessDetails:['sol_mou'],name:'Camille Fictif',phone:'4185550101',email:'camille@test.invalid',notes:'Première ligne\nSeconde ligne'};
let originalProjection='',originalDispatcher='';
async function rpc(p:Record<string,unknown>){return (await db`select public.exec01_dispatch(${db.json(p as postgres.JSONValue)}) r`)[0].r;}
async function edit(form=publicEditPayload(initial),extra:Record<string,unknown>={}) {
 const v=(await db`select exec01_version v from submissions where id=${a}`)[0].v;
 return rpc({kind:'act',action:'modifier',requestId:a,linkId:la,secretHash:'hash-a',version:v,confirmed:true,operationId:crypto.randomUUID(),inputHash:crypto.randomUUID(),publicForm:form,...extra});
}
describe('Contrat du formulaire original',()=>{
 it('requires the same address length of five characters',()=>{expect(publicStepError('address',{...initial,address:'abcd'})).toBeTruthy();expect(publicStepError('address',{...initial,address:'abcde'})).toBeNull();});
 it('requires at least one material',()=>{expect(publicStepError('material',{...initial,materials:[]})).toBeTruthy();});
 it('requires name, ten-digit phone and valid email',()=>{for(const patch of [{name:'A'},{phone:'123'},{email:'invalid'}])expect(publicStepError('contact',{...initial,...patch})).toBeTruthy();});
 it('permits optional blank project, postal code, access and photos',()=>{expect(publicEditSchema.safeParse(publicEditPayload({...initial,projectUsage:'',postalCode:'',accessDetails:[],photos:[]})).success).toBe(true);});
 it('rejects identifiers and administrative fields in editable payload',()=>{for(const key of ['id','owner_id','status','company_id','priority'])expect(publicEditSchema.safeParse({...publicEditPayload(initial),[key]:'forbidden'}).success).toBe(false);});
 it('retains notes, material details and conditional access without conversions',()=>{expect(publicEditPayload(initial)).toMatchObject({quantityValue:'3.5',quantityUnit:'m3',notes:initial.notes,otherMaterial:'Petites roches',accessDetails:['sol_mou']});});
 it('rejects an invalid quantity instead of claiming it is saved',()=>{expect(publicEditSchema.safeParse({...publicEditPayload(initial),quantityValue:'3..2'}).success).toBe(false);});
 it('blocks malformed decimals in the shared quantity step',()=>{expect(publicStepError('quantity',{...initial,quantityValue:'3..2'})).toBeTruthy();expect(publicStepError('quantity',{...initial,quantityValue:'3,5'})).toBeNull();});
 it('never confirms an empty, failed or other-dossier save response',()=>{for(const value of [null,{}, {ok:true},{denied:true},{id:b,version:2,conditions:{},proposals:[],deliveries:[]},{id:a,version:1,conditions:{},proposals:[],deliveries:[]}])expect(()=>assertSavedRequest(value,a,1)).toThrow();expect(()=>assertSavedRequest({id:a,version:2,conditions:{},proposals:[],deliveries:[]},a,1)).not.toThrow();});
 it('does not trust a private photo from another dossier even if already listed',async()=>{const p={url:`private:submissions/${b}/${'a'.repeat(64)}.png`,category:'chantier'};await expect(prepareOriginalPhotos(a,[p],[p])).rejects.toThrow('hors dossier');});
 it('uploads a new photo locally and signs without persisting the signature',async()=>{const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';let uploaded='';const storage={put:async(path:string)=>{uploaded=path;},sign:async()=> 'https://test.invalid/signed'};const photos=await prepareOriginalPhotos(a,[{url:png,category:'chantier'}],[],storage);expect(uploaded).toContain(`submissions/${a}/`);expect(photos[0].url).toBe('private:'+uploaded);const read=await signOriginalPhotos(a,photos,storage);expect(read[0].signedUrl).toBe('https://test.invalid/signed');expect(photos[0]).not.toHaveProperty('signedUrl');});
 it('retains a canonical photo when signing fails',async()=>{const p={url:`private:submissions/${a}/${'a'.repeat(64)}.png`,category:'chantier'};expect(await signOriginalPhotos(a,[p],{put:async()=>{},sign:async()=>{throw Error('Unavailable');}})).toEqual([p]);});
 it('rejects a photo URL from another dossier',async()=>{await expect(prepareOriginalPhotos(a,[{url:'https://test.invalid/b.jpg',category:'chantier'}],[{url:'https://test.invalid/a.jpg',category:'acces'}])).rejects.toThrow();});
 it('preserves original photo and category without upload or URL replacement',async()=>{const p={url:'https://test.invalid/a.jpg',category:'acces'};expect(await prepareOriginalPhotos(a,[p],[p])).toEqual([p]);});
 it('rejects protected input at endpoint before any RPC',async()=>{let called=false;const handler=makeEndpoint({portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid',isAdmin:async()=>false,rpc:async()=>{called=true;return{};},captureOrSend:async()=>{throw Error('Forbidden');}});const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({kind:'act',requestId:a,linkId:la,secret:'a'.repeat(64),action:'modifier',confirmed:true,operationId:crypto.randomUUID(),version:1,publicForm:{...publicEditPayload(initial),status:'approved'}})}));expect(response.status).toBe(400);expect(called).toBe(false);});
 it('refuses non-atomic code and link delivery before any mutation',async()=>{let calls=0;const handler=makeEndpoint({portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid',isAdmin:async()=>true,rpc:async()=>{calls++;return{};},captureOrSend:async()=>{calls++;return 'sent';}});for(const kind of ['issue','renew','code']){const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(kind==='issue'?{kind,requestId:a}:{kind,requestId:a,linkId:la,secret:'a'.repeat(64)})}));expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('ok',true);}expect(calls).toBe(0);});
 it('refuses a local-harness bypass on a hosted origin before any mutation',async()=>{let calls=0;const handler=makeEndpoint({localHarness:true,portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid',isAdmin:async()=>true,rpc:async()=>{calls++;return{};},captureOrSend:async()=> 'captured-test'});const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({kind:'issue',requestId:a})}));expect(response.status).toBe(503);await response.text();expect(calls).toBe(0);});
});
beforeAll(async()=>{
 if(!enabled)return;
 const info=(await db`select current_setting('data_directory') d,inet_server_addr()::text host,inet_server_port() port`)[0];
 if(!String(info.d).startsWith('/tmp/remblai-form-')||!['127.0.0.1','127.0.0.1/32'].includes(info.host)||info.port!==55438)throw Error('Not disposable local database');
 for(const path of ['src/test/fixtures/exec01b-base.sql','src/test/fixtures/exec01c-relations.sql'])await db.unsafe(await readFile(path,'utf8'));
 await db.unsafe(`ALTER TABLE submissions ADD COLUMN postal_code text,ADD COLUMN phone text,ADD COLUMN other_material text,ADD COLUMN description text,ADD COLUMN access_heavy_truck text,ADD COLUMN access_criteria text[],ADD COLUMN photos_meta jsonb,ADD COLUMN photos text[],ADD COLUMN latitude numeric,ADD COLUMN longitude numeric,ADD COLUMN formatted_address text,ADD COLUMN geocoding_status text,ADD COLUMN truck_type_key text,ADD COLUMN desired_date text,ADD COLUMN delivery_timeframe text;`);
 await db.unsafe(await readFile('prepared/exec01b/schema.sql','utf8'));
 originalProjection=(await db`select pg_get_functiondef('exec01_projection(uuid,boolean)'::regprocedure) d`)[0].d;
 originalDispatcher=(await db`select pg_get_functiondef('exec01_dispatch(jsonb)'::regprocedure) d`)[0].d;
 await db.unsafe(await readFile('prepared/remblai-formulaire/formulaire-NON-APPLIQUE.sql','utf8'));
 for(const [id,email,link,hash] of [[a,initial.email,la,'hash-a'],[b,'autre@test.invalid',lb,'hash-b']]) {
 await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type,parcours_direction,postal_code,phone,quantity_value,quantity_unit,other_material,access_heavy_truck,access_criteria,photos_meta,description,internal_notes,latitude,longitude,geocoding_status)
 values(${id},${initial.materials},${initial.projectUsage},'3.5 m³','',${initial.address},${initial.name},${email},'remblai','reception',${initial.postalCode},${initial.phone},3.5,'m3',${initial.otherMaterial},'oui',ARRAY['sol_mou'],${db.json([{url:'https://test.invalid/a.jpg',category:'acces'}])},${'Résumé conservé\nNotes du demandeur : '+initial.notes},'ADMIN SECRET',46,-71,'ok')`;
 await rpc({kind:'issue',requestId:id,linkId:link,secretHash:hash});
 await db`update submissions set exec01_contact_verified_at=now(),exec01_verified_contact_hash=encode(extensions.digest(lower(trim(email)),'sha256'),'hex') where id=${id}`;
 await db`update submission_portal_links set verified_at=now() where id=${link}`;
 }
},30000);
afterAll(async()=>{await db.end();});
describe.skipIf(!enabled)('PostgreSQL jetable — formulaire personnel',()=>{
 it('projects all values from the original intake including photo category and multiline notes',async()=>{const r=await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'});expect(r.publicForm).toMatchObject({...initial,lat:46,lng:-71,photos:[{url:"https://test.invalid/a.jpg",category:"acces"}]});expect(r.publicForm.photos).toEqual([{url:'https://test.invalid/a.jpg',category:'acces'}]);expect(r.publicForm).not.toHaveProperty('internal_notes');});
 it('saves through the actual endpoint, then reopens the exact dossier',async()=>{
  const secret='a'.repeat(64);const hash=await import('../lib/remblai/service').then(m=>m.digest(secret));await db`update submission_portal_links set secret_hash=${hash} where id=${la}`;
  const handler=makeEndpoint({portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid',isAdmin:async()=>false,captureOrSend:async()=>{throw Error('No mail');},rpc});
  const version=(await db`select exec01_version v from submissions where id=${a}`)[0].v;
  const form=publicEditPayload({...initial,name:'Camille Endpoint'});
  const input={kind:'act',requestId:a,linkId:la,secret,action:'modifier',confirmed:true,operationId:crypto.randomUUID(),version,publicForm:form};
  const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(input)}));expect(response.status).toBe(200);const saved=await response.json();expect(saved.id).toBe(a);expect(saved.publicForm).toMatchObject(form);
  const replay=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(input)}));expect(await replay.json()).toEqual(saved);
  const reopened=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({kind:'read',requestId:a,linkId:la,secret})}));expect((await reopened.json()).publicForm).toMatchObject(form);
  const denied=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({...input,requestId:b,operationId:crypto.randomUUID()})}));expect(denied.status).toBe(403);
  await db`update submission_portal_links set secret_hash='hash-a' where id=${la}`;
 });
 it('preserves historical unmarked notes and all undisplayed values on a single-field edit',async()=>{
  await db`update submissions set description='Historique sans marqueur fiable',truck_type_key='legacy-truck',desired_date='2027-01-01',delivery_timeframe='legacy-delay' where id=${a}`;
  const read=await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'});expect(read.publicForm.unavailableFields).toEqual(['notes']);expect(read.publicForm.notes).toBe('');
  const form=publicEditPayload({...read.publicForm,phone:'4185550202'});expect((await edit(form)).publicForm.phone).toBe('4185550202');
  expect((await db`select description,truck_type_key,desired_date,delivery_timeframe from submissions where id=${a}`)[0]).toEqual({description:'Historique sans marqueur fiable',truck_type_key:'legacy-truck',desired_date:'2027-01-01',delivery_timeframe:'legacy-delay'});
  expect(await edit({...form,notes:'Invented'})).toEqual({denied:true});
  await db`update submissions set description=${'Résumé conservé\nNotes du demandeur : '+initial.notes} where id=${a}`;
 });
 it('records several edits and reads them back while preserving other request and protected fields',async()=>{const other=(await db`select to_jsonb(s) r from submissions s where id=${b}`)[0].r;const f=publicEditPayload({...initial,address:'456 rue Fictive, Lévis',name:'Camille Modifié',quantityValue:'8',quantityUnit:'tonnes',projectUsage:'Nouveau projet',materials:['Sable'],otherMaterial:'',accessDetails:['recul_limite'],notes:'Notes modifiées\nDeuxième ligne'});const result=await edit(f);expect(result.publicForm).toMatchObject(f);const reopened=await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'});expect(reopened.publicForm).toMatchObject(f);expect((await db`select to_jsonb(s) r from submissions s where id=${b}`)[0].r).toEqual(other);const protectedRow=(await db`select email,status,internal_notes,latitude,longitude from submissions where id=${a}`)[0];expect(protectedRow).toEqual({email:initial.email,status:'nouveau',internal_notes:'ADMIN SECRET',latitude:null,longitude:null});});
 it('rejects another dossier and leaves both records unchanged',async()=>{const before=await db`select to_jsonb(s) r from submissions s order by id`;expect(await edit(undefined,{requestId:b})).toEqual({denied:true});expect(await db`select to_jsonb(s) r from submissions s order by id`).toEqual(before);});
 it('rejects an identity email change without mutation',async()=>{const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;expect(await edit({...publicEditPayload(initial),email:'autre@test.invalid'})).toEqual({denied:true});expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);});
 it('refuses incomplete or null original form input without clearing any existing data',async()=>{
  const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;
  for(const key of ['postalCode','quantityValue','materials','photos','notes','accessDetails']) {
   const form:Record<string,unknown>={...publicEditPayload(initial)};delete form[key];
   expect(await edit(undefined,{publicForm:form})).toEqual({denied:true});
   expect(await edit(undefined,{publicForm:{...publicEditPayload(initial),[key]:null}})).toEqual({denied:true});
  }
  expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);
 });
 it('rejects writes without recent verification',async()=>{await db`update submission_portal_links set verified_at=now()-interval '11 minutes' where id=${la}`;const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;expect(await edit()).toEqual({denied:true});expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);await db`update submission_portal_links set verified_at=now() where id=${la}`;});
 it('rejects missing, null and stale versions without mutation',async()=>{const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;for(const version of [null,undefined,0,before.exec01_version-1])expect(await edit(undefined,{version})).toEqual({denied:true});expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);});
 it('requires verification of this link even when the dossier contact is already verified',async()=>{await db`update submission_portal_links set verified_at=null where id=${la}`;expect(await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'})).toEqual({denied:true});await db`update submission_portal_links set verified_at=now() where id=${la}`;expect((await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'})).id).toBe(a);});
 it('rolls back a server error before commit and allows the same retry',async()=>{const version=(await db`select exec01_version v from submissions where id=${a}`)[0].v;const input={kind:'act',action:'modifier',requestId:a,linkId:la,secretHash:'hash-a',version,confirmed:true,operationId:crypto.randomUUID(),inputHash:'transaction-error',publicForm:publicEditPayload(initial)};const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;await expect(db.begin(async tx=>{await tx`select exec01_dispatch(${tx.json(input)})`;throw Error('Injected pre-commit error');})).rejects.toThrow('Injected pre-commit error');expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);const result=await rpc(input);expect(result.version).toBe(version+1);expect((await db`select count(*)::int n from submission_portal_events where submission_id=${a} and version=${result.version}`)[0].n).toBe(1);});
 it('persists unknown quantity and optional blank fields without inventing values',async()=>{const r=await edit(publicEditPayload({...initial,quantityUnknown:true,quantityValue:'',postalCode:'',projectUsage:'',accessHeavyTruck:'',accessDetails:[],photos:[],notes:''}));expect(r.publicForm).toMatchObject({quantityUnknown:true,quantityValue:'',quantityUnit:'inconnu',postalCode:'',projectUsage:'',photos:[],notes:''});});
 it('reads absent photos and access through exact legacy fallback',async()=>{await db`update submissions set photos_meta=null,photos=null,access_criteria=null,access_details=null where id=${a}`;const r=await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'});expect(r.publicForm.photos).toEqual([]);expect(r.publicForm.accessDetails).toEqual([]);});
 it('uses stored legacy photo references when JSON metadata is null, without inventing emptiness',async()=>{
  await db`update submissions set photos_meta='null'::jsonb,photos=ARRAY['https://test.invalid/legacy.jpg'],access_criteria=null,access_details='{"photos":null,"criteres":null}'::jsonb where id=${a}`;
  const read=await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'});expect(read.publicForm.photos).toEqual([{url:'https://test.invalid/legacy.jpg',category:'autre'}]);expect(read.publicForm.accessDetails).toEqual([]);
  const form=publicEditPayload({...read.publicForm,name:'Camille Photo conservée'});await edit(form);
  expect((await db`select photos from submissions where id=${a}`)[0].photos).toEqual(['https://test.invalid/legacy.jpg']);
 });
 it('retains the private photo deletion barrier without any dossier mutation',async()=>{
  await db.unsafe('CREATE TABLE public.exec01_photo_files(path text,state text);');
  const url=`private:submissions/${a}/${'c'.repeat(64)}.png`;
  await db`insert into exec01_photo_files(path,state) values(${url.slice(8)},'deleting')`;
  const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;
  expect(await edit(publicEditPayload({...initial,photos:[{url,category:'chantier'}]}))).toEqual({denied:true});
  expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);
 });
 it('recovers the committed result after a lost endpoint response, without duplicate history',async()=>{
  const secret='a'.repeat(64);const hash=await import('../lib/remblai/service').then(m=>m.digest(secret));await db`update submission_portal_links set secret_hash=${hash} where id=${la}`;
  try {
   const version=(await db`select exec01_version v from submissions where id=${a}`)[0].v;
   const form=publicEditPayload({...initial,phone:'4185550303'});const input={kind:'act',requestId:a,linkId:la,secret,action:'modifier',confirmed:true,operationId:crypto.randomUUID(),version,publicForm:form};
   let fail=true;const handler=makeEndpoint({portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid',isAdmin:async()=>false,captureOrSend:async()=>{throw Error('No mail');},rpc:async p=>{const result=await rpc(p);if(p.kind==='act'&&fail){fail=false;throw Error('Lost response');}return result;}});
   const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(input)}));expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('ok',true);
   const retry=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(input)}));expect(retry.status).toBe(200);const saved=await retry.json();expect(saved.publicForm).toMatchObject(form);assertSavedRequest(saved,a,version);
   expect((await db`select count(*)::int n from submission_portal_events where submission_id=${a} and version=${saved.version}`)[0].n).toBe(1);
   await db`update submission_portal_links set verified_at=null where id=${la}`;
   expect((await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(input)}))).status).toBe(403);
   await db`update submission_portal_links set verified_at=now() where id=${la}`;
  } finally {await db`update submission_portal_links set secret_hash='hash-a' where id=${la}`;}
 });
 it('replays concurrent identical edits once and preserves reception conditions',async()=>{const version=(await db`select exec01_version v from submissions where id=${a}`)[0].v;const before=(await db`select reception_conditions c from submission_fill_profile where submission_id=${a}`)[0]?.c;const input={kind:'act',action:'modifier',requestId:a,linkId:la,secretHash:'hash-a',version,confirmed:true,operationId:crypto.randomUUID(),inputHash:'same',publicForm:publicEditPayload(initial)};const [first,second]=await Promise.all([rpc(input),rpc(input)]);expect(first).toEqual(second);expect(first.version).toBe(version+1);expect((await db`select count(*)::int n from submission_portal_events where submission_id=${a} and version=${version+1}`)[0].n).toBe(1);expect((await db`select reception_conditions c from submission_fill_profile where submission_id=${a}`)[0]?.c).toEqual(before);});
 it('allows only one of two simultaneous distinct edits at the same version',async()=>{const version=(await db`select exec01_version v from submissions where id=${a}`)[0].v;const common={kind:'act',action:'modifier',requestId:a,linkId:la,secretHash:'hash-a',version,confirmed:true,publicForm:publicEditPayload(initial)};const results=await Promise.all([rpc({...common,operationId:crypto.randomUUID(),inputHash:'concurrent-one'}),rpc({...common,operationId:crypto.randomUUID(),inputHash:'concurrent-two'})]);expect(results.filter(r=>r.denied===true)).toHaveLength(1);expect(results.filter(r=>r.version===version+1)).toHaveLength(1);expect((await db`select count(*)::int n from submission_portal_events where submission_id=${a} and version=${version+1}`)[0].n).toBe(1);});
 it('requires confirmation for closure, denies another dossier, retains history and keeps closed dossier readable',async()=>{
  const version=(await db`select exec01_version v from submissions where id=${a}`)[0].v;
  const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;
  const other=(await db`select to_jsonb(s) r from submissions s where id=${b}`)[0].r;
  const input={kind:'act',action:'fermer',requestId:a,linkId:la,secretHash:'hash-a',version,confirmed:true,operationId:crypto.randomUUID(),inputHash:'close'};
  expect(await rpc({...input,confirmed:false})).toEqual({denied:true});expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);
  expect(await rpc({...input,requestId:b})).toEqual({denied:true});expect((await db`select to_jsonb(s) r from submissions s where id=${b}`)[0].r).toEqual(other);
  const history=(await db`select count(*)::int n from submission_portal_events where submission_id=${a}`)[0].n;
  const closed=await rpc(input);expect(closed.availability).toBe('owner_closed');expect(closed.status).toBe(before.status);expect(closed.id).toBe(a);
  const read=await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'});expect(read.publicForm).toEqual(closed.publicForm);expect(read.availability).toBe('owner_closed');
  expect((await db`select count(*)::int n from submission_portal_events where submission_id=${a}`)[0].n).toBe(history+1);
  expect(await edit()).toEqual({denied:true});expect((await db`select description,photos,email from submissions where id=${a}`)[0]).toEqual({description:before.description,photos:before.photos,email:before.email});
 });
 it('refuses revoked and wrong secrets',async()=>{expect(await rpc({kind:'read',requestId:a,linkId:la,secretHash:'wrong'})).toEqual({denied:true});await db`update submission_portal_links set revoked_at=now() where id=${la}`;expect(await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'})).toEqual({denied:true});});
 it('stops on second patch and restores exactly both original definitions locally',async()=>{await expect(db.unsafe(await readFile('prepared/remblai-formulaire/formulaire-NON-APPLIQUE.sql','utf8'))).rejects.toThrow('unexpected_reference_STOP');await db.unsafe(originalProjection);await db.unsafe(originalDispatcher);expect((await db`select pg_get_functiondef('exec01_projection(uuid,boolean)'::regprocedure) d`)[0].d).toBe(originalProjection);expect((await db`select pg_get_functiondef('exec01_dispatch(jsonb)'::regprocedure) d`)[0].d).toBe(originalDispatcher);});
});