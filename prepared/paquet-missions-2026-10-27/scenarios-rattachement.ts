// Scénarios fictifs de la chaîne EXEC-02 → éditeur → missions R4D, exécutés UNIQUEMENT sur la
// réplique structurelle isolée (127.0.0.1:55450, base copiée du modèle « pk »). Aucune donnée réelle.
import postgres from 'postgres';
import { makeCoordinationEndpoint } from '../exec01b/coordination-endpoint';
import { unknownConditions } from '../../src/lib/remblai/conditions';
import { digest } from '../../src/lib/remblai/service';

const HOST = '127.0.0.1', PORT = 55450;
const name = 'scn_' + crypto.randomUUID().replaceAll('-', '');
const root = postgres(`postgresql://postgres@${HOST}:${PORT}/postgres?sslmode=disable`, { ssl: false, onnotice: () => {} });
const iso = (await root`select inet_server_addr()::text a, current_setting('data_directory') d`)[0];
if (!String(iso.d).startsWith('/tmp/rep/')) throw Error('Isolation non prouvée : arrêt');
await root.unsafe(`CREATE DATABASE ${name} TEMPLATE pk`);
const db = postgres(`postgresql://postgres@${HOST}:${PORT}/${name}?sslmode=disable`, { ssl: false, onnotice: () => {}, max: 6 });

const results: { ok: boolean; name: string; detail?: string }[] = [];
const check = (n: string, ok: boolean, detail?: unknown) => { results.push({ ok, name: n, detail: ok ? undefined : JSON.stringify(detail) }); };
const rejects = async (n: string, p: Promise<unknown>, code?: string) => {
  try { await p; check(n, false, 'accepté'); } catch (e: any) { check(n, !code || e.code === code, e.code + ' ' + e.message); }
};
const as = <T>(uid: string, fn: (tx: any) => Promise<T>) => db.begin(async (tx: any) => {
  await tx`select set_config('role','authenticated',true), set_config('request.jwt.claim.sub',${uid},true), set_config('request.jwt.claim.role','authenticated',true)`;
  return fn(tx);
}) as Promise<T>;
const u = () => crypto.randomUUID();

