// Tests SIMULÉS (mémoire) du module PRÉPARÉ prepared/fonctions-guard-claim-id.
// Le SQL réel est testé par prepared/deploiement/tests/claim-id-pg.sh.
import { describe, expect, it } from "vitest";
import { runClaimedCreate, PENDING_SECONDS } from "../../prepared/fonctions-guard-claim-id/_shared/claimed-create.ts";

function fakeDb() {
  const guard: any[] = [];
  const rows: any[] = [];
  const mails: string[] = [];
  let n = 0;
  const iso = (ms = 0) => new Date(Date.now() - ms).toISOString();
  const rpc = async (name: string, a: any) => {
    if (name === "guard_claim") {
      const mine = guard.filter((r) => r.fp === a.p_fingerprint).sort((x, y) => (x.at < y.at ? 1 : -1));
      const done = mine.find((r) => r.state === "done");
      if (done) return { data: { state: "duplicate", claim_id: done.id, result: done.result }, error: null };
      const pend = mine.find((r) => r.state === "pending" && r.at >= iso(a.p_pending_seconds * 1000));
      if (pend) return { data: { state: "in_progress", claim_id: pend.id }, error: null };
      const stale = mine.find((r) => r.state === "pending");
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
      if (opts.fail) throw new Error("insertion refusée");
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
    expect(await submit(db)).toEqual({ kind: "duplicate", ref: { submission_id: "s1" } });
    expect(db.rows).toHaveLength(1);
    expect(db.mails).toHaveLength(0);
    expect(await submit(db)).toEqual({ kind: "duplicate", ref: { submission_id: "s1" } });
  });

  it("violation d'unicité : la demande de cette réservation est renvoyée", async () => {
    const db = fakeDb();
    db.rows.push({ id: "s9", claim: "c1" });
    const o = await submit(db);
    expect(o).toEqual({ kind: "duplicate", ref: { submission_id: "s9" } });
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
});
