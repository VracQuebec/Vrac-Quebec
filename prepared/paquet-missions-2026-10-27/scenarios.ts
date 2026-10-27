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

// --- Identités fictives
const admin = u(), managerA = u(), managerB = u(), driverUser = u(), driverUserB = u(), entUser = u();
const companyA = u(), companyB = u(), driverA = u(), driverB = u(), truckA = u();
try {
  await db`insert into auth.users(id,email,email_confirmed_at) values
    (${admin},'admin@test.invalid',now()),(${managerA},'gestion-a@test.invalid',now()),(${managerB},'gestion-b@test.invalid',now()),
    (${driverUser},'chauffeur-a@test.invalid',now()),(${driverUserB},'chauffeur-b@test.invalid',now()),(${entUser},'entrepreneur@test.invalid',now())`;
  await db`insert into user_roles(user_id,role,approved) values(${admin},'admin',true)`;
  await db`insert into jsc_companies(id,code,name) values(${companyA},'TESTA','TEST A'),(${companyB},'TESTB','TEST B')`;
  await db`insert into jsc_company_members(company_id,user_id,role) values(${companyA},${managerA},'proprietaire'),(${companyB},${managerB},'proprietaire')`;
  await db`insert into jsc_drivers(id,company_id,first_name) values(${driverA},${companyA},'TEST A'),(${driverB},${companyB},'TEST B')`;
  await db`insert into jsc_trucks(id,company_id,name) values(${truckA},${companyA},'Camion TEST')`;

  // --- Missions ordinaires d'un entrepreneur (avant toute réquisition) : comportement conservé
  const ent = u(), entSub = u();
  await db`insert into entrepreneurs(id,name,user_id,email) values(${ent},'Entrepreneur TEST',${entUser},'entrepreneur@test.invalid')`;
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email) values(${entSub},ARRAY['Terre'],'terrain','10','inconnu','Fictif','TEST','e@test.invalid')`;
  const m1 = (await as(entUser, (tx) => tx`select drv_mission_start(${entSub},'Paul TEST','Camion 1',true) r`))[0].r;
  check('Mission ordinaire : démarrage entrepreneur', !!m1);
  await as(entUser, (tx) => tx`select drv_mission_point(${m1},46.8,-71.2,10,now())`);
  check('Mission ordinaire : point enregistré', (await db`select count(*)::int n from drv_points where mission_id=${m1}`)[0].n === 1);
  check('Mission ordinaire : lecture par l’entrepreneur', (await as(entUser, (tx) => tx`select id from drv_missions`)).length === 1);
  check('Mission ordinaire : invisible pour un chauffeur', (await as(driverUser, (tx) => tx`select id from drv_missions`)).length === 0);
  await as(entUser, (tx) => tx`select drv_mission_end(${m1})`);
  check('Mission ordinaire : clôture', (await db`select ended_at from drv_missions where id=${m1}`)[0].ended_at !== null);

  // --- Invitation TEST (capture seulement) + acceptation
  const token = u() + u();
  const inv = (await as(managerA, (tx) => tx`select driver_invite_capture(${companyA}::uuid,${driverA}::uuid,'chauffeur-a@test.invalid',${u()},${token},'http://localhost:8080',NULL) r`))[0].r;
  check('Invitation capturée (aucun envoi)', inv.delivery === 'queued-test', inv);
  check('Message en file de capture', (await db`select count(*)::int n from pgmq.capture`)[0].n >= 1);
  await rejects('Invitation : gestionnaire B refusé pour entreprise A',
    as(managerB, (tx) => tx`select driver_invite_capture(${companyA}::uuid,${driverA}::uuid,'x@test.invalid',${u()},${u() + u()},'http://localhost:8080',NULL)`));
  await as(driverUser, (tx) => tx`select driver_invite_accept(${token})`);
  check('Activation : chauffeur lié à son profil', (await db`select user_id from jsc_drivers where id=${driverA}`)[0].user_id === driverUser);

  // --- Demande + réquisition
  const sub = u(), site = u(), request = u();
  await db.begin(async (tx: any) => {
    await tx`select set_config('vq.workbench','on',true)`;
    await tx`insert into submissions(id,created_by,materials,property_type,quantity,tonnage,address,name,email,edit_company_id) values(${sub},${managerA},ARRAY['Terre'],'terrain','100','inconnu','Chantier TEST','TEST','m@test.invalid',${companyA})`;
  });
  await db`insert into transport_requests(id,origin_submission_id,site_address,material_type,client_phone,client_name) values(${request},${sub},'Chantier TEST','Terre','8195550100','TEST')`;
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email) values(${site},ARRAY['Terre'],'terrain','100','inconnu','Destination TEST','TEST','d@test.invalid')`;
  await db`insert into submission_site_decisions(submission_id,site_id,status) values(${sub},${site},'approuvee')`;
  const reqVer = async () => (await db`select requisition_version v, requisition_state s from transport_requests where id=${request}`)[0];
  const values = { company_id: companyA, request_id: request, driver_id: driverA, truck_id: truckA, destination_id: site, material: 'Terre', quantity: 10, unit: 'm3', starts_at: '2026-11-02T12:00:00Z', instructions: 'TEST' };
  const v0 = (await reqVer()).v ?? 1;
  await as(managerA, (tx) => tx`select requisition_assign(${request}::uuid,${companyA}::uuid,${v0},${tx.json(values)},${u()}::uuid,true)`);
  const act = async (who: string, a: string) => as(who, async (tx) => (await tx`select requisition_action(${request}::uuid,${companyA}::uuid,${(await reqVer()).v},${a},'TEST',${u()}::uuid,true) r`)[0].r);
  await act(managerA, 'transmit'); await act(driverUser, 'accept');
  check('Réquisition acceptée par le chauffeur', (await reqVer()).s === 'accepted', await reqVer());

  // --- Isolation
  check('Isolation : gestionnaire B ne lit pas les réquisitions A', JSON.stringify((await as(managerB, (tx) => tx`select requisition_read(${companyA}::uuid) r`))[0].r ?? []) === '[]');
  await rejects('Isolation : chauffeur B ne peut pas agir', act(driverUserB, 'start'));
  await rejects('Isolation : gestionnaire B ne modifie pas la demande A',
    as(managerB, (tx) => tx`select submission_edit_save(${sub}::uuid,${companyA}::uuid,1,'{"access_instructions":"intrus"}'::jsonb,${u()}::uuid,true)`));

  // --- Modification → invalidation de l’accord
  const editVer = (await as(managerA, (tx) => tx`select submission_edit_read(${sub}::uuid) r`))[0].r?.version ?? 1;
  await as(managerA, (tx) => tx`select submission_edit_save(${sub}::uuid,${companyA}::uuid,${editVer},'{"access_instructions":"Accès changé TEST"}'::jsonb,${u()}::uuid,true)`);
  check('Modification : accord passé en revalidation', (await reqVer()).s === 'revalidation', await reqVer());
  await rejects('Modification : départ refusé tant que non revalidé', act(driverUser, 'start'));
  await rejects('Modification : rejeu de l’ancienne version refusé',
    as(managerA, (tx) => tx`select submission_edit_save(${sub}::uuid,${companyA}::uuid,${editVer},'{"access_instructions":"double"}'::jsonb,${u()}::uuid,true)`));
  check('Historique de modification conservé', (await db`select count(*)::int n from ent_crm_history where entity_id=${sub}`)[0].n >= 1);

  // Revalidation explicite puis mission
  await db`update submissions set revalidation_requested_at=NULL where id=${sub}`;
  await act(managerA, 'transmit'); await act(driverUser, 'accept');
  const mid = (await as(driverUser, (tx) => tx`select driver_tracking_start(${request}::uuid,true) r`))[0].r;
  await act(driverUser, 'start');
  await as(driverUser, (tx) => tx`select drv_mission_point(${mid},46.8,-71.2,5,now())`);
  check('Mission réquisition : point chauffeur accepté', (await db`select count(*)::int n from drv_points where mission_id=${mid}`)[0].n === 1);
  check('Mission réquisition : invisible pour chauffeur B', (await as(driverUserB, (tx) => tx`select id from drv_missions where id=${mid}`)).length === 0);

  // --- Révocation avec session encore ouverte (même transaction ouverte = même session)
  await db.begin(async (open: any) => {
    await open`select set_config('role','authenticated',true), set_config('request.jwt.claim.sub',${driverUser},true)`;
    check('Session ouverte : lecture avant révocation', (await open`select id from drv_missions where id=${mid}`).length === 1);
    await open`reset role`;
  });
  await as(managerA, (tx) => tx`select driver_invite_revoke(${inv.id}::uuid)`);
  check('Révocation : mission invisible', (await as(driverUser, (tx) => tx`select id from drv_missions where id=${mid}`)).length === 0);
  await rejects('Révocation : point refusé', as(driverUser, (tx) => tx`select drv_mission_point(${mid},46.8,-71.2,5,now())`), '42501');
  await rejects('Révocation : lot de points refusé (même vide)', as(driverUser, (tx) => tx`select drv_points_batch(${mid},'[]'::jsonb,'web')`), '42501');
  await rejects('Révocation : clôture refusée', as(driverUser, (tx) => tx`select drv_mission_end(${mid})`), '42501');
  check('Révocation : réquisitions illisibles', JSON.stringify((await as(driverUser, (tx) => tx`select requisition_read(${companyA}::uuid) r`))[0].r ?? []) === '[]');
  check('Révocation : points déjà reçus conservés', (await db`select count(*)::int n from drv_points where mission_id=${mid}`)[0].n === 1);

  // --- Mission ordinaire toujours fonctionnelle après installation et révocation
  const m2 = (await as(entUser, (tx) => tx`select drv_mission_start(${entSub},'Paul TEST','Camion 1',true) r`))[0].r;
  await as(entUser, (tx) => tx`select drv_mission_point(${m2},46.8,-71.2,10,now())`);
  check('Mission ordinaire après révocation chauffeur : intacte', (await db`select count(*)::int n from drv_points where mission_id=${m2}`)[0].n === 1);

  // --- EXEC-02 : capacité, concurrence, quantités livrées
  const user = entUser;
  const endpoint = makeCoordinationEndpoint({ enabled: true, local: true, origin: 'http://localhost:8080',
    authenticate: async (r: Request) => { const a = r.headers.get('authorization'); return a === 'admin' ? { role: 'admin', actorId: admin } : a === 'entrepreneur' ? { role: 'entrepreneur', actorId: user } : null; },
    rpc: async (p: any) => (await db`select exec02_dispatch(${db.json(p)}) r`)[0].r } as any);
  const call = async (p: Record<string, unknown>, role = 'admin') => { const r = await endpoint(new Request('http://localhost/coordination', { method: 'POST', headers: { authorization: role }, body: JSON.stringify(p) })); return { status: r.status, body: await r.json() }; };
  const op = () => ({ operationId: u(), confirmed: true });
  const start = new Date(Date.now() + 86400000).toISOString(), end = new Date(Date.now() + 90000000).toISOString();
  const rid = u(), origin = u(), offerId = u(), linkId = u(), secret = 'a'.repeat(64);
  for (const [s, dir] of [[rid, 'reception'], [origin, 'evacuation']]) await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type,parcours_direction,exec01_contact_verified_at,exec01_owner_confirmed_at) values(${s},ARRAY['Terre'],'terrain','100','inconnu','Fictif','TEST','exemple@test.invalid','remblai',${dir},now(),now())`;
  const c = { ...unknownConditions(), total: 50, remaining: 50, unit: 'm3', minimumDelivery: 10, minimumDay: 10, progressive: 'oui', materials: [{ name: 'Terre', stance: 'accepte' }], mixed: 'accepte', vehicles: [{ name: '10 roues', stance: 'accepte' }], access: 'Entrée', hours: 'Créneau', presence: 'oui', environmental: 'documente', projectFit: 'adapte' };
  await db`insert into submission_fill_profile(submission_id,reception_conditions) values(${rid},${db.json(c as any)}) on conflict (submission_id) do update set reception_conditions=excluded.reception_conditions`;
  await db`insert into submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at,verified_at) values(${linkId},${rid},${await digest(secret)},${await digest('exemple@test.invalid')},now()+interval '30 days',now())`;
  await db`insert into material_offers(id,source_type,source_id,owner_user_id,quantity_value,quantity_unit,principal_material,vehicle_type,availability_start,availability_end) values(${offerId},'chantier',${origin},${user},100,'m3','terre','10 roues',current_date,current_date+10)`;
  const f = { requestId: rid, linkId, secret, offerId };
  const pol = await call({ ...f, kind: 'policy', ...op(), policy: { mode: 'preautorisee', start, end, windows: [{ id: u(), start, end, capacity: 50, presenceConfirmed: true }], confirmed: true } }, 'owner');
  check('EXEC-02 : règle de préautorisation enregistrée', pol.status === 200, pol);
  const propose = (q: number) => call({ requestId: rid, offerId, kind: 'propose', quantity: q, unit: 'm3', start, end, ...op() }, 'entrepreneur');
  const conc = await Promise.all([propose(30), propose(30), propose(30)]);
  const list = async () => (await call({ requestId: rid, kind: 'list' })).body;
  const l1 = await list();
  check('Concurrence : 3 propositions de 30 sur capacité 50 → réservé ≤ 50', Number(l1.reserved) <= 50, { reserved: l1.reserved, st: conc.map((x) => x.status) });
  check('Concurrence : exactement une réservation de 30', Number(l1.reserved) === 30, l1.reserved);
  const resv = l1.rows.find((r: any) => r.state === 'reserved');
  const trip = u();
  await db`insert into trips(id,submission_id,status,delivered_at) values(${trip},${rid},'termine',now())`;
  const meas = await call({ kind: 'measure', requestId: rid, reservationId: resv?.id, tripId: trip, quantity: 12, unit: 'm3', ticketRef: 'TEST-12', receivedAt: new Date().toISOString(), outcome: 'accepted', ...op() });
  check('Livraison partielle 12 enregistrée', meas.status === 200, meas);
  const before = await list();
  // Modification de la demande réceptrice : l’accord est réévalué, la quantité livrée reste
  await db.begin(async (tx: any) => { await tx`select set_config('vq.workbench','on',true)`; await tx`update submissions set access_instructions='Nouvel accès TEST' where id=${rid}`; });
  const after = await list();
  check('Quantité livrée conservée après modification', Number(after.delivered) === 12 && Number(before.delivered) === 12, { before: before.delivered, after: after.delivered });
  check('Solde restant non recrédité', Number(after.remaining) === 38, after.remaining);
} catch (e: any) {
  check('Exécution interrompue', false, e.code + ' ' + e.message);
} finally {
  await db.end(); await root.unsafe(`DROP DATABASE ${name} WITH (FORCE)`); await root.end();
  for (const r of results) console.log((r.ok ? 'OK    ' : 'ÉCHEC ') + r.name + (r.detail ? ' :: ' + r.detail.slice(0, 300) : ''));
  console.log(`TOTAL ${results.filter((r) => r.ok).length}/${results.length}`);
}