// --- Rattachement des demandes (fichier 11) — identités et dossiers fictifs seulement
const admin = u(), mgrA = u(), mgrB = u(), multi = u(), driverU = u();
const cA = u(), cB = u();
try {
  await db`insert into auth.users(id,email,email_confirmed_at) values (${admin},'admin@test.invalid',now()),(${mgrA},'a@test.invalid',now()),(${mgrB},'b@test.invalid',now()),(${multi},'m@test.invalid',now()),(${driverU},'c@test.invalid',now())`;
  await db`insert into user_roles(user_id,role,approved) values(${admin},'admin',true)`;
  await db`insert into jsc_companies(id,code,name) values(${cA},'TA','TEST A'),(${cB},'TB','TEST B')`;
  await db`insert into jsc_company_members(company_id,user_id,role) values(${cA},${mgrA},'proprietaire'),(${cB},${mgrB},'gestionnaire'),(${cA},${multi},'gestionnaire'),(${cB},${multi},'gestionnaire'),(${cA},${driverU},'chauffeur')`;
  const ins = (uid: string | null, mail: string) => uid
    ? as(uid, (tx) => tx`insert into submissions(materials,property_type,quantity,tonnage,address,name,email,request_type) values(ARRAY['Terre'],'terrain','10','inconnu','1 rue Fictive','TEST',${mail},'remblai') returning id, created_by, edit_company_id, creation_origin`)
    : db.begin(async (tx: any) => { await tx`select set_config('role','anon',true)`; return tx`insert into submissions(materials,property_type,quantity,tonnage,address,name,email,request_type) values(ARRAY['Terre'],'terrain','10','inconnu','1 rue Fictive','TEST',${mail},'remblai') returning id`; });

  // 1. Particulier sans session
  const pub = (await ins(null, 'p@test.invalid'))[0];
  const pubRow = (await db`select created_by, edit_company_id from submissions where id=${pub.id}`)[0];
  check('Particulier sans compte : aucun auteur ni entreprise', pubRow.created_by === null && pubRow.edit_company_id === null, pubRow);
  // 2. Entrepreneur connecté, une seule entreprise
  const a = (await ins(mgrA, 'a@test.invalid'))[0];
  const aRow = (await db`select created_by, edit_company_id from submissions where id=${a.id}`)[0];
  check('Entrepreneur connecté : auteur = session', aRow.created_by === mgrA, aRow);
  check('Entrepreneur connecté : entreprise autorisée unique enregistrée', aRow.edit_company_id === cA, aRow);
  check('Journal : auteur enregistré par le serveur', (await db`select count(*)::int n from submission_ownership_events where submission_id=${a.id} and action='auteur_session_enregistre'`)[0].n === 1);
  check('Éditeur : l’auteur lit sa nouvelle demande', (await as(mgrA, (tx) => tx`select submission_edit_read(${a.id}::uuid) r`))[0].r.id === a.id);
  await rejects('Éditeur : autre entreprise refusée', as(mgrB, (tx) => tx`select submission_edit_read(${a.id}::uuid)`), '42501');
  // 3. Plusieurs entreprises : pas de choix automatique
  const m = (await ins(multi, 'm@test.invalid'))[0];
  const mRow = (await db`select created_by, edit_company_id from submissions where id=${m.id}`)[0];
  check('Plusieurs entreprises : auteur gardé, entreprise NON devinée', mRow.created_by === multi && mRow.edit_company_id === null, mRow);
  // 4. Chauffeur connecté (pas gestionnaire) : rien
  const d = (await ins(driverU, 'c@test.invalid'))[0];
  check('Chauffeur connecté : aucune attribution', (await db`select created_by from submissions where id=${d.id}`)[0].created_by === null);
  // 5. Falsification : un client ne peut pas imposer auteur/entreprise
  await rejects('Falsification : entreprise imposée à la création refusée', as(mgrB, (tx) => tx`insert into submissions(materials,property_type,quantity,tonnage,address,name,email,request_type,edit_company_id) values(ARRAY['Terre'],'terrain','10','inconnu','1 rue Fictive','TEST','b@test.invalid','remblai',${cA})`));
  const forged = (await as(mgrB, (tx) => tx`insert into submissions(materials,property_type,quantity,tonnage,address,name,email,request_type,created_by) values(ARRAY['Terre'],'terrain','10','inconnu','1 rue Fictive','TEST','b@test.invalid','remblai',${mgrA}) returning id`))[0];
  check('Falsification : auteur imposé remplacé par la session', (await db`select created_by from submissions where id=${forged.id}`)[0].created_by === mgrB);

  // 6. Ancienne demande sans auteur : demande de vérification
  const old = u();
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type) values(${old},ARRAY['Terre'],'terrain','10','inconnu','Ancienne','Jean TEST','a@test.invalid','remblai')`;
  check('Ancienne demande : même courriel que le gestionnaire mais AUCUN rattachement automatique', (await db`select created_by, edit_company_id from submissions where id=${old}`)[0].edit_company_id === null);
  await rejects('Ancienne demande non rattachée : éditeur refusé', as(mgrA, (tx) => tx`select submission_edit_read(${old}::uuid)`), '42501');
  check('État affiché : non rattachée', (await as(mgrA, (tx) => tx`select submission_ownership_status(${old}::uuid) r`))[0].r.state === 'non_rattachee');
  const r1 = (await as(mgrA, (tx) => tx`select submission_ownership_request(${old}::uuid,${cA}::uuid,'Dossier du chantier rue Fictive') r`))[0].r;
  const r2 = (await as(mgrA, (tx) => tx`select submission_ownership_request(${old}::uuid,${cA}::uuid,'Doublon') r`))[0].r;
  check('Demande de vérification enregistrée une seule fois', r1.ok && r2.ok && (await db`select count(*)::int n from submission_ownership_requests where submission_id=${old}`)[0].n === 1);
  check('État affiché : vérification en attente', (await as(mgrA, (tx) => tx`select submission_ownership_status(${old}::uuid) r`))[0].r.state === 'verification_en_attente');
  const ghost = (await as(mgrA, (tx) => tx`select submission_ownership_request(${u()}::uuid,${cA}::uuid,'') r`))[0].r;
  check('Dossier inexistant : même réponse, aucune écriture (pas d’énumération)', ghost.state === 'verification_en_attente' && (await db`select count(*)::int n from submission_ownership_requests`)[0].n === 1);
  await rejects('Demande au nom d’une autre entreprise refusée', as(mgrB, (tx) => tx`select submission_ownership_request(${old}::uuid,${cA}::uuid,'')`), '42501');
  check('Gestionnaire B ne voit pas la demande de A', (await as(mgrB, (tx) => tx`select id from submission_ownership_requests`)).length === 0);
  const req = (await db`select id from submission_ownership_requests where submission_id=${old}`)[0].id;
  await rejects('Décision par un non-administrateur refusée', as(mgrA, (tx) => tx`select submission_ownership_decide(${req}::uuid,true,'document_signe','REF-1','')`), '42501');
  await rejects('Approbation sans preuve refusée', as(admin, (tx) => tx`select submission_ownership_decide(${req}::uuid,true,NULL,'','')`));
  await rejects('Approbation avec preuve non reconnue (« même courriel ») refusée', as(admin, (tx) => tx`select submission_ownership_decide(${req}::uuid,true,'meme_courriel','x@y','')`));
  await as(admin, (tx) => tx`select submission_ownership_decide(${req}::uuid,true,'confirmation_ecrite_client','TEST-CONF-001','Confirmé par écrit (fictif)')`);
  const oRow = (await db`select created_by, edit_company_id from submissions where id=${old}`)[0];
  check('Approbation : auteur et entreprise rattachés', oRow.created_by === mgrA && oRow.edit_company_id === cA, oRow);
  check('Approbation : journal figé avec preuve', (await db`select detail->>'proof_reference' p from submission_ownership_events where request_id=${req} and action='rattachement_approuve'`)[0]?.p === 'TEST-CONF-001');
  check('Après rattachement : l’éditeur lit le dossier', (await as(mgrA, (tx) => tx`select submission_edit_read(${old}::uuid) r`))[0].r.id === old);
  await rejects('Journal non modifiable', db`update submission_ownership_events set action='x' where request_id=${req}`);
  await rejects('Seconde décision refusée', as(admin, (tx) => tx`select submission_ownership_decide(${req}::uuid,false,NULL,NULL,'non')`));

  // 7. Refus avec motif
  const old2 = u();
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type) values(${old2},ARRAY['Terre'],'terrain','10','inconnu','Ancienne 2','TEST','z@test.invalid','remblai')`;
  await as(mgrB, (tx) => tx`select submission_ownership_request(${old2}::uuid,${cB}::uuid,'')`);
  const req2 = (await db`select id from submission_ownership_requests where submission_id=${old2}`)[0].id;
  await rejects('Refus sans motif refusé', as(admin, (tx) => tx`select submission_ownership_decide(${req2}::uuid,false,NULL,NULL,'')`));
  await as(admin, (tx) => tx`select submission_ownership_decide(${req2}::uuid,false,NULL,NULL,'Aucune preuve fournie')`);
  check('Refus : dossier inchangé, état « refusée »', (await db`select edit_company_id from submissions where id=${old2}`)[0].edit_company_id === null && (await as(mgrB, (tx) => tx`select submission_ownership_status(${old2}::uuid) r`))[0].r.state === 'verification_refusee');

  // 8. Particulier avec portail sécurisé : jamais rattachable
  const priv = u();
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type) values(${priv},ARRAY['Terre'],'terrain','10','inconnu','Particulier','TEST','part@test.invalid','remblai')`;
  await db`insert into submission_portal_links(submission_id,secret_hash,contact_hash,expires_at) values(${priv},'h','c',now()+interval '30 days')`;
  await as(mgrA, (tx) => tx`select submission_ownership_request(${priv}::uuid,${cA}::uuid,'')`);
  check('Particulier avec portail : aucune demande enregistrée, portail intact', (await db`select count(*)::int n from submission_ownership_requests where submission_id=${priv}`)[0].n === 0 && (await db`select count(*)::int n from submission_portal_links where submission_id=${priv} and revoked_at is null`)[0].n === 1);

  // 9. Demandeur révoqué avant décision
  const old3 = u();
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type) values(${old3},ARRAY['Terre'],'terrain','10','inconnu','Ancienne 3','TEST','y@test.invalid','remblai')`;
  await as(mgrB, (tx) => tx`select submission_ownership_request(${old3}::uuid,${cB}::uuid,'')`);
  await db`update jsc_company_members set is_active=false where user_id=${mgrB} and company_id=${cB}`;
  const req3 = (await db`select id from submission_ownership_requests where submission_id=${old3}`)[0].id;
  await rejects('Demandeur révoqué : approbation refusée', as(admin, (tx) => tx`select submission_ownership_decide(${req3}::uuid,true,'document_signe','REF-3','')`), '42501');
} catch (e: any) {
  check('Exécution interrompue', false, e.code + ' ' + e.message);
} finally {
  await db.end(); await root.unsafe(`DROP DATABASE ${name} WITH (FORCE)`); await root.end();
  for (const r of results) console.log((r.ok ? 'OK    ' : 'ÉCHEC ') + r.name + (r.detail ? ' :: ' + r.detail.slice(0, 300) : ''));
  console.log(`TOTAL ${results.filter((r) => r.ok).length}/${results.length}`);
}
