// @vitest-environment node
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {emptyParcoursDraft,publicEditPayload,publicEditSchema,publicStepError} from '../lib/remblai/public-form';
import {prepareOriginalPhotos} from '../../prepared/remblai-formulaire/photos';
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
 it('rejects a photo URL from another dossier',async()=>{await expect(prepareOriginalPhotos(a,[{url:'https://test.invalid/b.jpg',category:'chantier'}],[{url:'https://test.invalid/a.jpg',category:'acces'}])).rejects.toThrow();});
 it('preserves original photo and category without upload or URL replacement',async()=>{const p={url:'https://test.invalid/a.jpg',category:'acces'};expect(await prepareOriginalPhotos(a,[p],[p])).toEqual([p]);});
 it('rejects protected input at endpoint before any RPC',async()=>{let called=false;const handler=makeEndpoint({portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid',isAdmin:async()=>false,rpc:async()=>{called=true;return{};},captureOrSend:async()=>{throw Error('Forbidden');}});const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({kind:'act',requestId:a,linkId:la,secret:'a'.repeat(64),action:'modifier',confirmed:true,operationId:crypto.randomUUID(),version:1,publicForm:{...publicEditPayload(initial),status:'approved'}})}));expect(response.status).toBe(400);expect(called).toBe(false);});
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
 it('records several edits and reads them back while preserving other request and protected fields',async()=>{const other=(await db`select to_jsonb(s) r from submissions s where id=${b}`)[0].r;const f=publicEditPayload({...initial,address:'456 rue Fictive, Lévis',name:'Camille Modifié',quantityValue:'8',quantityUnit:'tonnes',projectUsage:'Nouveau projet',materials:['Sable'],otherMaterial:'',accessDetails:['recul_limite'],notes:'Notes modifiées\nDeuxième ligne'});const result=await edit(f);expect(result.publicForm).toMatchObject(f);const reopened=await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'});expect(reopened.publicForm).toMatchObject(f);expect((await db`select to_jsonb(s) r from submissions s where id=${b}`)[0].r).toEqual(other);const protectedRow=(await db`select email,status,internal_notes,latitude,longitude from submissions where id=${a}`)[0];expect(protectedRow).toEqual({email:initial.email,status:'nouveau',internal_notes:'ADMIN SECRET',latitude:null,longitude:null});});
 it('rejects another dossier and leaves both records unchanged',async()=>{const before=await db`select to_jsonb(s) r from submissions s order by id`;expect(await edit(undefined,{requestId:b})).toEqual({denied:true});expect(await db`select to_jsonb(s) r from submissions s order by id`).toEqual(before);});
 it('rejects an identity email change without mutation',async()=>{const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;expect(await edit({...publicEditPayload(initial),email:'autre@test.invalid'})).toEqual({denied:true});expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);});
 it('rejects writes without recent verification',async()=>{await db`update submission_portal_links set verified_at=now()-interval '11 minutes' where id=${la}`;const before=(await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r;expect(await edit()).toEqual({denied:true});expect((await db`select to_jsonb(s) r from submissions s where id=${a}`)[0].r).toEqual(before);await db`update submission_portal_links set verified_at=now() where id=${la}`;});
 it('persists unknown quantity and optional blank fields without inventing values',async()=>{const r=await edit(publicEditPayload({...initial,quantityUnknown:true,quantityValue:'',postalCode:'',projectUsage:'',accessHeavyTruck:'',accessDetails:[],photos:[],notes:''}));expect(r.publicForm).toMatchObject({quantityUnknown:true,quantityValue:'',quantityUnit:'inconnu',postalCode:'',projectUsage:'',photos:[],notes:''});});
 it('refuses revoked and wrong secrets',async()=>{expect(await rpc({kind:'read',requestId:a,linkId:la,secretHash:'wrong'})).toEqual({denied:true});await db`update submission_portal_links set revoked_at=now() where id=${la}`;expect(await rpc({kind:'read',requestId:a,linkId:la,secretHash:'hash-a'})).toEqual({denied:true});});
 it('stops on second patch and restores exactly both original definitions locally',async()=>{await expect(db.unsafe(await readFile('prepared/remblai-formulaire/formulaire-NON-APPLIQUE.sql','utf8'))).rejects.toThrow('unexpected_reference_STOP');await db.unsafe(originalProjection);await db.unsafe(originalDispatcher);expect((await db`select pg_get_functiondef('exec01_projection(uuid,boolean)'::regprocedure) d`)[0].d).toBe(originalProjection);expect((await db`select pg_get_functiondef('exec01_dispatch(jsonb)'::regprocedure) d`)[0].d).toBe(originalDispatcher);});
});