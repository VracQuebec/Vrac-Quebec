// Tests SIMULÉS (mémoire) du module PRÉPARÉ prepared/fonctions-guard-claim-id.
// Le SQL réel est testé par prepared/deploiement/tests/claim-id-pg.sh.
import { describe, expect, it } from "vitest";
import { runClaimedCreate, PENDING_SECONDS, RejectedBeforeInsert } from "../../prepared/fonctions-guard-claim-id/_shared/claimed-create.ts";

function fakeDb() {
  const guard: any[] = [];
  const rows: any[] = [];
  const mails: string[] = [];
  let n = 0;
  const iso = (ms = 0) => new Date(Date.now() - ms).toISOString();
  const rpc = async (name: string, a: any) => {
    if (name === "guard_claim_durable") {
      const mine = guard.filter((r) => r.fp === a.p_fingerprint).sort((x, y) => (x.at < y.at ? 1 : -1));
      const pend = mine.find((r) => r.state === "pending" && r.at >= iso(a.p_pending_seconds * 1000));
      if (pend) return { data: { state: "in_progress", claim_id: pend.id }, error: null };
      const stale = mine.find((r) => r.state === "pending");
      if (stale) return { data: { state: "in_progress", claim_id: stale.id, stale_claim_id: stale.id }, error: null };
      const done = mine.find((r) => r.state === "done" && r.at >= iso(a.p_dedupe_minutes * 60000));
      if (done) return { data: { state: "duplicate", claim_id: done.id, result: done.result }, error: null };
      const r = { id: `c${++n}`, fp: a.p_fingerprint, state: "pending", at: iso() };
      guard.push(r);
      return { data: { state: "new", claim_id: r.id, stale_claim_id: stale?.id ?? null, stale_at: stale?.at ?? null }, error: null };
    }
    const r = guard.find((x) => x.id === a.p_claim_id);
    if (name === "guard_complete") { if (r) Object.assign(r, { state: "done", result: a.p_result }); return { data: !!r, error: null }; }
    if (name === "guard_release") { if (r?.state === "pending") r.state = "failed"; return { data: !!r, error: null }; }
    return { data: null, error: { code: "PGRST202", message: "absent" } };
  };
  const sb = { rpc, from: () => ({ select: () => ({ eq: () => ({ in: () => ({ gte: async () => ({ count: 0, error: null }) }) }) }) }) };
  const handlers = (opts: { crashAfterInsert?: boolean; fail?: boolean; uniqueClash?: boolean } = {}) => ({
    findByClaim: async (id: string) => { const x = rows.find((r) => r.claim === id); return x ? { submission_id: x.id } : null; },
    create: async (claim: string) => {
      if (opts.fail) throw new RejectedBeforeInsert("insertion refusée");
      if (opts.uniqueClash || rows.some((r) => r.claim === claim)) throw { code: "23505", message: "duplicate key guard_claim_id_uq" };
      const id = `s${rows.length + 1}`;
      rows.push({ id, claim });
      if (opts.crashAfterInsert) throw new Error("ARRET_SIMULE");
      return { ref: { submission_id: id }, data: null };
    },
  });
  return { sb, guard, rows, mails, handlers, age: (s: number) => guard.forEach((g) => (g.at = new Date(Date.parse(g.at) - s * 1000).toISOString())) };
}
const G = { scope: "s", identity: "x@exemple.invalid", fingerprint: "fp", ip: null as string | null };

// L'appelant n'envoie un courriel QUE sur « created » (règle reproduite ici).
async function submit(db: ReturnType<typeof fakeDb>, opts = {}) {
  const o = await runClaimedCreate(db.sb, G, db.handlers(opts));
  if (o.kind === "created") db.mails.push(o.ref.submission_id);
  return o;
}

