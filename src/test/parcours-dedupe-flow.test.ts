// Cycle de vie anti-doublon de submit-parcours (claim → complete | release).
// Base simulée EN MÉMOIRE qui reproduit la sémantique des fonctions SQL
// préparées (guard_claim / guard_complete / guard_release), sérialisées par
// empreinte comme pg_advisory_xact_lock. La concurrence RÉELLE PostgreSQL
// est vérifiée séparément : prepared/deploiement/tests/concurrence-pg.sh.
import { describe, expect, it, vi } from "vitest";
import { runDedupedCreate, parcoursFingerprint } from "../../supabase/functions/submit-parcours/dedupe-flow.ts";
import { classifyRpcError, guardFallbackStats } from "../../supabase/functions/_shared/public-guard.ts";

const MIN = 60_000;
type Row = { id: string; scope: string; identity: string; fingerprint: string; payload: any; created_at: string };

function fakeDb(opts: { rpc?: boolean; seed?: Row[]; rpcError?: any } = {}) {
  const guard: Row[] = [...(opts.seed ?? [])];
  const submissions: any[] = [];
  let n = 0;
  const locks = new Map<string, Promise<any>>();
  const iso = (ms = 0) => new Date(Date.now() - ms).toISOString();

  const table = (name: string) => {
    const filters: Array<(r: any) => boolean> = [];
    let head = false;
    const rows = () => (name === "submissions" ? submissions : guard).filter((r) => filters.every((f) => f(r)));
    const c: any = {
      select: (_c?: string, o?: { head?: boolean }) => ((head = !!o?.head), c),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), c),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), c),
      gte: (k: string, v: any) => (filters.push((r) => r[k] >= v), c),
      ilike: (k: string, v: string) => (filters.push((r) => String(r[k]).toLowerCase() === v.replace(/\\/g, "").toLowerCase()), c),
      order: () => c,
      limit: () => c,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: (row: any) => {
        const r = { id: `g${++n}`, created_at: iso(), ...row };
        guard.push(r);
        return { select: () => ({ single: async () => ({ data: { id: r.id }, error: null }) }) };
      },
      update: (patch: any) => ({
        eq: async (k: string, v: any) => {
          guard.filter((r) => r[k] === v).forEach((r) => Object.assign(r, patch));
          return { error: null };
        },
      }),
      then: (res: any) => res(head ? { count: rows().length, error: null } : { data: rows().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), error: null }),
    };
    return c;
  };

  const rpcImpl = async (name: string, a: any) => {
    if (opts.rpcError) return { data: null, error: opts.rpcError };
    if (name === "guard_claim") {
      if (!a.p_fingerprint?.trim() || a.p_dedupe_minutes < 1 || a.p_dedupe_minutes > 1440)
        return { data: null, error: { code: "22023", message: "guard: paramètre invalide" } };
      const mine = guard.filter((r) => r.scope === a.p_scope && r.fingerprint === a.p_fingerprint && r.created_at >= iso(a.p_dedupe_minutes * MIN))
        .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
      const done = mine.find((r) => r.payload.state === "done");
      if (done) return { data: { state: "duplicate", claim_id: done.id, result: done.payload.result }, error: null };
      const pend = mine.find((r) => r.payload.state === "pending" && r.created_at >= iso(a.p_pending_seconds * 1000));
      if (pend) return { data: { state: "in_progress", claim_id: pend.id }, error: null };
      const stale = mine.find((r) => r.payload.state === "pending");
      const r = { id: `g${++n}`, scope: a.p_scope, identity: a.p_identity, fingerprint: a.p_fingerprint, payload: { ...a.p_payload, state: "pending" }, created_at: iso() };
      guard.push(r);
      return { data: { state: "new", claim_id: r.id, stale_claim_id: stale?.id ?? null, stale_at: stale?.created_at ?? null }, error: null };
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
    return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
  };

  const db: any = { guard, submissions, from: table };
  if (opts.rpc !== false) {
    db.rpc = (name: string, a: any) => {
      const key = `${a.p_scope}|${a.p_fingerprint ?? a.p_claim_id}`;
      const p = (locks.get(key) ?? Promise.resolve()).then(() => rpcImpl(name, a));
      locks.set(key, p);
      return p;
    };
  }
  /** Création simulée de la demande (insert submissions). */
  db.creator = (fail = false, delayMs = 0) => async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    if (fail) throw new Error("insertion refusée");
    const id = `sub-${submissions.length + 1}`;
    submissions.push({ id, email: "Client@Exemple.ca", address: "12 rue A", parcours_direction: "reception", quantity: "30 tonnes", created_at: iso() });
    return { submissionId: id, data: {} };
  };
  return db;
}

