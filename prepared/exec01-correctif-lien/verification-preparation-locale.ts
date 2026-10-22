// Local-only executable verification. No hosted URL, provider, backups or exports.
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = 'prepared/exec01-correctif-lien/';
const root = postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable', { ssl: false });
const name = `exec01prep_${crypto.randomUUID().replaceAll('-', '')}`;
const db = postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`, { ssl: false });
let created = false;
let passed = 0;
async function check(label: string, fn: () => Promise<void>) {
  await fn(); passed++; console.log(`OK ${label}`);
}
try {
  assert.equal(process.env.EXEC01B_LOCAL_TEST, '1', 'Explicit local-test opt-in required');
  const [info] = await root`select current_setting('data_directory') d, inet_server_addr()::text host, inet_server_port() port`;
  assert.ok(String(info.d).startsWith('/tmp/exec-correctifs/'));
  assert.ok(['127.0.0.1', '127.0.0.1/32'].includes(info.host));
  assert.equal(info.port, 55439);
  await root.unsafe(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`); created = true;
  for (const path of ['src/test/fixtures/exec01b-base.sql', 'src/test/fixtures/exec01c-relations.sql', 'prepared/exec01b/schema.sql']) {
    await db.unsafe(await readFile(path, 'utf8'));
  }
  const reference = await readFile(`${base}production-reference.sql`, 'utf8');
  const forward = await readFile(`${base}0231_renouvellement_premiere_verification.sql`, 'utf8');
  const inverse = await readFile(`${base}0231_retour_arriere_NON_APPLIQUE.sql`, 'utf8');
  await db.unsafe(reference);
  await db.unsafe(`CREATE FUNCTION public.exec01_test_sentinel() RETURNS integer LANGUAGE sql AS 'SELECT 231';`);
  const definition = async () => (await db`select pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure) d`)[0].d as string;
  const metadata = async () => (await db`select proowner::text,proacl::text,prosecdef,proconfig,prorettype::text,proargtypes::text from pg_proc where oid='public.exec01_dispatch(jsonb)'::regprocedure`)[0];
  const baseline = await definition(), initialMetadata = await metadata();
  const sentinel = (await db`select pg_get_functiondef('public.exec01_test_sentinel()'::regprocedure) d`)[0].d;
  await check('empreinte initiale exacte', async () => {
    assert.equal((await db`select md5(pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure)) h`)[0].h, '2da0b80649cfacf5db57fe559adab3c2');
  });
  await db.unsafe(forward);
  const corrected = await definition();
  await check('empreinte corrigée exacte', async () => {
    assert.equal((await db`select md5(pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure)) h`)[0].h, 'e9d8b2ad33d864aa7a3ba881e78b82cc');
  });
  await db.unsafe(inverse);
  await check('inverse identique octet pour octet, métadonnées et autre fonction inchangées', async () => {
    assert.equal(await definition(), baseline);
    assert.deepEqual(await metadata(), initialMetadata);
    assert.equal((await db`select pg_get_functiondef('public.exec01_test_sentinel()'::regprocedure) d`)[0].d, sentinel);
  });
  await check('second inverse refusé sans changement', async () => {
    await assert.rejects(db.unsafe(inverse), /BLOQUÉ/); assert.equal(await definition(), baseline);
  });
  await db.unsafe(corrected.replace("kind='crm'", "kind = 'crm'"));
  await check('dérive refusée sans changement', async () => {
    const drifted = await definition(); await assert.rejects(db.unsafe(inverse), /BLOQUÉ/); assert.equal(await definition(), drifted);
  });
  await db.unsafe(corrected);
  async function historical(failures: number, deadline: 'unknown' | 'past' | 'future', revoked = false) {
    const id = crypto.randomUUID(), linkId = crypto.randomUUID();
    await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type,parcours_direction) values(${id},ARRAY['Terre'],'terrain','500','inconnu','Fictif','TEST','historique@test.invalid','remblai','reception')`;
    await db`insert into submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at,failures,code_hash,code_expires_at,revoked_at)
      values(${linkId},${id},'local-fixture-hash',encode(extensions.digest('historique@test.invalid','sha256'),'hex'),now()+interval '1 day',${failures},'ancien-code-fictif',
      CASE ${deadline} WHEN 'past' THEN now()-interval '1 hour' WHEN 'future' THEN now()+interval '1 hour' ELSE NULL END,
      CASE WHEN ${revoked} THEN now() ELSE NULL END)`;
    const input = { requestId: id, linkId, secretHash: 'local-fixture-hash', kind: 'code', codeHash: 'nouveau-code-fictif' };
    const [before] = await db`select failures,code_hash,code_expires_at,revoked_at from submission_portal_links where id=${linkId}`;
    const [response] = await db`select exec01_dispatch(${db.json(input)}) r`;
    const [after] = await db`select failures,code_hash,code_expires_at,revoked_at from submission_portal_links where id=${linkId}`;
    return { before, after, response: response.r };
  }
  for (const failures of [5, 6]) await check(`historique ${failures} erreurs sans date : refus et état intact`, async () => {
    const r = await historical(failures, 'unknown'); assert.equal(r.response.denied, true); assert.deepEqual(r.after, r.before);
  });
  await check('historique date future : refus et état intact', async () => {
    const r = await historical(5, 'future'); assert.equal(r.response.denied, true); assert.deepEqual(r.after, r.before);
  });
  await check('historique date passée ambiguë : refus et état intact (risque corrigé)', async () => {
    const r = await historical(5, "past"); assert.equal(r.response.denied, true); assert.deepEqual(r.after, r.before);
  });
  await check('historique révoqué avec date passée : refus et état intact', async () => {
    const r = await historical(6, 'past', true); assert.equal(r.response.denied, true); assert.deepEqual(r.after, r.before);
  });
  console.log(`${passed}/10 vérifications réussies, local uniquement. Aucun compteur historique ambigu réinitialisé.`);
} finally {
  await db.end();
  if (created) await root.unsafe(`DROP DATABASE ${name}`);
  await root.end();
}