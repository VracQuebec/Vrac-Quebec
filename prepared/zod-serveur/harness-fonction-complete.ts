// Exécute le VRAI point d'entrée submission-owner-portal/index.ts ; réseau remplacé par un faux serveur local.
const calls: string[] = [];
const env: Record<string, string> = { SUPABASE_URL: 'http://fake.local', SUPABASE_SERVICE_ROLE_KEY: 'fictif', EXEC01_PORTAL_ORIGIN: 'http://localhost:8080', EXEC01_ENABLED: 'true' };
const realGet = Deno.env.get.bind(Deno.env); (Deno.env as any).get = (k: string) => env[k] ?? realGet(k);
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input instanceof Request ? input.url : input); const body = init?.body ? String(init.body) : '';
  if (!url.startsWith('http://fake.local')) throw Error('réseau externe interdit : ' + url);
  calls.push(url.replace('http://fake.local', '') + ' ' + body.slice(0, 120));
  const j = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'content-type': 'application/json' } });
  if (url.includes('/rpc/exec01_quota')) return j(true);
  if (url.includes('/rpc/exec01_dispatch')) { const p = JSON.parse(body).p; return j(p.kind === 'read' ? { ok: true, status: 'en attente', version: 3 } : { ok: true, kind: p.kind }); }
  if (url.includes('/auth/v1/user')) return j({ msg: 'invalid' }, 401);
  return j({ error: 'inattendu' }, 500);
}) as any;
let handler: (r: Request) => Promise<Response> = async () => new Response('none');
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve() } as any; };
await import('./' + Deno.args[0] + '/submission-owner-portal/index.ts');
const H = { 'content-type': 'application/json', origin: 'http://localhost:8080', 'cf-connecting-ip': '203.0.113.7' };
const cred = { requestId: crypto.randomUUID(), linkId: crypto.randomUUID(), secret: 'a'.repeat(64) };
const cond = { total: 100, remaining: 80, unit: 'm3', materials: [{ name: 'Terre', stance: 'accepte' }], vehicles: [], photos: [], mode: 'a_confirmer', periodStart: null, periodEnd: null, environmental: 'a_valider', projectFit: 'a_valider', promotional: false };
const cases: [string, RequestInit][] = [
  ['OPTIONS', { method: 'OPTIONS' }], ['GET sans mutation', { method: 'GET' }],
  ['POST JSON invalide', { method: 'POST', headers: H, body: '{' }],
  ['read valide', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'read', ...cred }) }],
  ['read champ inconnu (strict)', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'read', ...cred, x: 1 }) }],
  ['verify code 5 chiffres', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'verify', ...cred, code: '12345' }) }],
  ['verify code valide', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'verify', ...cred, code: '123456' }) }],
  ['revoke sans confirmation', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'revoke', ...cred }) }],
  ['act confirmer', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'act', ...cred, confirmed: true, operationId: crypto.randomUUID(), version: 3, action: 'confirmer' }) }],
  ['act version 0', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'act', ...cred, confirmed: true, operationId: crypto.randomUUID(), version: 0, action: 'confirmer' }) }],
  ['act modifier sans conditions', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'act', ...cred, confirmed: true, operationId: crypto.randomUUID(), version: 3, action: 'modifier' }) }],
  ['act modifier conditions invalides', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'act', ...cred, confirmed: true, operationId: crypto.randomUUID(), version: 3, action: 'modifier', conditions: { ...cond, unit: 'kg' } }) }],
  ['kind inconnu', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'zzz', ...cred }) }],
  ['issue sans admin', { method: 'POST', headers: { ...H, authorization: 'Bearer faux' }, body: JSON.stringify({ kind: 'issue', requestId: cred.requestId }) }],
  ['identifiant non RFC 0000…0001', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'read', ...cred, requestId: '00000000-0000-0000-0000-000000000001' }) }],
  ['origine étrangère', { method: 'POST', headers: { ...H, origin: 'https://evil.example' }, body: JSON.stringify({ kind: 'read', ...cred }) }],
];
const out: Record<string, string> = {};
for (const [n, init] of cases) { calls.length = 0; const r = await handler(new Request('http://localhost/submission-owner-portal', init)); const t = await r.text(); out[n] = `${r.status} ${t.slice(0, 90)} | rpc:${calls.map((c) => c.split(' ')[0]).join(',')}`; }
console.log(JSON.stringify(out));
