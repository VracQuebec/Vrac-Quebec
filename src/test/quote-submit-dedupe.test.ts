// quote-submit (achat de vrac) — tests SIMULÉS du gestionnaire réel.
// Le code de la fonction est exécuté tel quel ; la base, le géocodage, le
// moteur de prix et l'envoi de courriel sont remplacés par des doubles en
// mémoire. Aucune base réelle n'est touchée, aucun courriel n'est envoyé.
// La concurrence RÉELLE PostgreSQL est testée à part :
// prepared/deploiement/tests/concurrence-pg.sh (section quote-submit).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { interpretQuoteSubmit } from "@/lib/vrac/submitResult";

const MIN = 60_000;
const iso = (ms = 0) => new Date(Date.now() - ms).toISOString();

// ---------------- Base simulée ----------------
type State = {
  tables: Record<string, any[]>;
  rpcMissing: boolean;
  failInsert: Set<string>;
  insertDelay: number;
  mail: { calls: any[]; failTemplates: Set<string>; sent: Set<string> };
};
const S: State = {
  tables: {}, rpcMissing: false, failInsert: new Set(), insertDelay: 0,
  mail: { calls: [], failTemplates: new Set(), sent: new Set() },
};
let seq = 0;
const locks = new Map<string, Promise<any>>();

function table(name: string) {
  const rows = () => (S.tables[name] ??= []);
  const filters: Array<(r: any) => boolean> = [];
  let head = false;
  let patch: any = null;
  const pick = () => rows().filter((r) => filters.every((f) => f(r)));
  const c: any = {
    select: (_c?: string, o?: { head?: boolean }) => ((head = !!o?.head), c),
    eq: (k: string, v: any) => (filters.push((r) => r[k] === v), patch ? (pick().forEach((r) => Object.assign(r, patch)), Promise.resolve({ error: null })) : c),
    is: (k: string, v: any) => (filters.push((r) => (r[k] ?? null) === v), c),
    in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), c),
    gte: (k: string, v: any) => (filters.push((r) => r[k] >= v), c),
    order: () => c, limit: () => c,
    maybeSingle: async () => ({ data: pick()[0] ?? null, error: null }),
    update: (p: any) => ((patch = p), c),
    insert: (row: any) => {
      const run = async () => {
        await new Promise((r) => setTimeout(r, S.insertDelay));
        if (S.failInsert.has(name)) return { data: null, error: { message: `insertion ${name} refusée` } };
        const n = ++seq;
        const r = { id: `${name}-${n}`, created_at: iso(), request_number: `DT-${n}`, quote_number: `SV-${n}`, ...row };
        rows().push(r);
        return { data: r, error: null };
      };
      const p = run();
      return { select: () => ({ single: () => p }), then: (res: any, rej: any) => p.then(res, rej) };
    },
    then: (res: any) => res(head ? { count: pick().length, error: null } : { data: pick(), error: null }),
  };
  return c;
}

async function rpcImpl(name: string, a: any) {
  const guard = (S.tables.public_request_guard ??= []);
  if (name.startsWith("guard_") && S.rpcMissing) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
  if (name === "guard_claim") {
    const mine = guard.filter((r) => r.scope === a.p_scope && r.fingerprint === a.p_fingerprint && r.created_at >= iso(a.p_dedupe_minutes * MIN))
      .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    const done = mine.find((r) => r.payload.state === "done");
    if (done) return { data: { state: "duplicate", claim_id: done.id, result: done.payload.result }, error: null };
    const pend = mine.find((r) => r.payload.state === "pending" && r.created_at >= iso(a.p_pending_seconds * 1000));
    if (pend) return { data: { state: "in_progress", claim_id: pend.id }, error: null };
    const r = { id: `g${++seq}`, scope: a.p_scope, identity: a.p_identity, fingerprint: a.p_fingerprint, payload: { state: "pending" }, created_at: iso() };
    guard.push(r);
    return { data: { state: "new", claim_id: r.id }, error: null };
  }
  if (name === "guard_complete") {
    const r = guard.find((x) => x.id === a.p_claim_id && ["pending", "failed"].includes(x.payload.state));
    if (!r || !a.p_result?.submission_id) return { data: null, error: { code: "P0002", message: "introuvable" } };
    r.payload = { ...r.payload, state: "done", result: a.p_result };
    return { data: true, error: null };
  }
  if (name === "guard_release") {
    const r = guard.find((x) => x.id === a.p_claim_id && x.payload.state === "pending");
    if (r) r.payload = { ...r.payload, state: "failed" };
    return { data: !!r, error: null };
  }
  (S.tables[`rpc:${name}`] ??= []).push(a);
  return { data: null, error: null };
}
const db = {
  from: table,
  // Sérialisation par empreinte, comme pg_advisory_xact_lock.
  rpc: (name: string, a: any) => {
    const key = String(a?.p_fingerprint ?? a?.p_claim_id ?? name);
    const p = (locks.get(key) ?? Promise.resolve()).then(() => rpcImpl(name, a));
    locks.set(key, p);
    return p;
  },
};

