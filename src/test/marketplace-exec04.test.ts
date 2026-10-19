// @vitest-environment node
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import postgres from 'postgres';
import {createLocal} from '../../prepared/exec04/local-db';
import {makeCommunicationEndpoint} from '../../prepared/exec04/endpoint';
import {matchesSegment,permitted,type NetworkContact} from '../lib/marketplace/communications';
import {digest,randomSecret} from '../lib/remblai/service';
import {targetedMessageAllowed} from '../../prepared/exec04/queue-guard';
const c:NetworkContact={id:'a',name:'Fictif',scope:'network',audience:'owner',sector:'Québec',materials:['Terre'],remaining:80,unit:'m3',availability:'available',confirmedAt:'2026-10-19T10:00:00Z',trade:null,activeAt:null,features:[]};
describe('EXEC04 business rules',()=>{
 it('private entrepreneur customers excluded even matching sector',()=>expect(matchesSegment({...c,scope:'private',companyId:'other'},{sector:'Québec'})).toBe(false));
 it('unknown permission never authorizes promotion',()=>expect(permitted(null,'promotion','email')).toBe(false));
 it('withdrawal never authorizes promotion',()=>expect(permitted({purpose:'promotion',channel:'email',state:'withdrawn',source:'test',proof:'yes',at:'2026-01-01',expiresAt:null},'promotion','email')).toBe(false));
 it('remaining quantities require original unit',()=>{expect(matchesSegment(c,{remainingMin:70,unit:'tonnes'})).toBe(false);expect(matchesSegment(c,{remainingMin:70,unit:'m3'})).toBe(true);});
 it('unknown activity/features never inferred',()=>expect(matchesSegment({...c,audience:'entrepreneur'},{feature:'carte'})).toBe(false));
});
const enabled=process.env.EXEC01B_LOCAL_TEST==='1';let local:Awaited<ReturnType<typeof createLocal>>;
beforeAll(async()=>{if(enabled)local=await createLocal();},30000);
afterAll(async()=>{if(!enabled)return;await local.db.end();const root=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});await root.unsafe(`DROP DATABASE ${local.name}`);await root.end();});
const p=(kind:string,data:any={})=>local.rpc({kind,role:'admin',actorId:local.ids.admin,operationId:crypto.randomUUID(),inputHash:crypto.randomUUID(),confirmed:true,...data});
describe.skipIf(!enabled)('EXEC04 same SQL isolated',()=>{
 it('owner with no explicit network provenance is excluded server-side',async()=>{const {db,ids}=local;await db`update submissions set exec04_network_enrolled_at=NULL where id=${ids.unknown}`;expect((await p('network')).some((c:any)=>c.id===ids.unknown)).toBe(false);expect((await db`select exec04_contact('owner',${ids.unknown}::uuid) c`)[0].c).toBeNull();});
 it('unknown permission excluded and withdrawal does not close request',async()=>{const {db,ids}=local;expect((await db`select exec04_permission('alex@test.invalid','promotion') ok`)[0].ok).toBe(false);await p('permission',{audience:'owner',subjectId:ids.owner,purpose:'promotion',channel:'email',state:'granted',proof:'Fictional explicit choice',source:'test'});await p('permission',{audience:'owner',subjectId:ids.owner,purpose:'promotion',channel:'email',state:'withdrawn',source:'test'});expect((await db`select exec04_permission('camille@test.invalid','promotion') ok`)[0].ok).toBe(false);expect((await db`select availability_status from submissions where id=${ids.owner}`)[0].availability_status).toBe('available');});
 it('campaign replay does not duplicate persistent recipient',async()=>{const {ids,db}=local;const ca=await p('campaign_save',{name:'Reconfirmation',template:'reconfirmation',frequencyHours:24,segment:{audience:'owner'}});const data={campaignId:ca.id,recipients:[{id:ids.owner,audience:'owner'},{id:ids.unknown,audience:'owner'}]};await p('prepare',data);await p('prepare',data);expect(Number((await db`select count(*) n from mkt_promo_sends where campaign=${ca.id}`)[0].n)).toBe(1);});
 it('foreign company cannot read selected partner private share',async()=>{await expect(p('partner_list',{role:'partner',actorId:local.ids.foreignUser,companyId:local.ids.company})).rejects.toThrow();});
 it('partner outside sector omitted',async()=>{const rows=(await p('services',{requestId:local.ids.owner})).available;expect(rows.map((r:any)=>r.companyId)).toEqual([local.ids.company]);});
 it('owner refused share does not create sharing permission',async()=>{const {ids,db}=local;const created=await p('service_create',{requestId:ids.owner,categoryId:ids.category,title:'Drainage fictif',description:'Terrain à qualifier'});await p('service_action',{serviceId:created.id,action:'qualify',qualification:'Besoin confirmé'});await db`insert into submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at,verified_at) values(${crypto.randomUUID()},${ids.owner},'fake','fake',now()+interval '1 day',now())`;await expect(p('service_action',{role:'owner',requestId:ids.owner,serviceId:created.id,action:'share',partnerId:ids.foreignCompany})).rejects.toThrow();expect((await db`select exec04_permission('camille@test.invalid','partner_share',now(),${ids.company}::uuid,${created.id}::uuid) ok`)[0].ok).toBe(false);});
 it('cancelled commission cannot acquire and creates no second finance entry',async()=>{const {ids,db}=local;const id=crypto.randomUUID();await db`insert into mkt_commissions(id,company_id,status,amount,rule_snapshot) values(${id},${ids.company},'a_confirmer',NULL,'{}')`;await p('commission',{commissionId:id,action:'cancel',reason:'Annulation du prospect'});await expect(p('commission',{commissionId:id,action:'acquire',event:'result'})).rejects.toThrow();expect((await db`select status from mkt_commissions where id=${id}`)[0].status).toBe('annulee');expect(Number((await db`select count(*) n from fin_expected_inflows`)[0].n)).toBe(0);});
 it('queue failure rolls back link and message, retry captured once',async()=>{const {ids,db}=local;const ca=(await p('campaign_list')).campaigns.find((x:any)=>x.name==='Reconfirmation');const claim=await p('campaign_claim',{campaignId:ca.id});expect(claim.render).toBe(true);const nextId=crypto.randomUUID();const q={campaignId:ca.id,messageId:claim.id,nextId,nextHash:'hash',message:{to:'camille@test.invalid',capture_only:true,html:'capture'}};await db`update local_queue_failure set enabled=true`;await expect(p('campaign_claim',q)).rejects.toThrow();expect(Number((await db`select count(*) n from submission_portal_links where id=${nextId}`)[0].n)).toBe(0);await db`update local_queue_failure set enabled=false`;await p('campaign_claim',q);expect(Number((await db`select count(*) n from local_email_capture where payload->>'idempotency_key'=${claim.key}`)[0].n)).toBe(1);});
 it('shared endpoint rejects role forgery and GET has no mutation',async()=>{let calls=0;const e=makeCommunicationEndpoint({enabled:true,local:true,origin:'http://localhost:8080',authenticate:async()=>null,rpc:async()=>{calls++;return {};}});expect((await e(new Request('http://localhost/communications',{method:'POST',body:JSON.stringify({kind:'network',role:'admin'})}))).status).toBe(400);expect((await e(new Request('http://localhost/communications'))).status).toBe(200);expect(calls).toBe(0);});
 it('verified owner refuses then permits only the selected in-sector partner, quote persisted once',async()=>{
  const {ids,db}=local;const linkId=crypto.randomUUID(),secret=randomSecret();await db`insert into submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at,verified_at) values(${linkId},${ids.owner},${await digest(secret)},${await digest('camille@test.invalid')},now()+interval '1 day',now())`;
  const own=(kind:string,data:any)=>p(kind,{role:'owner',actorId:linkId,requestId:ids.owner,linkId,secretHash:undefined,...data});
  const creds={secretHash:await digest(secret)};
  const created=await own('service_create',{...creds,categoryId:ids.category,title:'Excavation terrain',description:'Besoin local fictif'});
  await p('service_action',{serviceId:created.id,action:'qualify',qualification:'Besoin et secteur confirmés'});
  await own('service_action',{...creds,serviceId:created.id,action:'refuse_share',partnerId:ids.company});
  expect(await p('partner_list',{role:'partner',actorId:ids.partner,companyId:ids.company})).toEqual([]);
  await expect(own('service_action',{...creds,serviceId:created.id,action:'share',partnerId:ids.foreignCompany,proof:'Choix explicite'})).rejects.toThrow('hors secteur');
  await own('service_action',{...creds,serviceId:created.id,action:'share',partnerId:ids.company,proof:'Choix explicite limité au besoin et au partenaire choisi'});
  const list=await p('partner_list',{role:'partner',actorId:ids.partner,companyId:ids.company});expect(list[0].shared).toEqual({name:'Camille Exemple',email:'camille@test.invalid',city:'Québec',need:'Besoin local fictif'});
  const quote={role:'partner',actorId:ids.partner,companyId:ids.company,serviceId:created.id,action:'quote',amount:123,response:'Soumission fictive documentée',operationId:crypto.randomUUID(),inputHash:'same'};
  await p('service_action',quote);await p('service_action',quote);expect(Number((await db`select count(*) n from mkt_bids where request_id=${created.id}`)[0].n)).toBe(1);
  await p('agreement',{ruleId:ids.rule,agreement:{basis:'Soumission acceptée',trigger:'result',attribution:'Autorisation du besoin et partenaire sélectionné',dueDate:null,rate:null,fixed:null}});
  await p('service_action',{serviceId:created.id,action:'result',response:'Projet terminé fictif',ruleId:ids.rule});
  const commissions=await db`select * from mkt_commissions where request_id=${created.id}`;expect(commissions.length).toBe(1);expect(commissions[0].amount).toBeNull();
  await own('service_action',{...creds,serviceId:created.id,action:'cancel',reason:'Projet annulé'});expect((await db`select status from mkt_commissions where request_id=${created.id}`)[0].status).toBe('annulee');
 });
 it('partner cannot modify network consent; unrelated dossier refused',async()=>{
  await expect(p('permission',{role:'partner',actorId:local.ids.partner,audience:'owner',subjectId:local.ids.owner,purpose:'promotion',channel:'email',state:'granted',source:'fake',proof:'fake'})).rejects.toThrow();
  await expect(p('services',{role:'owner',actorId:crypto.randomUUID(),requestId:local.ids.unknown,linkId:crypto.randomUUID(),secretHash:'wrong'})).rejects.toThrow();
 });
 it('capture-only queue payload never reaches provider and withdrawn queued contact excluded',async()=>{
  let calls=0;expect(await targetedMessageAllowed({exec04_guard:{},capture_only:true},async()=>{calls++;return true;})).toBe(false);expect(calls).toBe(0);
  const {db}=local;const msg=(await db`select id,email from mkt_promo_sends where state='queued' limit 1`)[0];
  await db`update mkt_consents set permission_state='withdrawn',withdrawn_at=now() where email=${msg.email} and scope='service'`;
  expect((await db`select exec04_message_current(${db.json({to:msg.email,exec04_guard:{messageId:msg.id}})}) ok`)[0].ok).toBe(false);
 });
 it('queued capture recovers without a new link or message',async()=>{
  const {ids,db}=local;await db`update mkt_consents set permission_state='granted',withdrawn_at=NULL where email='camille@test.invalid' and scope='service'`;
  const m=(await db`select * from mkt_promo_sends where queue_id is not null limit 1`)[0];
  const before=Number((await db`select count(*) n from submission_portal_links`)[0].n);
  const recovered=await p('campaign_claim',{campaignId:m.campaign});expect(recovered.recover).toBe(true);
  expect(Number((await db`select count(*) n from submission_portal_links`)[0].n)).toBe(before);
  expect(Number((await db`select count(*) n from local_email_capture where id=${m.queue_id}`)[0].n)).toBe(1);
 });
 it('finance link reads invoice and actual receipts without creating another inflow',async()=>{
  const {ids,db}=local;const id=crypto.randomUUID(),invoice=crypto.randomUUID();
  await db`insert into mkt_commissions(id,company_id,status,amount) values(${id},${ids.company},'a_facturer',55)`;
  await db`insert into fin_invoices values(${invoice},${ids.company},'emise',55,55,${'mkt_commission:'+id},now())`;
  await db`insert into fin_expected_inflows values(${crypto.randomUUID()},${invoice},0)`;
  await p('finance_link',{commissionId:id,invoiceId:invoice,billingCompanyId:ids.company});
  expect((await db`select status from mkt_commissions where id=${id}`)[0].status).toBe('facturee');
  await db`update fin_expected_inflows set received=55 where invoice_id=${invoice}`;
  expect((await p('commissions')).commissions.find((x:any)=>x.id===id).financialState).toBe('payee');
  await expect(p('commission',{commissionId:id,action:'cancel',reason:'Annuler deux fois'})).rejects.toThrow('note de crédit');
  expect(Number((await db`select count(*) n from fin_expected_inflows where invoice_id=${invoice}`)[0].n)).toBe(1);
 });
 it('promotion withdrawal token blocks promotion but preserves service permission',async()=>{
  const {ids,db}=local;await p('permission',{audience:'owner',subjectId:ids.owner,purpose:'promotion',channel:'email',state:'granted',source:'formulaire_TEST',proof:'Choix explicite'});
  await db`insert into email_unsubscribe_tokens values('camille@test.invalid','fictif',now())`;
  expect((await db`select exec04_permission('camille@test.invalid','promotion') ok`)[0].ok).toBe(false);
  expect((await db`select exec04_permission('camille@test.invalid','service') ok`)[0].ok).toBe(true);
 });
 it('offer and appointment broadcasts never invent a compatible offer or confirmed booking',async()=>{
  const ca=await p('campaign_save',{name:'Aucun rendez-vous inventé',template:'appointment',frequencyHours:1,segment:{audience:'owner'}});
  await p('prepare',{campaignId:ca.id,recipients:[{id:local.ids.owner,audience:'owner'}]});
  expect(Number((await local.db`select count(*) n from mkt_promo_sends where campaign=${ca.id}`)[0].n)).toBe(0);
 });
});