describe("anti-doublon durable préparé (guard_claim_id)", () => {
  it("fenêtre « en cours » = 600 s", () => expect(PENDING_SECONDS).toBe(600));

  it("arrêt après création avant confirmation : reprise renvoie la demande exacte, sans courriel", async () => {
    const db = fakeDb();
    // Arrêt réel : l'instance meurt, rien n'est libéré. On le simule en
    // insérant sans confirmer.
    await db.handlers().create("c0").catch(() => {});
    db.guard.push({ id: "c0", fp: "fp", state: "pending", at: new Date().toISOString() });
    db.rows[0].claim = "c0";
    expect((await submit(db)).kind).toBe("in_progress");
    db.age(601);
    expect(await submit(db)).toEqual({ kind: "duplicate", ref: { submission_id: "s1" }, claimId: 'c0' });
    expect(db.rows).toHaveLength(1);
    expect(db.mails).toHaveLength(0);
    expect(await submit(db)).toEqual({ kind: "duplicate", ref: { submission_id: "s1" }, claimId: 'c0' });
  });

  it("violation d'unicité : la demande de cette réservation est renvoyée", async () => {
    const db = fakeDb();
    db.rows.push({ id: "s9", claim: "c1" });
    const o = await submit(db);
    expect(o).toEqual({ kind: "duplicate", ref: { submission_id: "s9" }, claimId: 'c1' });
  });

  it("échec puis reprise : créée, un seul courriel", async () => {
    const db = fakeDb();
    await expect(submit(db, { fail: true })).rejects.toThrow();
    expect((await submit(db)).kind).toBe("created");
    expect(db.mails).toHaveLength(1);
  });

  it("répétition après succès : aucun nouvel enregistrement ni courriel", async () => {
    const db = fakeDb();
    await submit(db); await submit(db); await submit(db);
    expect(db.rows).toHaveLength(1);
    expect(db.mails).toHaveLength(1);
  });

  it("erreur après commit : retrouve le dossier sans libérer ni renvoyer", async () => {
    const db = fakeDb();
    expect((await submit(db, { crashAfterInsert: true })).kind).toBe('duplicate');
    expect(db.guard[0].state).toBe('done');
    await submit(db);
    expect(db.rows).toHaveLength(1);
    expect(db.mails).toHaveLength(0);
  });

  it("erreur réseau avant commit tardif : barrière même après 31 minutes", async () => {
    const db = fakeDb();
    await expect(runClaimedCreate(db.sb, G, { ...db.handlers(), create: async () => { throw Error('réseau'); } })).rejects.toThrow('réseau');
    db.age(1861);
    expect((await submit(db)).kind).toBe('in_progress');
    expect(db.guard).toHaveLength(1);
    expect(db.rows).toHaveLength(0);
    db.rows.push({ id: 'tardif', claim: 'c1' });
    expect(await submit(db)).toEqual({ kind: 'duplicate', ref: { submission_id: 'tardif' }, claimId: 'c1' });
    expect(db.mails).toHaveLength(0);
  });

  it("lecture exacte en panne : aucune insertion ou libération", async () => {
    const db = fakeDb();
    db.guard.push({ id: 'c0', fp: 'fp', state: 'pending', at: new Date(0).toISOString() });
    await expect(runClaimedCreate(db.sb, G, { ...db.handlers(), findByClaim: async () => { throw Error('lecture'); } })).rejects.toThrow('lecture');
    expect(db.rows).toHaveLength(0);
    expect(db.guard[0].state).toBe('pending');
  });

  it("RPC absente : aucun secours non atomique ni création", async () => {
    const db = fakeDb();
    const sb = { ...db.sb, rpc: async () => ({ error: { code: 'PGRST202' }, data: null }) };
    await expect(runClaimedCreate(sb, G, db.handlers())).rejects.toThrow('transactionnelle');
    expect(db.rows).toHaveLength(0);
  });

  it("succès confirmé hors fenêtre de 30 minutes : nouvelle demande indépendante", async () => {
    const db = fakeDb();
    await submit(db); db.age(1801); await submit(db);
    expect(db.rows).toHaveLength(2);
    expect(db.rows[0].claim).not.toBe(db.rows[1].claim);
    expect(db.mails).toHaveLength(2);
  });

  it("ancienne instance encore active après 600 secondes : aucune deuxième création", async () => {
    const db = fakeDb();
    let finish: (() => void) | undefined;
    const barrier = new Promise<void>(resolve => { finish = resolve; });
    const first = runClaimedCreate(db.sb, G, { ...db.handlers(), create: async (id) => { await barrier; return db.handlers().create(id); } });
    await new Promise(resolve => setTimeout(resolve, 0));
    db.age(601);
    expect((await submit(db)).kind).toBe('in_progress');
    finish?.();
    expect((await first).kind).toBe('created');
    expect(db.rows).toHaveLength(1);
    expect(db.guard).toHaveLength(1);
  });
});