// ---------------- Doubles des modules externes ----------------

vi.mock("./stubs/supabase-js.ts", () => ({ createClient: () => db }));
vi.mock("../../supabase/functions/_shared/vqos/index.ts", () => ({}));
vi.mock("../../supabase/functions/_shared/vqos/runtime.ts", () => ({
  geocode: async (address: string) => ({ address, city: "Ville", postal_code: "J0A 1A0", lat: 46, lng: -73 }),
  loadConfig: async () => ({}),
  distanceProvider: {},
}));
vi.mock("../../supabase/functions/_shared/vqos/jsc-engine.ts", () => ({
  runCarrierQuote: async () => ({
    engine_version: "test",
    public: { material: { id: "m1", name: "Sable" }, quantity: 20, unit: "tonne", tonnage: 20, trips: 1, distance_km: 10, billable_hours: 1, material_amount: 100, transport_amount: 100, subtotal: 200, taxes: [], tax_total: 30, total: 230 },
    technical: { selected: {}, decision_trace: {}, options: [], settings_used: {} },
  }),
}));
vi.mock("../../supabase/functions/_shared/observability.ts", () => ({ logEvent: vi.fn(async () => {}), logEventAsync: vi.fn() }));
vi.mock("../../supabase/functions/_shared/http.ts", () => ({
  fetchWithTimeout: vi.fn(async (_url: string, init: any) => {
    const p = JSON.parse(init.body);
    S.mail.calls.push(p);
    if (S.mail.failTemplates.has(p.templateName)) return new Response("échec simulé", { status: 502 });
    // Idempotence du service d'envoi : une clé déjà vue n'est pas renvoyée.
    S.mail.sent.add(p.idempotencyKey);
    return new Response("{}", { status: 200 });
  }),
}));

let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  (globalThis as any).Deno = {
    serve: (h: any) => { handler = h; },
    env: { get: (k: string) => (k === "SUPABASE_URL" ? "http://simule.invalid" : "cle-simulee") },
  };
  await import("../../supabase/functions/quote-submit/index.ts");
});
beforeEach(() => {
  S.tables = { jsc_settings: [{ key: "admin_notification_email", value: "admin@exemple.invalid", is_active: true, archived_at: null }] };
  S.rpcMissing = false; S.failInsert = new Set(); S.insertDelay = 0;
  S.mail = { calls: [], failTemplates: new Set(), sent: new Set() };
  locks.clear();
});

const body = (over: Record<string, unknown> = {}) => ({
  action: "submit", material_id: "00000000-0000-0000-0000-000000000001", quantity: 20, unit: "tonne",
  address: "12 rue Fictive, Ville", form_started_at: Date.now() - 60_000,
  contact: { name: "Client Fictif", phone: "819-000-0000", email: "client@exemple.invalid" }, ...over,
});
const send = async (b = body()) => {
  const res = await handler(new Request("http://x/", { method: "POST", body: JSON.stringify(b) }));
  return { status: res.status, json: await res.json() };
};
const count = (t: string) => (S.tables[t] ?? []).length;

