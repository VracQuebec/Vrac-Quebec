// @vitest-environment node
// Parcours réel d'un particulier JAMAIS vérifié (cas de production), sur PostgreSQL local vide.
// Courriels capturés en mémoire seulement (adresses .invalid); aucun service hébergé.
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {makeEndpoint,type Message} from '../../prepared/exec01b/endpoint';
import {unknownConditions} from '../lib/remblai/conditions';
const enabled=process.env.EXEC01B_LOCAL_TEST==='1';
const name=`exec01lien_${crypto.randomUUID().replace(/-/g,'')}`;
const admin=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});
const db=postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`,{ssl:false});
const mail:Message[]=[];
const handler=makeEndpoint({enabled:true,portalOrigin:'http://localhost:8080',corsOrigin:'http://localhost:8080',localHarness:true,
 isAdmin:async r=>r.headers.get('authorization')==='Bearer local-test-admin',
 captureOrSend:async m=>{if(!m.to.endsWith('.invalid'))throw Error('Real send forbidden');mail.push(m);return 'captured-test';},
 rpc:async p=>{const rows=await db`select exec01_dispatch(${db.json(p as postgres.JSONValue)}) result`;return rows[0].result;}});
async function call(p:Record<string,unknown>,trusted=false){const r=await handler(new Request('http://localhost/portal',{method:'POST',headers:trusted?{authorization:'Bearer local-test-admin'}:{},body:JSON.stringify(p)}));const text=await r.text();return {status:r.status,body:JSON.parse(text),text};}
const linkFrom=(m:Message|undefined)=>{const url=m?.text.split('Suivre ou modifier ma demande : ')[1];if(!url)throw Error('No capture');const h=new URLSearchParams(new URL(url).hash.slice(1));return {requestId:h.get('requestId')!,linkId:h.get('linkId')!,secret:h.get('secret')!};};
async function dossier(email='particulier@test.invalid'){
 const id=crypto.randomUUID();
 await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type,parcours_direction,quantity_value,quantity_unit) values(${id},ARRAY['Terre'],'terrain','500','inconnu','Fictif','Exemple',${email},'remblai','reception',500,'m3')`;
 await call({kind:'issue',requestId:id},true);
 return linkFrom(mail.at(-1));
}
async function code(f:Record<string,unknown>){expect((await call({...f,kind:'code'})).status).toBe(200);return mail.at(-1)!.text.match(/\d{6}/)![0];}
async function verify(f:Record<string,unknown>){const c=await code(f);expect((await call({...f,kind:'verify',code:c})).status).toBe(200);}
const count=async()=>Number((await db`select count(*) n from submissions`)[0].n);
beforeAll(async()=>{if(!enabled)return;await admin.unsafe(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);for(const path of ['./fixtures/exec01b-base.sql','./fixtures/exec01c-relations.sql','../../prepared/exec01b/schema.sql','../../prepared/exec01b/quota.sql'])await db.unsafe(await readFile(new URL(path,import.meta.url),'utf8'));},30000);
afterAll(async()=>{await db.end();if(enabled)await admin.unsafe(`DROP DATABASE ${name}`);await admin.end();});
describe.skipIf(!enabled)('lien personnel remblai — particulier jamais vérifié',()=>{
 it('le lien reçu, enregistré et lu concordent : 1re ouverture → code → bonne demande',async()=>{
  const f=await dossier();
  const stored=(await db`select secret_hash from submission_portal_links where id=${f.linkId}`)[0].secret_hash;
  const {digest}=await import('../lib/remblai/service');expect(stored).toBe(await digest(f.secret));
  expect((await call({...f,kind:'read'})).status).toBe(403); // vérification requise d'abord
  await verify(f);
  const r=await call({...f,kind:'read'});expect(r.status).toBe(200);expect(r.body.id).toBe(f.requestId);
 });
 it('code incorrect refusé et compté; code expiré refusé',async()=>{
  const f=await dossier();await code(f);
  expect((await call({...f,kind:'verify',code:'000000'})).status).toBe(403);
  expect((await db`select failures from submission_portal_links where id=${f.linkId}`)[0].failures).toBe(1);
  await db`update submission_portal_links set code_expires_at=now()-interval '1 second' where id=${f.linkId}`;
  const c=mail.at(-1)!.text.match(/\d{6}/)![0];expect((await call({...f,kind:'verify',code:c})).status).toBe(403);
 });
 it('renvoi du code limité à un par minute',async()=>{
  const f=await dossier();await code(f);
  expect((await call({...f,kind:'code'})).status).toBe(403);
  await db`update submission_portal_links set code_requested_at=now()-interval '61 seconds' where id=${f.linkId}`;
  expect((await call({...f,kind:'code'})).status).toBe(200);
 });
 it('lien expiré AVANT toute vérification : renouvellement vers l’adresse du dossier, sans nouvelle demande',async()=>{
  const f=await dossier();const before=await count();
  await db`update submission_portal_links set expires_at=now()-interval '1 second',created_at=now()-interval '31 days' where id=${f.linkId}`;
  expect((await call({...f,kind:'code'})).status).toBe(403);
  const sent=mail.length;expect((await call({...f,kind:'renew'})).status).toBe(200);
  expect(mail.length).toBe(sent+1);expect(mail.at(-1)!.to).toBe('particulier@test.invalid');
  const next=linkFrom(mail.at(-1));expect(next.requestId).toBe(f.requestId);expect(next.linkId).not.toBe(f.linkId);
  expect((await call({...f,kind:'read'})).status).toBe(403); // ancien lien révoqué
  await verify(next);expect((await call({...next,kind:'read'})).body.id).toBe(f.requestId);
  expect(await count()).toBe(before);
 });
 it('renouvellement limité : pas deux liens en une minute, 5 liens par 24 h',async()=>{
  const f=await dossier();
  expect((await call({...f,kind:'renew'})).status).toBe(403); // lien créé il y a moins d'une minute
  let cur=f;
  for(let i=0;i<4;i++){await db`update submission_portal_links set created_at=now()-interval '2 minutes' where submission_id=${f.requestId}`;expect((await call({...cur,kind:'renew'})).status).toBe(200);cur=linkFrom(mail.at(-1));}
  await db`update submission_portal_links set created_at=now()-interval '2 minutes' where submission_id=${f.requestId}`;
  expect((await call({...cur,kind:'renew'})).status).toBe(403);
 });
 it('jeton invalide ou révoqué : aucune donnée privée, aucun renouvellement',async()=>{
  const f=await dossier();
  const bad=await call({...f,kind:'read',secret:'b'.repeat(64)});expect(bad.status).toBe(403);expect(bad.text).not.toContain('Exemple');
  await verify(f);expect((await call({...f,kind:'revoke',confirmed:true})).status).toBe(200);
  expect((await call({...f,kind:'read'})).status).toBe(403);expect((await call({...f,kind:'renew'})).status).toBe(403);
 });
 it('deux demandes du même client : liens indépendants, aucun croisement',async()=>{
  const a=await dossier('meme@test.invalid'),b=await dossier('meme@test.invalid');
  await verify(a);
  expect((await call({...a,requestId:b.requestId,kind:'read'})).status).toBe(403);
  expect((await call({...b,requestId:a.requestId,kind:'read'})).status).toBe(403);
  expect((await call({...b,kind:'read'})).status).toBe(403); // b non vérifié par le code de a
  await verify(b);expect((await call({...b,kind:'read'})).body.id).toBe(b.requestId);
 });
 it('modification autorisée enregistrée dans la même demande; double soumission sans doublon',async()=>{
  const f=await dossier();await verify(f);const before=await count();
  const row=(await call({...f,kind:'read'})).body;
  const p={...f,kind:'act',confirmed:true,action:'modifier',version:row.version,operationId:crypto.randomUUID(),conditions:{...row.conditions,hours:'Lundi au vendredi 7 h – 17 h'}};
  const [x,y]=await Promise.all([call(p),call(p)]);expect(x.status).toBe(200);expect(y.status).toBe(200);
  expect((await db`select opening_hours from submissions where id=${f.requestId}`)[0].opening_hours).toBe('Lundi au vendredi 7 h – 17 h');
  expect(Number((await db`select count(*) n from submission_portal_events where submission_id=${f.requestId}`)[0].n)).toBe(1);
  expect(await count()).toBe(before);
 });
 it('champs interdits refusés : validation environnementale, champs hors formulaire',async()=>{
  const f=await dossier();await verify(f);const row=(await call({...f,kind:'read'})).body;
  const base={...f,kind:'act',confirmed:true,action:'modifier',version:row.version};
  expect((await call({...base,operationId:crypto.randomUUID(),conditions:{...row.conditions,environmental:'valide'}})).status).not.toBe(200);
  expect((await call({...base,operationId:crypto.randomUUID(),conditions:row.conditions,status:'acceptee',email:'autre@test.invalid'})).status).toBe(400);
  expect((await db`select email from submissions where id=${f.requestId}`)[0].email).toBe('particulier@test.invalid');
 });
 it('aucune réponse ne renvoie le jeton ni le code',async()=>{
  const f=await dossier();const r=await call({...f,kind:'code'});const c=mail.at(-1)!.text.match(/\d{6}/)![0];
  expect(r.text).not.toContain(f.secret);expect(r.text).not.toContain(c);
  const v=await call({...f,kind:'verify',code:c});expect(v.text).not.toContain(f.secret);
  void unknownConditions;
 });
});
