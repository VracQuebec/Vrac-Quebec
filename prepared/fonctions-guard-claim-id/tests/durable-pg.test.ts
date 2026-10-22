// @vitest-environment node
// Real SQL on verified disposable loopback only. No provider/network email.
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { runClaimedCreate, RejectedBeforeInsert } from '../_shared/claimed-create';
import { runDedupedCreate } from '../../../supabase/functions/submit-parcours/dedupe-flow';
import { claimQuote, completeQuote } from '../../../supabase/functions/quote-submit/dedupe';

const enabled = process.env.EXEC01B_LOCAL_TEST === '1';
const name = `durable_${crypto.randomUUID().replaceAll('-', '')}`;
const root = postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable');
const db = postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`);
const guard = (fp: string) => ({ scope: 'isolated', identity: 'test@test.invalid', fingerprint: fp, ip: null });
const rpcNames: Record<string, string> = {
  guard_claim: 'select guard_claim($1,$2,$3,$4::text::jsonb,$5,$6) r',
  guard_claim_durable: 'select guard_claim_durable($1,$2,$3,$4::text::jsonb,$5,$6) r',
  guard_complete: 'select guard_complete($1::uuid,$2::text::jsonb) r',
  guard_release: 'select guard_release($1::uuid,$2) r',
};
const sb = {
  from: () => ({ select: () => ({ eq: () => ({ in: () => ({ gte: async () => ({ count: 0, error: null }) }) }) }) }),
  rpc: async (n: string, a: any) => {
    const query = rpcNames[n]; if (!query) throw Error('Unknown RPC');
    const params = n.startsWith('guard_claim')
      ? [a.p_scope,a.p_identity,a.p_fingerprint,JSON.stringify(a.p_payload),a.p_dedupe_minutes,a.p_pending_seconds]
      : n === 'guard_complete' ? [a.p_claim_id,JSON.stringify(a.p_result)] : [a.p_claim_id,a.p_reason];
    try { const rows = await db.unsafe(query, params); return { data: rows[0].r, error: null }; }
    catch (e) { console.error('Local fixture RPC error', n, (e as Error).message); return { data: null, error: { code: (e as { code?: string }).code } }; }
  },
};
function handlers(table: 'submissions' | 'jsc_requests') {
  return {
    findByClaim: async (id: string) => {
      const r = await db.unsafe(`select id from ${table} where guard_claim_id=$1`, [id]);
      return r[0] ? { submission_id: r[0].id } : null;
    },
    create: async (id: string) => {
      const r = await db.unsafe(`insert into ${table}(guard_claim_id) values($1) returning id`, [id]);
      return { ref: { submission_id: r[0].id }, data: null };
    },
  };
}
beforeAll(async () => {
  if (!enabled) return;
  const [info] = await root`select current_setting('data_directory') d,inet_server_addr()::text host,inet_server_port() port`;
  if (!String(info.d).startsWith('/tmp/exec-correctifs/') || !['127.0.0.1','127.0.0.1/32'].includes(info.host) || info.port!==55439) throw Error('Not disposable');
  await root.unsafe(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await db.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public_request_guard(id uuid primary key default gen_random_uuid(),scope text not null,identity text not null,fingerprint text,payload jsonb not null default '{}',created_at timestamptz default now());
    CREATE TABLE submissions(id uuid primary key default gen_random_uuid());
    CREATE TABLE jsc_requests(id uuid primary key default gen_random_uuid());
    INSERT INTO submissions DEFAULT VALUES; INSERT INTO jsc_requests DEFAULT VALUES;`);
  for (const f of ['migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql','migration-guard-claim-id-NON-APPLIQUEE.sql','migration-guard-durable-NON-APPLIQUEE.sql']) {
    await db.unsafe(await readFile(`prepared/deploiement/${f}`, 'utf8'));
  }
},30000);
afterAll(async () => { await db.end(); if (enabled) await root.unsafe(`DROP DATABASE ${name}`); await root.end(); });
describe.skipIf(!enabled)('durable SQL + shared prepared handler', () => {
  for (const table of ['submissions','jsc_requests'] as const) {
    it(`${table}: simultaneous submissions create exactly one dossier`, async () => {
      const results = await Promise.all(Array.from({length:5}, () => runClaimedCreate(sb,guard(table+'parallel'),handlers(table))));
      expect(results.filter(x=>x.kind==='created')).toHaveLength(1);
      expect(results.filter(x=>x.kind!=='created')).toHaveLength(4);
    });
    it(`${table}: pending beyond 31 minutes cannot replace active worker`, async () => {
      const g=guard(table+'late');
      const claim=await sb.rpc('guard_claim_durable',{p_scope:g.scope,p_identity:g.identity,p_fingerprint:g.fingerprint,p_payload:{},p_dedupe_minutes:30,p_pending_seconds:600});
      await db`update public_request_guard set created_at=now()-interval '31 minutes' where id=${claim.data.claim_id}`;
      expect((await runClaimedCreate(sb,g,handlers(table))).kind).toBe('in_progress');
      const row=await handlers(table).create(claim.data.claim_id);
      expect(await runClaimedCreate(sb,g,handlers(table))).toEqual({kind:'duplicate',ref:row.ref,claimId:claim.data.claim_id});
      expect((await db`select count(*)::int n from public_request_guard where fingerprint=${g.fingerprint}`)[0].n).toBe(1);
    });
    it(`${table}: rejected insert retries; lost response recovers without second create`, async () => {
      const g=guard(table+'reject');const h=handlers(table);
      await expect(runClaimedCreate(sb,g,{...h,create:async()=>{throw new RejectedBeforeInsert('rejected');}})).rejects.toThrow('rejected');
      expect((await runClaimedCreate(sb,g,h)).kind).toBe('created');
      const lost=guard(table+'lost');
      const r=await runClaimedCreate(sb,lost,{...h,create:async id=>{await h.create(id);throw Error('response lost');}});
      expect(r.kind).toBe('duplicate');
      expect((await runClaimedCreate(sb,lost,h)).kind).toBe('duplicate');
    });
    it(`${table}: a confirmed request after 30 minutes can be a new dossier`, async () => {
      const g=guard(table+'new');const a=await runClaimedCreate(sb,g,handlers(table));
      await db`update public_request_guard set created_at=now()-interval '31 minutes' where fingerprint=${g.fingerprint}`;
      const b=await runClaimedCreate(sb,g,handlers(table));
      expect(a.kind).toBe('created');expect(b.kind).toBe('created');
      if(a.kind==='created'&&b.kind==='created') expect(a.ref.submission_id).not.toBe(b.ref.submission_id);
    });
  }
  it('historical requests stay NULL and both partial unique indexes remain',async()=>{
    for(const t of ['submissions','jsc_requests']) expect((await db.unsafe(`select count(*)::int n from ${t} where guard_claim_id is null`))[0].n).toBe(1);
    expect((await db`select count(*)::int n from pg_indexes where indexname in ('submissions_guard_claim_id_uq','jsc_requests_guard_claim_id_uq')`)[0].n).toBe(2);
  });
  it('old parcours code operates with additive M1/M2 retained',async()=>{
    const key={email:'legacy@test.invalid',address:'TEST',variant:'reception' as const,quantityLabel:'1',materials:['Terre']};
    const create=async()=>({submissionId:crypto.randomUUID(),data:null});
    const a=await runDedupedCreate(sb,{scope:'old-parcours',identity:key.email,ip:null},key,create);
    const b=await runDedupedCreate(sb,{scope:'old-parcours',identity:key.email,ip:null},key,create);
    expect(a.kind).toBe('created');expect(b.kind).toBe('duplicate');
    if(a.kind==='created'&&b.kind==='duplicate') expect(b.submissionId).toBe(a.submissionId);
  });
  it('old quote code operates with additive M1/M2 retained',async()=>{
    const o={identity:'old@test.invalid',fingerprint:'legacy-quote',ip:null};
    const a=await claimQuote(sb,o);expect(a.kind).toBe('new');
    if(a.kind!=='new') throw Error('No claim');
    await completeQuote(sb,a.claimId,{submission_id:crypto.randomUUID(),request_number:'TEST-1'});
    expect((await claimQuote(sb,o)).kind).toBe('duplicate');
  });
  it('durable RPC exposes no EXECUTE to public users',async()=>{
    const [r]=await db`select has_function_privilege('anon','guard_claim_durable(text,text,text,jsonb,integer,integer)','EXECUTE') a,has_function_privilege('authenticated','guard_claim_durable(text,text,text,jsonb,integer,integer)','EXECUTE') b,has_function_privilege('service_role','guard_claim_durable(text,text,text,jsonb,integer,integer)','EXECUTE') s`;
    expect(r).toEqual({a:false,b:false,s:true});
  });
  it('accepted mail cannot be overwritten by a later failed attempt',async()=>{
    const [r]=await db`insert into public_request_guard(scope,identity,fingerprint,payload) values('mail','test@test.invalid','mail-state','{"state":"done","result":{"submission_id":"TEST"}}') returning id`;
    await db`select guard_email_status(${r.id},'queued')`;
    await db`select guard_email_status(${r.id},'failed')`;
    const [after]=await db`select payload from public_request_guard where id=${r.id}`;
    expect(after.payload.email_status).toBe('queued');expect(after.payload.state).toBe('done');
  });
});