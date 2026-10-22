// @vitest-environment node
// Real PostgreSQL + prepared HTTP endpoint. No hosted client, no mail provider.
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { makeEndpoint, type Message } from '../../prepared/exec01b/endpoint';
import { digest } from '../lib/remblai/service';
const enabled = process.env.EXEC01B_LOCAL_TEST === '1';
const name = `exec01lock_${crypto.randomUUID().replace(/-/g, '')}`;
const root = postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable', { ssl: false });
const db = postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`, { ssl: false });
const captures: Message[] = [];
let networkFailure = false;
let quotaAllowed = true;
const handler = makeEndpoint({ enabled: true, localHarness: true, portalOrigin: 'http://localhost:8080', corsOrigin: 'http://localhost:8080',
  isAdmin: async r => r.headers.get('authorization') === 'Bearer local-test-admin',
  quota: async () => quotaAllowed,
  rpc: async p => { if (networkFailure) throw Error('Local network failure'); return (await db`select exec01_dispatch(${db.json(p as postgres.JSONValue)}) r`)[0].r; },
  captureOrSend: async m => { if (!m.to.endsWith('.invalid')) throw Error('Real mail forbidden'); captures.push(m); return 'captured-test'; },
});
type Link = { requestId: string; linkId: string; secret: string };
function capturedLink(): Link {
  const url = captures.at(-1)?.text.split('Suivre ou modifier ma demande : ')[1];
  if (!url) throw Error('Missing local capture');
  const params = new URLSearchParams(new URL(url).hash.slice(1));
  const requestId = params.get('requestId'), linkId = params.get('linkId'), secret = params.get('secret');
  if (!requestId || !linkId || !secret) throw Error('Invalid capture');
  return { requestId, linkId, secret };
}
async function call(p: Record<string, unknown>, admin = false) {
  const response = await handler(new Request('http://localhost/portal', { method: 'POST', headers: admin ? { authorization: 'Bearer local-test-admin' } : {}, body: JSON.stringify(p) }));
  return { status: response.status, body: await response.json() };
}
async function fixture() {
  const requestId = crypto.randomUUID();
  await db`insert into submissions(id,materials,property_type,quantity,tonnage,address,name,email,request_type,parcours_direction) values(${requestId},ARRAY['Terre'],'terrain','500','inconnu','Fictif','Exemple','securite@test.invalid','remblai','reception')`;
  expect((await call({ kind: 'issue', requestId }, true)).status).toBe(200);
  return capturedLink();
}
async function code(f: Link) {
  expect((await call({ ...f, kind: 'code' })).status).toBe(200);
  const value = captures.at(-1)?.text.match(/\d{6}/)?.[0];
  if (!value) throw Error('Missing code');
  return value;
}
async function errors(f: Link, n: number, correct: string) {
  for (let i = 0; i < n; i++) expect((await call({ ...f, kind: 'verify', code: correct === '000000' ? '111111' : '000000' })).status).toBe(403);
}
async function allowRenew(f: Link) {
  await db`update submission_portal_links set created_at=now()-interval '2 minutes',code_requested_at=now()-interval '61 seconds' where submission_id=${f.requestId}`;
}
beforeAll(async () => {
  if (!enabled) return;
  const info = (await root`select current_setting('data_directory') d,inet_server_addr()::text host,inet_server_port() port`)[0];
  if (!String(info.d).startsWith('/tmp/exec-correctifs/') || info.host !== '127.0.0.1/32' && info.host !== '127.0.0.1' || info.port !== 55439) throw Error('Not disposable loopback');
  await root.unsafe(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  for (const path of ['src/test/fixtures/exec01b-base.sql', 'src/test/fixtures/exec01c-relations.sql', 'prepared/exec01b/schema.sql', 'prepared/exec01b/quota.sql']) await db.unsafe(await readFile(path, 'utf8'));
}, 30000);
afterAll(async () => { await db.end(); if (enabled) await root.unsafe(`DROP DATABASE ${name}`); await root.end(); });
describe.skipIf(!enabled)('EXEC01 five errors / temporary lock — isolated SQL', () => {
  it.each([0, 1, 4, 5, 6])('%i wrong attempts: renew and valid code blocked only at five', async n => {
    const f = await fixture(), correct = await code(f);
    await errors(f, n, correct);
    const row = (await db`select failures,code_hash,code_expires_at>now()+interval '14 minutes' locked from submission_portal_links where id=${f.linkId}`)[0];
    expect(row.failures).toBe(Math.min(n, 5));
    if (n >= 5) { expect(row.code_hash).toBeNull(); expect(row.locked).toBe(true); }
    const expectedStatus = n >= 5 ? 403 : 200;
    expect((await call({ ...f, kind: 'verify', code: correct })).status).toBe(expectedStatus);
    await allowRenew(f);
    expect((await call({ ...f, kind: 'renew' })).status).toBe(expectedStatus);
  });
  it('fifth error locks for exactly fifteen minutes, not from code issue time', async () => {
    const f = await fixture(), correct = await code(f);
    await errors(f, 4, correct);
    await db`update submission_portal_links set code_requested_at=now()-interval '9 minutes' where id=${f.linkId}`;
    await errors(f, 1, correct);
    const row = (await db`select extract(epoch from (code_expires_at-now()))::float8 seconds from submission_portal_links where id=${f.linkId}`)[0];
    expect(row.seconds).toBeGreaterThan(899); expect(row.seconds).toBeLessThanOrEqual(900);
    await db`update submission_portal_links set code_expires_at=now()+interval '1 second' where id=${f.linkId}`;
    expect((await call({ ...f, kind: 'code' })).status).toBe(403);
    await db`update submission_portal_links set code_expires_at=now()-interval '1 second' where id=${f.linkId}`;
    expect((await call({ ...f, kind: 'verify', code: correct })).status).toBe(403);
    const fresh = await code(f);
    expect((await call({ ...f, kind: 'verify', code: fresh })).status).toBe(200);
    expect((await db`select failures from submission_portal_links where id=${f.linkId}`)[0].failures).toBe(0);
  });
  it('expired lock allows renewal, but no read or sensitive action before verification', async () => {
    const f = await fixture(), correct = await code(f); await errors(f, 5, correct); await allowRenew(f);
    await db`update submission_portal_links set code_expires_at=now()-interval '1 second',expires_at=now()-interval '1 day' where id=${f.linkId}`;
    expect((await call({ ...f, kind: 'renew' })).status).toBe(200);
    const next = capturedLink();
    expect((await call({ ...next, kind: 'read' })).status).toBe(403);
    expect((await call({ ...next, kind: 'act', confirmed: true, action: 'pause', version: 1, operationId: crypto.randomUUID() })).status).toBe(403);
    const fresh = await code(next); expect((await call({ ...next, kind: 'verify', code: fresh })).status).toBe(200);
    const row = (await call({ ...next, kind: 'read' })).body;
    expect((await call({ ...next, kind: 'act', confirmed: true, action: 'pause', version: row.version, operationId: crypto.randomUUID() })).status).toBe(200);
  });
  it('verified contact retains consultation, but a renewed link needs its own recent code and confirmation', async () => {
    const f = await fixture(), correct = await code(f); await call({ ...f, kind: 'verify', code: correct }); await allowRenew(f);
    expect((await call({ ...f, kind: 'renew' })).status).toBe(200); const next = capturedLink();
    const row = (await call({ ...next, kind: 'read' })).body; expect(row.id).toBe(f.requestId);
    const action = { ...next, kind: 'act', action: 'pause', version: row.version, operationId: crypto.randomUUID(), confirmed: true };
    expect((await call(action)).status).toBe(403);
    expect((await call({ ...next, kind: 'verify', code: correct })).status).toBe(403);
    const fresh = await code(next); await call({ ...next, kind: 'verify', code: fresh });
    expect((await call({ ...action, confirmed: false })).status).toBe(400);
    await db`update submission_portal_links set verified_at=now()-interval '11 minutes' where id=${next.linkId}`;
    expect((await call(action)).status).toBe(403);
    for (const sensitive of ['modifier', 'pause', 'fermer']) expect((await call({ ...action, ...f, action: sensitive })).status).toBe(403);
  });
  it('revoked link stays refused even after cooldown', async () => {
    const f = await fixture(), correct = await code(f); await errors(f, 5, correct); await allowRenew(f);
    await db`update submission_portal_links set revoked_at=now(),code_expires_at=now()-interval '1 second' where id=${f.linkId}`;
    for (const kind of ['read', 'code', 'renew', 'verify']) expect((await call({ ...f, kind, ...(kind === 'verify' ? { code: correct } : {}) })).status).toBe(403);
  });
  it('one link per minute and five links per twenty-four hours survive the new rule', async () => {
    let f = await fixture(); expect((await call({ ...f, kind: 'renew' })).status).toBe(403);
    for (let i = 0; i < 4; i++) { await allowRenew(f); expect((await call({ ...f, kind: 'renew' })).status).toBe(200); f = capturedLink(); }
    await allowRenew(f); expect((await call({ ...f, kind: 'renew' })).status).toBe(403);
    await db`update submission_portal_links set created_at=now()-interval '25 hours' where submission_id=${f.requestId}`;
    expect((await call({ ...f, kind: 'renew' })).status).toBe(200);
  });
  it('code resend is limited to sixty seconds', async () => {
    const f = await fixture(); await code(f); const count = captures.length;
    expect((await call({ ...f, kind: 'code' })).status).toBe(403); expect(captures.length).toBe(count);
    await allowRenew(f); expect((await call({ ...f, kind: 'code' })).status).toBe(200);
  });
  it('existing network quota allows thirty requests, then refuses the thirty-first', async () => {
    const identity = await digest(crypto.randomUUID());
    for (let i = 0; i < 30; i++) expect((await db`select exec01_quota(${identity}) ok`)[0].ok).toBe(true);
    expect((await db`select exec01_quota(${identity}) ok`)[0].ok).toBe(false);
    quotaAllowed = false;
    try { expect((await call({ kind: 'issue', requestId: crypto.randomUUID() }, true)).status).toBe(429); } finally { quotaAllowed = true; }
  });
  it('renewal capture reaches only the stored test address; newest link works, old links denied, no duplicates', async () => {
    const f = await fixture(); await allowRenew(f); const before = captures.length;
    const results = await Promise.all([call({ ...f, kind: 'renew' }), call({ ...f, kind: 'renew' })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 403]); expect(captures.length).toBe(before + 1);
    const message = captures.at(-1); expect(message?.to).toBe('securite@test.invalid'); expect(message?.tracking).toBe(false);
    const next = capturedLink(); expect(next.requestId).toBe(f.requestId); expect(next.linkId).not.toBe(f.linkId);
    expect((await call({ ...f, kind: 'read' })).status).toBe(403);
    const fresh = await code(next); await call({ ...next, kind: 'verify', code: fresh });
    const row = (await call({ ...next, kind: 'read' })).body;
    const p = { ...next, kind: 'act', action: 'pause', version: row.version, operationId: crypto.randomUUID(), confirmed: true };
    const [a, b] = await Promise.all([call(p), call(p)]); expect(a.status).toBe(200); expect(b).toEqual(a);
    expect((await db`select count(*)::int n from submissions where id=${f.requestId}`)[0].n).toBe(1);
    expect((await db`select count(*)::int n from submission_portal_events where submission_id=${f.requestId}`)[0].n).toBe(1);
    expect(JSON.stringify(a.body)).not.toContain(next.secret); expect(JSON.stringify(a.body)).not.toContain(fresh);
  });
  it('simulated network failure is generic and preserves database state', async () => {
    const f = await fixture(); networkFailure = true;
    try { const r = await call({ ...f, kind: 'code' }); expect(r.status).toBe(503); expect(JSON.stringify(r.body)).not.toContain(f.secret); }
    finally { networkFailure = false; }
    expect((await db`select code_hash from submission_portal_links where id=${f.linkId}`)[0].code_hash).toBeNull();
  });
  it('guarded patch and inverse restore the exact function, rejecting unexpected text', async () => {
    const reference = await readFile('prepared/exec01-correctif-lien/production-reference.sql', 'utf8');
    const forward = await readFile('prepared/exec01-correctif-lien/0231_renouvellement_premiere_verification.sql', 'utf8');
    const inverse = await readFile('prepared/exec01-correctif-lien/0231_retour_arriere_NON_APPLIQUE.sql', 'utf8');
    const definition = async () => (await db`select pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure) d`)[0].d as string;
    await db.unsafe(reference); const baseline = await definition();
    await db.unsafe(forward); const corrected = await definition();
    expect(corrected).not.toBe(baseline); await expect(db.unsafe(forward)).rejects.toThrow('BLOQUÉ');
    await db.unsafe(inverse); expect(await definition()).toBe(baseline);
    await expect(db.unsafe(inverse)).rejects.toThrow('BLOQUÉ');
    await db.unsafe(baseline.replace("kind='crm'", "kind = 'crm'"));
    await expect(db.unsafe(forward)).rejects.toThrow('BLOQUÉ');
    await db.unsafe(corrected.replace("kind='crm'", "kind = 'crm'"));
    await expect(db.unsafe(inverse)).rejects.toThrow('BLOQUÉ');
    await db.unsafe(corrected);
    const unchangedTail = " IF s.exec01_contact_verified_at IS NULL OR s.exec01_verified_contact_hash IS DISTINCT FROM l.contact_hash THEN";
    expect(corrected.slice(corrected.indexOf(unchangedTail))).toBe(baseline.slice(baseline.indexOf(unchangedTail)));
  });
});