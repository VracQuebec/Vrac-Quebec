import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {unknownConditions} from '../../src/lib/remblai/conditions';
export const scripts=['src/test/fixtures/exec01b-base.sql','src/test/fixtures/exec01c-relations.sql','src/test/fixtures/exec02-base.sql','prepared/exec01b/schema.sql','prepared/exec01b/quota.sql','prepared/exec01b/coordination.sql','prepared/exec01b/lifecycle.sql','prepared/exec04/local-fixture.sql','prepared/exec03/geography.sql','prepared/exec04/schema.sql'];
export async function createLocal(){
 const name='exec04_'+crypto.randomUUID().replace(/-/g,'');
 const root=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});
 const isolation=(await root`select host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') path`)[0];
 if(isolation.host!=='127.0.0.1'||Number(isolation.port)!==55439||!isolation.path.startsWith('/tmp/exec-correctifs/')){await root.end();throw Error('Disposable cluster isolation not proven');}
 await root.unsafe(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);await root.end();
 const db=postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`,{ssl:false});
 for(const f of scripts)await db.unsafe(await readFile(f,'utf8'));
 const admin=crypto.randomUUID(),partner=crypto.randomUUID(),foreignUser=crypto.randomUUID(),company=crypto.randomUUID(),foreignCompany=crypto.randomUUID(),owner=crypto.randomUUID(),unknown=crypto.randomUUID(),entrepreneur=crypto.randomUUID(),category=crypto.randomUUID(),rule=crypto.randomUUID();
 for(const [id,label] of [[company,'Excavation Fictive — TEST'],[foreignCompany,'Partenaire hors secteur — TEST']])await db`insert into jsc_companies values(${id},${label})`;
 await db`insert into jsc_company_members(company_id,user_id,role) values(${company},${partner},'proprietaire'),(${foreignCompany},${foreignUser},'proprietaire'),(${company},${admin},'comptabilite')`;
 for(const [id,name,email] of [[owner,'Camille Exemple','camille@test.invalid'],[unknown,'Alex Sans permission','alex@test.invalid']]){
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,city,request_type,parcours_direction,exec01_contact_verified_at,exec01_owner_confirmed_at) values(${id},ARRAY['Terre'],'terrain','100','inconnu','Adresse fictive',${name},${email},'Québec','remblai','reception',now(),now())`;
  await db`insert into submission_fill_profile(submission_id,reception_conditions) values(${id},${db.json({...unknownConditions(),total:100,remaining:80,unit:'m3',materials:[{name:'Terre',stance:'accepte'}]})})`;
  await db`update submissions set exec04_network_enrolled_at=now() where id=${id}`;
 }
 await db`insert into entrepreneurs(id,name,company,email,city,user_id,exec04_network_facts) values(${entrepreneur},'Jules Exemple','Entrepreneur Fictif','jules@test.invalid','Québec',${partner},${db.json({trade:'excavation',activeAt:new Date().toISOString(),features:['carte','comparateur']})})`;
 await db`insert into mkt_service_categories(id,name,slug) values(${category},'Excavation','excavation')`;
 for(const [id,name,city] of [[company,'Excavation Fictive — TEST','Québec'],[foreignCompany,'Partenaire hors secteur — TEST','Gatineau']]){
  await db`insert into mkt_partners(company_id,trade_name,city,is_public,onboarding_status) values(${id},${name},${city},true,'approuve')`;
  await db`insert into mkt_partner_services(company_id,category_id) values(${id},${category})`;
  await db`insert into mkt_partner_territories(company_id,scope,city) values(${id},'ville',${city})`;
 }
 await db`insert into mkt_pricing_rules(id,label,model,status,agreement) values(${rule},'Entente à compléter — aucun taux','entente_personnalisee','brouillon',${db.json({basis:null,trigger:null,attribution:null,dueDate:null,rate:null,fixed:null})})`;
 // Existing consent record; explicit fictitious operational permission, not inherited from address.
 await db`insert into mkt_consents(email,scope,consent_text,consent_version,sender_snapshot,source,subject_type,subject_id) values('camille@test.invalid','service','Recevoir le suivi opérationnel de ma demande.','exec04-v1','{}','formulaire_vérifié','owner',${owner})`;
 const rpc=async(p:Record<string,unknown>)=>(await db`select exec04_dispatch(${db.json({testMode:true,...p} as any)}) result`)[0].result;
 return {name,db,rpc,ids:{admin,partner,foreignUser,company,foreignCompany,owner,unknown,entrepreneur,category,rule}};
}