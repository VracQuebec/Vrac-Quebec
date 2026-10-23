// @vitest-environment node
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
const enabled=process.env.REQUEST_WORKBENCH_LOCAL==='1';
const name='workbench_'+crypto.randomUUID().replace(/-/g,'');
const root=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});
const db=postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`,{ssl:false});
const ids=Object.fromEntries(['company','otherCompany','owner','other','driverUser','driver','truck','site','request','submission','admin'].map(k=>[k,crypto.randomUUID()]));
beforeAll(async()=>{
 if(!enabled)return;
 const check=(await root`select host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') path`)[0];
 if(check.host!=='127.0.0.1'||check.port!==55439||!check.path.startsWith('/tmp/exec-correctifs/reprise-r3/'))throw Error('Isolation non prouvée');
 await root.unsafe(`CREATE DATABASE ${name} TEMPLATE template0`);
 await db.unsafe(await readFile('prepared/reprise-r3-r4/fixture.sql','utf8'));
 // Exact existing EXEC-02 reservation table/function, not a second implementation.
 const coord=await readFile('prepared/exec01b/coordination.sql','utf8');
 await db.unsafe(coord.slice(coord.indexOf('CREATE TABLE public.submission_reception_reservations'),coord.indexOf('CREATE TABLE public.submission_reception_operations')));
 const base=await readFile('src/test/fixtures/exec02-base.sql','utf8');
 await db.unsafe(base.slice(base.indexOf('CREATE TABLE request_followups'),base.indexOf('CREATE TABLE crm_notifications')));
 await db.unsafe(coord.slice(coord.indexOf('CREATE FUNCTION public.exec02_exception'),coord.indexOf('-- One service RPC')));
 await db.unsafe(await readFile('prepared/reprise-r3-r4/R4B-COMPOSITION-NON-APPLIQUEE.sql','utf8'));
 await db.unsafe(await readFile('prepared/reprise-r3-r4/INSTALLATION-NON-APPLIQUEE.sql','utf8'));
 await db`insert into jsc_companies values(${ids.company},'Fictif A'),(${ids.otherCompany},'Fictif B')`;
 await db`insert into jsc_company_members(company_id,user_id,role)values(${ids.company},${ids.owner},'proprietaire'),(${ids.otherCompany},${ids.other},'proprietaire'),(${ids.company},${ids.driverUser},'chauffeur')`;
 await db`insert into user_roles values(${ids.admin},'admin',true)`;
 await db`insert into jsc_drivers(id,company_id,user_id,is_active,archived_at) values(${ids.driver},${ids.company},${ids.driverUser},true,NULL)`;
 await db`insert into jsc_trucks(id,company_id,is_active,archived_at) values(${ids.truck},${ids.company},true,NULL)`;
 await db`insert into submissions(id,created_by,status,availability_status,materials,address,quantity_value,quantity_unit,quantity,edit_company_id,submission_number)values(${ids.submission},${ids.owner},'nouveau','available',ARRAY['Terre'],'Chantier fictif',100,'m3','100 m3',${ids.company},77)`;
 await db`insert into transport_requests(id,request_number,origin_submission_id,lifecycle_status,dump_name)values(${ids.request},'DT-TEST',${ids.submission},'confirmee','Destination fictive')`;
 await db`insert into submission_site_decisions(submission_id,site_id,status)values(${ids.submission},${ids.site},'approuvee')`;
},30000);
afterAll(async()=>{await db.end();if(enabled)await root.unsafe(`DROP DATABASE ${name}`);await root.end();});
const as=<T>(user:string,fn:(tx:postgres.TransactionSql)=>Promise<T>)=>db.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${user},true)`;await tx.unsafe('SET LOCAL ROLE authenticated');return fn(tx);});
const values=()=>({company_id:ids.company,request_id:ids.request,driver_id:ids.driver,truck_id:ids.truck,destination_id:ids.site,material:'Terre',quantity:20,unit:'m3',starts_at:'2026-11-01T13:00:00Z',instructions:'Essai fictif'});
const edit=(user:string,changes:Record<string,unknown>,version=1,key=crypto.randomUUID())=>as(user,async tx=>(await tx`select submission_edit_save(${ids.submission}::uuid,${ids.company}::uuid,${version},${tx.json(changes as postgres.JSONValue)},${key}::uuid,true) r`)[0].r);
const assign=()=>as(ids.owner,async tx=>(await tx`select requisition_assign(${ids.request}::uuid,${ids.company}::uuid,1,${tx.json(values())},${crypto.randomUUID()}::uuid,true) r`)[0].r);
const action=(user:string,a:string,version:number,key=crypto.randomUUID(),reason='Motif fictif')=>as(user,async tx=>(await tx`select requisition_action(${ids.request}::uuid,${ids.company}::uuid,${version},${a},${reason},${key}::uuid,true) r`)[0].r);
describe.skipIf(!enabled)('SQL préparé exécuté uniquement dans PostgreSQL jetable',()=>{
 it('un autre entrepreneur ne lit ni modifie le dossier',async()=>{await expect(as(ids.other,async tx=>tx`select submission_edit_read(${ids.submission}::uuid)`)).rejects.toMatchObject({code:'42501'});await expect(edit(ids.other,{quantity_value:120})).rejects.toMatchObject({code:'42501'});});
 it('les champs administratifs sont refusés sans mutation',async()=>{await expect(edit(ids.owner,{created_by:ids.other})).rejects.toThrow('Champ interdit');expect((await db`select quantity_value from submissions`)[0].quantity_value).toBe('100');});
 it('la réquisition réutilise le même identifiant et les références existantes',async()=>{const r=await assign();expect(r).toMatchObject({id:ids.request,version:2,state:'prepared'});expect(Number((await db`select count(*) n from transport_requests`)[0].n)).toBe(1);});
 it('un chauffeur étranger ne voit aucune réquisition',async()=>{expect(await as(ids.other,async tx=>(await tx`select requisition_read(${ids.company}::uuid) r`)[0].r)).toEqual([]);});
 it('transmission TEST persistante au seul chauffeur affecté, rejeu sans doublon',async()=>{const key=crypto.randomUUID();const r=await action(ids.owner,'transmit',2,key);expect(r.state).toBe('transmitted');await action(ids.owner,'transmit',2,key);expect((await db`select user_id,channel from jsc_notifications`)).toEqual([{user_id:ids.driverUser,channel:'in_app'}]);});
 it('chauffeur affecté accepte, snapshot daté préservé',async()=>{const r=await action(ids.driverUser,'accept',3);expect(r.state).toBe('accepted');const s=(await db`select requisition_accepted_snapshot s from transport_requests`)[0].s;expect(s.driver_id).toBe(ids.driver);expect(s.accepted_by).toBe(ids.driverUser);});
 it('révocation retire immédiatement lecture et actions',async()=>{await db`update jsc_company_members set is_active=false where user_id=${ids.driverUser}`;expect(await as(ids.driverUser,async tx=>(await tx`select requisition_read(${ids.company}::uuid) r`)[0].r)).toEqual([]);await expect(action(ids.driverUser,'start',4)).rejects.toMatchObject({code:'42501'});await db`update jsc_company_members set is_active=true where user_id=${ids.driverUser}`;});
 it('quantité modifiée : même dossier, historique unique, accord à revalider',async()=>{const key=crypto.randomUUID();const r=await edit(ids.owner,{quantity_value:120},1,key);expect(r).toEqual({id:ids.submission,version:2,revalidation:true});await edit(ids.owner,{quantity_value:120},1,key);expect((await db`select quantity_value,submission_number from submissions`)[0]).toEqual({quantity_value:'120',submission_number:77});expect(Number((await db`select count(*) n from ent_crm_history where entity='submission_edit'`)[0].n)).toBe(1);expect((await db`select status from submission_site_decisions`)[0].status).toBe('en_attente');expect((await db`select lifecycle_status,requisition_state from transport_requests`)[0]).toEqual({lifecycle_status:'revalidation_requise',requisition_state:'revalidation'});});
 it('accord accepté jamais silencieusement remplacé',async()=>{const s=(await db`select requisition_accepted_snapshot s from transport_requests`)[0].s;expect(s.quantity).toBe(20);await expect(action(ids.driverUser,'start',4)).rejects.toThrow();});
 it('refus, nouvelle transmission, incident et annulation conservent les événements',async()=>{
  await db.begin(async tx=>{await tx`select set_config('vq.workbench','on',true)`;await tx`update submissions set revalidation_requested_at=NULL`;await tx`update submission_site_decisions set status='approuvee'`;await tx`update transport_requests set requisition_state='transmitted',requisition_version=5`;});
  expect((await action(ids.driverUser,'refuse',5)).state).toBe('refused');
  await db.begin(async tx=>{await tx`select set_config('vq.workbench','on',true)`;await tx`update transport_requests set requisition_state='transmitted'`;});
  expect((await action(ids.driverUser,'accept',6)).state).toBe('accepted');
  expect((await action(ids.driverUser,'start',7)).state).toBe('running');
  expect((await action(ids.driverUser,'loading',8)).state).toBe('running');
  expect((await action(ids.driverUser,'arrival',9)).state).toBe('running');
  expect((await action(ids.driverUser,'incident',10)).state).toBe('incident');
  expect((await action(ids.owner,'cancel',11)).state).toBe('cancelled');
  expect((await db`select action from transport_request_events where action='requisition_incident'`)).toHaveLength(1);
 });
 it('la fin ne crée ni voyage ni débit financier et le rejeu est unique',async()=>{
  await db.begin(async tx=>{await tx`select set_config('vq.workbench','on',true)`;await tx`update transport_requests set requisition_state='running',requisition_version=13`;});
  const key=crypto.randomUUID();expect((await action(ids.driverUser,'complete',13,key)).state).toBe('completed');await action(ids.driverUser,'complete',13,key);
  expect((await db`select action from transport_request_events where action='requisition_complete'`)).toHaveLength(1);
  expect(Number((await db`select count(*) n from trips`)[0].n)).toBe(0);
 });
 it('une mise à jour directe ne contourne pas la garde des états',async()=>{await expect(db`update transport_requests set requisition_state='accepted'`).rejects.toThrow('RPC obligatoire');});
 it('deux modifications concurrentes de la même version ne sont pas écrasées',async()=>{
  await db.begin(async tx=>{await tx`select set_config('vq.workbench','on',true)`;await tx`update transport_requests set requisition_state=NULL,lifecycle_status='a_valider'`;});
  const outcome=await Promise.allSettled([edit(ids.owner,{quantity_value:130},2),edit(ids.owner,{quantity_value:140},2)]);
  expect(outcome.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcome.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await db`select edit_version from submissions`)[0].edit_version).toBe(3);
 });
 it('version périmée et clé rejouée avec contenu différent sont refusées',async()=>{await expect(edit(ids.owner,{quantity_value:130},1)).rejects.toMatchObject({code:'P0409'});});
 it('le super admin relit le même dossier et la notification exacte',async()=>{const r=await as(ids.admin,async tx=>(await tx`select submission_edit_read(${ids.submission}::uuid) r`)[0].r);expect(r.id).toBe(ids.submission);expect([130,140]).toContain(r.values.quantity_value);expect(r.version).toBe(3);expect((await db`select entity_id from crm_notifications where entity_type='submission'`)[0].entity_id).toBe(ids.submission);});
 it('une demande close et une entreprise révoquée refusent toute édition',async()=>{await db`update submissions set status='terminee'`;await expect(edit(ids.owner,{quantity_value:140},3)).rejects.toThrow('non modifiable');await db`update submissions set status='nouveau'`;await db`update jsc_company_members set is_active=false where user_id=${ids.owner}`;await expect(edit(ids.owner,{quantity_value:140},3)).rejects.toMatchObject({code:'42501'});});
 it('la nouvelle association ne peut pas être choisie par un entrepreneur',async()=>{await expect(as(ids.owner,async tx=>tx`select submission_edit_bind(${ids.submission}::uuid,${ids.otherCompany}::uuid,true,'Fictif')`)).rejects.toMatchObject({code:'42501'});});
 it('annulation ou refus ne valent ni livraison ni acceptation nouvelle',async()=>{await expect(action(ids.driverUser,'accept',14)).rejects.toThrow('Transition interdite');expect((await db`select requisition_accepted_snapshot from transport_requests`)[0].requisition_accepted_snapshot.quantity).toBe(20);});
 it('R4B : accord réservé libéré, snapshot conservé et rejeu sans deuxième effet',async()=>{
  await db`update jsc_company_members set is_active=true where user_id=${ids.owner}`;
  const reservation=crypto.randomUUID();const snapshot={quantity:20,unit:'m3',acceptedBy:'proprietaire'};
  await db`insert into submission_reception_reservations(id,submission_id,origin_submission_id,offer_id,quantity,unit,starts_at,ends_at,expires_at,state,fingerprint,evaluation,offer_snapshot,conditions_snapshot,accepted_at)values(${reservation},${ids.submission},${ids.submission},${crypto.randomUUID()},20,'m3',now(),now()+interval '1 hour',now()+interval '2 hours','reserved','f','{}','{}',${db.json(snapshot)},now())`;
  const key=crypto.randomUUID();await edit(ids.owner,{access_instructions:'Nouvelles consignes'},3,key);await edit(ids.owner,{access_instructions:'Nouvelles consignes'},3,key);
  const r=(await db`select state,conditions_snapshot,accepted_history from submission_reception_reservations where id=${reservation}`)[0];
  expect(r).toEqual({state:'exception',conditions_snapshot:null,accepted_history:[snapshot]});
  expect(Number((await db`select coalesce(sum(quantity),0) n from submission_reception_reservations where state='reserved'`)[0].n)).toBe(0);
  expect((await db`select action from ent_crm_history where entity='submission_reservation'`)).toHaveLength(1);
  expect((await db`select next_action from request_followups where entity_id=${ids.submission}`)[0].next_action).toContain('nouvelle proposition explicite');
 });
 it('R4B : erreur notification annule atomiquement modification et invalidation',async()=>{
  const reservation=crypto.randomUUID();await db`insert into submission_reception_reservations(id,submission_id,origin_submission_id,offer_id,quantity,unit,starts_at,ends_at,expires_at,state,fingerprint,evaluation,offer_snapshot)values(${reservation},${ids.submission},${ids.submission},${crypto.randomUUID()},30,'m3',now(),now()+interval '1 hour',now()+interval '2 hours','pending','f','{}','{}')`;
  await db.unsafe(`CREATE FUNCTION local_notify_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'capture indisponible';END$$;CREATE TRIGGER notify_failure BEFORE INSERT ON crm_notifications FOR EACH ROW EXECUTE FUNCTION local_notify_fail()`);
  await expect(edit(ids.owner,{quantity_value:180},4)).rejects.toThrow('capture indisponible');
  expect((await db`select state from submission_reception_reservations where id=${reservation}`)[0].state).toBe('pending');
  expect((await db`select edit_version from submissions`)[0].edit_version).toBe(4);
  await db.unsafe('DROP TRIGGER notify_failure ON crm_notifications');
 });
 it('admin non approuvé et chauffeur ne deviennent jamais gestionnaires',async()=>{
  await db`update user_roles set approved=false where user_id=${ids.admin}`;
  await expect(as(ids.admin,async tx=>tx`select submission_edit_read(${ids.submission}::uuid)`)).rejects.toMatchObject({code:'42501'});
  expect(await as(ids.driverUser,async tx=>(await tx`select workbench_manager(${ids.company}::uuid) allowed`)[0].allowed)).toBe(false);
  await db`update user_roles set approved=true where user_id=${ids.admin}`;
 });
});