describe("quote-submit — anti-doublon et courriels (simulé)", () => {
  it("1. création normale : soumission enregistrée, deux courriels, références renvoyées", async () => {
    const r = await send();
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, email_sent: true, quote_number: expect.any(String), request_number: expect.any(String) });
    expect(count("jsc_quotes")).toBe(1);
    expect(S.mail.calls.map((c) => c.templateName).sort()).toEqual(["soumission-client", "soumission-interne"]);
    const q = S.tables.jsc_quotes[0];
    expect(S.mail.calls.map((c) => c.idempotencyKey).sort()).toEqual([`soumission-client-${q.id}`, `soumission-interne-${q.id}`]);
  });

  it("2. échec d'enregistrement puis nouvelle tentative : créée (pas de faux doublon)", async () => {
    S.failInsert.add("jsc_quotes");
    const a = await send();
    expect(a.json.ok).toBe(false);
    expect(a.json.quote_number).toBeUndefined();
    expect(S.mail.calls).toHaveLength(0);
    S.failInsert.clear();
    const b = await send();
    expect(b.json).toMatchObject({ ok: true, email_sent: true });
    expect(b.json.duplicate).toBeUndefined();
    expect(count("jsc_quotes")).toBe(1);
  });

  it("3. deux demandes identiques simultanées : une création, l'autre « en cours » (409, sans numéro)", async () => {
    S.insertDelay = 15;
    const rs = await Promise.all([send(), send()]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    const busy = rs.find((r) => r.status === 409)!;
    expect(busy.json).toMatchObject({ ok: false, code: "in_progress" });
    expect(interpretQuoteSubmit(null, busy.json).kind).toBe("failed");
    expect(count("jsc_quotes")).toBe(1);
    expect(S.mail.calls).toHaveLength(2);
  });

  it("4. cinq demandes identiques simultanées : exactement une création", async () => {
    S.insertDelay = 15;
    const rs = await Promise.all(Array.from({ length: 5 }, () => send()));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(4);
    expect(count("jsc_quotes")).toBe(1);
    expect(S.mail.calls).toHaveLength(2);
  });

  it("5. deux demandes distinctes avec le même courriel : deux soumissions", async () => {
    await send();
    const b = await send(body({ quantity: 35 }));
    expect(b.json.duplicate).toBeUndefined();
    expect(count("jsc_quotes")).toBe(2);
  });

  it("6. même demande après 30 minutes : nouvelle soumission", async () => {
    await send();
    S.tables.public_request_guard.forEach((r) => (r.created_at = iso(31 * MIN)));
    const b = await send();
    expect(b.json.duplicate).toBeUndefined();
    expect(count("jsc_quotes")).toBe(2);
  });

  it("7. courriel client en échec : demande enregistrée, confirmation avec numéros, email_sent=false", async () => {
    S.mail.failTemplates.add("soumission-client");
    const r = await send();
    expect(r.json).toMatchObject({ ok: true, email_sent: false, notice: "confirmation_email_failed" });
    expect(r.json.quote_number).toBeTruthy();
    expect(interpretQuoteSubmit(r.json, null)).toMatchObject({ kind: "recorded", email_sent: false });
  });

  it("8. courriel interne en échec : client confirmé, demande enregistrée", async () => {
    S.mail.failTemplates.add("soumission-interne");
    const r = await send();
    expect(r.json).toMatchObject({ ok: true, email_sent: true });
    expect(count("jsc_quotes")).toBe(1);
  });

  it("9-11. répétition après succès : référence EXACTE, aucune écriture ni courriel", async () => {
    const a = await send();
    const before = { q: count("jsc_quotes"), c: count("jsc_clients"), s: count("submissions"), m: S.mail.calls.length };
    const b = await send();
    expect(b.json).toMatchObject({ ok: true, duplicate: true, quote_number: a.json.quote_number, request_number: a.json.request_number, valid_until: a.json.valid_until });
    expect({ q: count("jsc_quotes"), c: count("jsc_clients"), s: count("submissions"), m: S.mail.calls.length }).toEqual(before);
  });

  it("10b. doublon d'une demande « à confirmer » (sans prix) : numéro de demande exact", async () => {
    const custom = body({ material_id: undefined, custom_material: "Matériau fictif" });
    const a = await send(custom);
    expect(a.json).toMatchObject({ ok: true, manual: true });
    const b = await send(custom);
    expect(b.json).toMatchObject({ duplicate: true, request_number: a.json.request_number, quote_number: null });
    expect(count("jsc_requests")).toBe(1);
  });

  it("12. mécanisme transactionnel absent : mode de secours, création unique, doublon reconnu", async () => {
    S.rpcMissing = true;
    const a = await send();
    expect(a.json.ok).toBe(true);
    const b = await send();
    expect(b.json).toMatchObject({ duplicate: true, quote_number: a.json.quote_number });
    expect(count("jsc_quotes")).toBe(1);
  });

  it("aucun succès affiché sans numéro de demande", () => {
    expect(interpretQuoteSubmit({ ok: true } as any, null).kind).toBe("failed");
    expect(interpretQuoteSubmit({ ok: true, duplicate: true, quote_number: null, request_number: null } as any, null).kind).toBe("failed");
  });
});
