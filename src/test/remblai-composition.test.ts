// @vitest-environment node
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {assemble,guard,type Reference} from '../../prepared/remblai-formulaire/composition';
import {emptyParcoursDraft,publicEditPayload} from '../lib/remblai/public-form';
const enabled=process.env.REMBLAI_FORM_LOCAL==='1';
const root=postgres('postgresql://postgres@127.0.0.1:55438/postgres?sslmode=disable',{ssl:false});
const db=postgres('postgresql://postgres@127.0.0.1:55438/simple_composition?sslmode=disable',{ssl:false,max:1});
let refs:Reference[]=[],final:Reference[]=[];
beforeAll(async()=>{
 if(!enabled)return;
 const info=(await root`select current_setting('data_directory') d,inet_server_port() port`)[0];if(!String(info.d).startsWith('/tmp/remblai-form-')||info.port!==55438)throw Error('Not disposable');
 await root.unsafe('CREATE DATABASE simple_composition');
 for(const file of ['src/test/fixtures/exec01b-base.sql','src/test/fixtures/exec01c-relations.sql','prepared/exec01b/schema.sql'])await db.unsafe(await readFile(file,'utf8'));
 await db.unsafe(`ALTER TABLE submissions ADD COLUMN postal_code text,ADD COLUMN phone text,ADD COLUMN other_material text,ADD COLUMN description text,ADD COLUMN access_heavy_truck text,ADD COLUMN access_criteria text[],ADD COLUMN photos_meta jsonb,ADD COLUMN photos text[],ADD COLUMN latitude numeric,ADD COLUMN longitude numeric,ADD COLUMN formatted_address text,ADD COLUMN geocoding_status text,ADD COLUMN truck_type_key text,ADD COLUMN desired_date text,ADD COLUMN delivery_timeframe text;`);
 refs=JSON.parse(await readFile('prepared/remblai-formulaire/references/catalogue.json','utf8')).functions.filter((r:Reference)=>['exec01_dispatch(jsonb)','exec01_projection(uuid,boolean)','exec01_enqueue_confirmation(jsonb)'].includes(r.signature));
 for(const r of refs)await db.unsafe(r.definition);
 // Match observed existing rights only on the local new confirmation fixture.
 await db.unsafe('REVOKE ALL ON FUNCTION exec01_enqueue_confirmation(jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION exec01_enqueue_confirmation(jsonb) TO service_role;');
},30000);
afterAll(async()=>{await db.end();if(enabled)await root.unsafe('DROP DATABASE simple_composition');await root.end();});
describe.skipIf(!enabled)('Composition des références réelles sur base jetable',()=>{
 it('generates pinned stages, initial-link duration and exact targeted inverses',async()=>{const result=await assemble(db,refs);final=result.final;await db.unsafe(guard(final));expect(final.find(r=>r.signature==='exec01_dispatch(jsonb)')?.definition).not.toContain("interval '30 days'");expect(final.find(r=>r.signature==='exec01_enqueue_confirmation(jsonb)')?.definition).not.toContain("interval '30 days'");expect(final.find(r=>r.signature==='exec01_projection(uuid,boolean)')?.definition).toContain("'publicForm'");});
 it('queues a single initial permanent link atomically using the actual issuer with local capture',async()=>{
  await db.unsafe(`CREATE TABLE suppressed_emails(email text); CREATE TABLE email_unsubscribe_tokens(email text,used_at timestamptz); CREATE TABLE submission_portal_confirmations(submission_id uuid PRIMARY KEY,link_id uuid,queue_id bigint); CREATE TABLE local_queue(payload jsonb); CREATE FUNCTION enqueue_email(text,jsonb) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO local_queue VALUES($2); RETURN 1; END $$;`);
  const id='90000000-0000-0000-0000-000000000001',link='91000000-0000-0000-0000-000000000001';
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type,parcours_direction) values(${id},ARRAY['Terre'],'terrain','1','inconnu','Fictif','Client fictif','alpha@capture.fixture','remblai','reception')`;
  const hash=(await db`select encode(extensions.digest('alpha@capture.fixture','sha256'),'hex') h`)[0].h;
  const p={requestId:id,linkId:link,secretHash:'fake-hash',contactHash:hash,message:{text:'Capture locale sans service externe'}};
  expect((await db`select exec01_enqueue_confirmation(${db.json(p)}) r`)[0].r).toMatchObject({ok:true,queued:true});
  expect((await db`select exec01_enqueue_confirmation(${db.json(p)}) r`)[0].r).toMatchObject({ok:true,replay:true});
  expect((await db`select expires_at::text e from submission_portal_links where id=${link}`)[0].e).toBe('infinity');
  expect((await db`select count(*)::int n from local_queue`)[0].n).toBe(1);
 });
 it('refuses direct anonymous and authenticated access to the projection',async()=>{for(const role of ['anon','authenticated']){await db.unsafe('SET ROLE '+role);await expect(db.unsafe("SELECT exec01_projection('90000000-0000-0000-0000-000000000001')")).rejects.toThrow('permission denied');await db.unsafe('RESET ROLE');}});
 it('edits and reopens through the composed actual dispatcher, rejecting stale and foreign access',async()=>{
  const id='90000000-0000-0000-0000-000000000001',link='91000000-0000-0000-0000-000000000001';
  await db`update submissions set exec01_contact_verified_at=now(),exec01_verified_contact_hash=encode(extensions.digest(email,'sha256'),'hex') where id=${id}`;
  await db`update submission_portal_links set verified_at=now() where id=${link}`;
  const version=(await db`select exec01_version v from submissions where id=${id}`)[0].v;
  const form=publicEditPayload({...emptyParcoursDraft,address:'123 rue Fictive',name:'Client Fictif',phone:'4185550101',email:'alpha@capture.fixture',materials:['Terre'],quantityUnknown:true,quantityUnit:'inconnu'});
  const input={kind:'act',action:'modifier',requestId:id,linkId:link,secretHash:'fake-hash',version,operationId:crypto.randomUUID(),inputHash:'composed-edit',confirmed:true,publicForm:form};
  const saved=(await db`select exec01_dispatch(${db.json(input)}) r`)[0].r;expect(saved.id).toBe(id);expect(saved.publicForm).toMatchObject(form);
  expect((await db`select exec01_dispatch(${db.json(input)}) r`)[0].r).toEqual(saved);
  expect((await db`select exec01_dispatch(${db.json({...input,operationId:crypto.randomUUID()})}) r`)[0].r).toEqual({denied:true});
  expect((await db`select exec01_dispatch(${db.json({...input,kind:'read',secretHash:'wrong'})}) r`)[0].r).toEqual({denied:true});
  expect((await db`select exec01_dispatch(${db.json({...input,kind:'read'})}) r`)[0].r.publicForm).toMatchObject(form);
 });
 it('restores every intermediate definition without changing permissions or deleting fixtures',async()=>{for(const name of ['04-confirmation-initiale','03-formulaire','02-duree','01-renouvellement'])await db.unsafe(await readFile(`prepared/remblai-formulaire/sql-compose/RETOUR-${name}-NON-APPLIQUE.sql`,'utf8'));await db.unsafe(guard(refs));expect((await db`select count(*)::int n from submissions`)[0].n).toBe(1);expect((await db`select expires_at::text e from submission_portal_links`)[0].e).toBe('infinity');});
 it('stops on altered definition and rolls back all partial stages on error',async()=>{await db.unsafe(refs[0].definition.replace('DECLARE s','-- drift\nDECLARE s'));await expect(db.unsafe(await readFile('prepared/remblai-formulaire/sql-compose/ACTIVATION-NON-APPLIQUEE.sql','utf8'))).rejects.toThrow('REFERENCE_OR_RIGHTS_DRIFT_STOP');await db.unsafe('ROLLBACK');await db.unsafe(refs[0].definition);const activation=await readFile('prepared/remblai-formulaire/sql-compose/ACTIVATION-NON-APPLIQUEE.sql','utf8');await expect(db.unsafe(activation.replace('COMMIT;','SELECT 1/0; COMMIT;'))).rejects.toThrow();await db.unsafe('ROLLBACK');await db.unsafe(guard(refs));});
 it('refuses ACL drift without granting any wider rights',async()=>{await db.unsafe('GRANT EXECUTE ON FUNCTION exec01_projection(uuid,boolean) TO anon');await expect(db.unsafe(guard(refs))).rejects.toThrow('REFERENCE_OR_RIGHTS_DRIFT_STOP');await db.unsafe('REVOKE EXECUTE ON FUNCTION exec01_projection(uuid,boolean) FROM anon');await db.unsafe(guard(refs));});
 it('applies the complete artifact then restores exactly the original functions',async()=>{await db.unsafe(await readFile('prepared/remblai-formulaire/sql-compose/ACTIVATION-NON-APPLIQUEE.sql','utf8'));await db.unsafe(guard(final));await db.unsafe(await readFile('prepared/remblai-formulaire/sql-compose/RETOUR-COMPLET-NON-APPLIQUE.sql','utf8'));await db.unsafe(guard(refs));});
});