const guardOpts = { scope: "parcours-reception", identity: "client@exemple.ca", ip: "1.2.3.4" };
const key = { email: "Client@Exemple.ca", address: "12 rue A", variant: "reception" as const, quantityLabel: "30 tonnes", materials: ["Sable", "Terre"] };

describe("submit-parcours — cycle de vie anti-doublon", () => {
  it("1. échec AVANT création (géocodage/validation) puis nouvelle tentative valide : créée", async () => {
    const db = fakeDb();
    await expect(runDedupedCreate(db, guardOpts, key, async () => { throw new Error("géocodage"); })).rejects.toThrow();
    expect(db.guard[0].payload.state).toBe("failed");
    const r = await runDedupedCreate(db, guardOpts, key, db.creator());
    expect(r.kind).toBe("created");
    expect(db.submissions).toHaveLength(1);
  });

  it("2. échec de l'insertion puis nouvelle tentative : une seule demande, pas de faux doublon", async () => {
    const db = fakeDb();
    await expect(runDedupedCreate(db, guardOpts, key, db.creator(true))).rejects.toThrow("insertion refusée");
    const r = await runDedupedCreate(db, guardOpts, key, db.creator());
    expect(r).toMatchObject({ kind: "created", submissionId: "sub-1" });
  });

  it("3. deux demandes identiques concurrentes : une création, l'autre « en cours » (jamais de faux succès)", async () => {
    const db = fakeDb();
    const [a, b] = await Promise.all([
      runDedupedCreate(db, guardOpts, key, db.creator(false, 20)),
      runDedupedCreate(db, guardOpts, key, db.creator(false, 20)),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(["created", "in_progress"]);
    expect(db.submissions).toHaveLength(1);
    // Nouvel essai après la fin : la référence EXACTE est renvoyée.
    const c = await runDedupedCreate(db, guardOpts, key, db.creator());
    expect(c).toEqual({ kind: "duplicate", submissionId: "sub-1" });
  });

  it("4. cinq demandes identiques concurrentes : exactement une création", async () => {
    const db = fakeDb();
    const all = await Promise.all(Array.from({ length: 5 }, () => runDedupedCreate(db, guardOpts, key, db.creator(false, 20))));
    expect(all.filter((x) => x.kind === "created")).toHaveLength(1);
    expect(all.filter((x) => x.kind === "in_progress")).toHaveLength(4);
    expect(db.submissions).toHaveLength(1);
  });

  it("5. deux demandes différentes avec le même courriel : deux créations distinctes", async () => {
    const db = fakeDb();
    const a = await runDedupedCreate(db, guardOpts, key, db.creator());
    const b = await runDedupedCreate(db, guardOpts, { ...key, address: "99 chemin B" }, db.creator());
    expect(a.kind).toBe("created");
    expect(b.kind).toBe("created");
    expect(db.submissions).toHaveLength(2);
  });

  it("6. même adresse, variante différente : empreintes distinctes", async () => {
    expect(await parcoursFingerprint(key)).not.toBe(await parcoursFingerprint({ ...key, variant: "evacuation" }));
    const db = fakeDb();
    await runDedupedCreate(db, guardOpts, key, db.creator());
    const b = await runDedupedCreate(db, { ...guardOpts, scope: "parcours-evacuation" }, { ...key, variant: "evacuation" }, db.creator());
    expect(b.kind).toBe("created");
  });

  it("empreinte : normalisation (casse, espaces, ordre des matériaux) et aucune donnée en clair", async () => {
    const fp = await parcoursFingerprint(key);
    expect(fp).toBe(await parcoursFingerprint({ ...key, email: " client@exemple.CA ", address: "12  RUE a", materials: ["terre", "sable"] }));
    expect(fp).not.toContain("exemple");
    expect(fp).toMatch(/^v2:[0-9a-f]{64}$/);
  });

  const seedDone = async (ageMs: number): Promise<Row> => ({
    id: "old", scope: guardOpts.scope, identity: guardOpts.identity, fingerprint: await parcoursFingerprint(key),
    payload: { state: "done", result: { submission_id: "sub-ancienne" } }, created_at: new Date(Date.now() - ageMs).toISOString(),
  });

  it("7a. même demande DANS la fenêtre de 30 min : référence initiale exacte", async () => {
    const db = fakeDb({ seed: [await seedDone(29 * MIN)] });
    expect(await runDedupedCreate(db, guardOpts, key, db.creator())).toEqual({ kind: "duplicate", submissionId: "sub-ancienne" });
    expect(db.submissions).toHaveLength(0);
  });

  it("7b. même demande APRÈS 30 min : nouvelle demande légitime", async () => {
    const db = fakeDb({ seed: [await seedDone(31 * MIN)] });
    expect((await runDedupedCreate(db, guardOpts, key, db.creator())).kind).toBe("created");
  });

  it("8. même demande plusieurs jours plus tard : créée", async () => {
    const db = fakeDb({ seed: [await seedDone(5 * 24 * 60 * MIN)] });
    expect((await runDedupedCreate(db, guardOpts, key, db.creator())).kind).toBe("created");
  });

  it("9. courriel échoué après enregistrement : la demande reste créée et mémorisée", async () => {
    // Les courriels sont envoyés par l'appelant APRÈS runDedupedCreate et ne
    // participent pas au verdict : un échec d'envoi ne libère pas la réservation.
    const db = fakeDb();
    const r = await runDedupedCreate(db, guardOpts, key, db.creator());
    const sendEmail = vi.fn().mockRejectedValue(new Error("Resend 500"));
    await sendEmail().catch(() => undefined);
    expect(r).toMatchObject({ kind: "created", remembered: true });
    expect(db.guard[0].payload.state).toBe("done");
  });

  it("10. répétition après succès : aucun nouvel enregistrement, aucune création (donc aucun courriel)", async () => {
    const db = fakeDb();
    await runDedupedCreate(db, guardOpts, key, db.creator());
    const create = vi.fn(db.creator());
    const r = await runDedupedCreate(db, guardOpts, key, create);
    expect(r).toEqual({ kind: "duplicate", submissionId: "sub-1" });
    expect(create).not.toHaveBeenCalled();
    expect(db.submissions).toHaveLength(1);
  });

  it("10b. jamais la référence d'une autre demande du même courriel", async () => {
    const db = fakeDb();
    await runDedupedCreate(db, guardOpts, { ...key, address: "1 autre rue" }, db.creator());
    const r = await runDedupedCreate(db, guardOpts, key, db.creator());
    expect(r).toMatchObject({ kind: "created", submissionId: "sub-2" });
  });

  it("réservation orpheline expirée : la demande déjà créée est retrouvée par TOUS les critères", async () => {
    const fp = await parcoursFingerprint(key);
    const db = fakeDb({ seed: [{ id: "stale", scope: guardOpts.scope, identity: "x", fingerprint: fp, payload: { state: "pending" }, created_at: new Date(Date.now() - 5 * MIN).toISOString() }] });
    db.submissions.push({ id: "sub-orpheline", email: "client@exemple.ca", address: "12 rue A", parcours_direction: "reception", quantity: "30 tonnes", created_at: new Date(Date.now() - 4 * MIN).toISOString() });
    const create = vi.fn(db.creator());
    expect(await runDedupedCreate(db, guardOpts, key, create)).toEqual({ kind: "duplicate", submissionId: "sub-orpheline" });
    expect(create).not.toHaveBeenCalled();
  });

  it("11a. fonction SQL absente (PGRST202) : secours activé, journalisé, compté", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const before = guardFallbackStats.migrationAbsente;
    const db = fakeDb({ rpcError: { code: "PGRST202", message: "Could not find the function public.guard_claim" } });
    const r = await runDedupedCreate(db, guardOpts, key, db.creator());
    expect(r.kind).toBe("created");
    expect(guardFallbackStats.migrationAbsente).toBeGreaterThan(before);
    const line = warn.mock.calls.map((c) => String(c[0])).find((l) => l.includes("guard.fallback_active"))!;
    expect(JSON.parse(line)).toMatchObject({ reason: "migration_absente", protection_concurrence: "inactive" });
    expect(line).not.toMatch(/exemple|1\.2\.3\.4/); // aucune donnée personnelle
    warn.mockRestore();
  });

  it("11b. erreur SQL inattendue : aucune création, erreur 503 (pas de faux succès)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({ rpcError: { code: "57014", message: "canceling statement due to statement timeout" } });
    const create = vi.fn(db.creator());
    await expect(runDedupedCreate(db, guardOpts, key, create)).rejects.toMatchObject({ status: 503 });
    expect(create).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("classification des erreurs RPC", () => {
    expect(classifyRpcError({ code: "42883", message: "function does not exist" })).toBe("migration_absente");
    expect(classifyRpcError({ code: "PGRST202" })).toBe("migration_absente");
    expect(classifyRpcError({ code: "22023", message: "guard: empreinte vide" })).toBe("erreur_inattendue");
  });

  it("12. paramètres invalides refusés avant toute écriture (côté module)", async () => {
    const db = fakeDb();
    await expect(runDedupedCreate(db, { ...guardOpts, dedupeMinutes: 0 }, key, db.creator())).rejects.toBeTruthy();
    expect(db.submissions).toHaveLength(0);
  });
});
