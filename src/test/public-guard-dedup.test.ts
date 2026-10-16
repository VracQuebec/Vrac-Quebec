// Tests ciblés de la déduplication des demandes de remblai (submit-parcours).
// Base simulée en mémoire avec filtres réels (eq/gte/order) pour vérifier
// les fenêtres de temps, sans toucher à la production.
import { describe, expect, it } from "vitest";
import { guardPublicRequest } from "../../supabase/functions/_shared/public-guard.ts";

const MIN = 60_000;

function statefulDb(seed: Array<Record<string, any>> = []) {
  const rows = [...seed];
  const matches = (row: any, filters: any[]) =>
    filters.every((f) => {
      if (f.op === "eq") return row[f.col] === f.val;
      if (f.op === "in") return (f.val as any[]).includes(row[f.col]);
      if (f.op === "gte") return row[f.col] >= f.val;
      return true;
    });
  return {
    rows,
    from() {
      const filters: any[] = [];
      let headCount = false;
      const chain: any = {
        eq: (col: string, val: any) => (filters.push({ op: "eq", col, val }), chain),
        in: (col: string, val: any) => (filters.push({ op: "in", col, val }), chain),
        gte: (col: string, val: any) => (filters.push({ op: "gte", col, val }), chain),
        order: () => chain,
        limit: () => chain,
        select: (_cols?: string, opts?: { head?: boolean }) => {
          if (opts?.head) headCount = true;
          return chain;
        },
        maybeSingle: async () => {
          const found = rows.filter((r) => matches(r, filters))
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return { data: found[0] ?? null };
        },
        insert: async (row: any) => (rows.push({ ...row, created_at: new Date().toISOString() }), { error: null }),
        update: () => chain,
        then: (res: any) => res(headCount
          ? { count: rows.filter((r) => matches(r, filters)).length, error: null }
          : { data: rows.filter((r) => matches(r, filters)), error: null }),
      };
      return chain;
    },
    // Simulation du RPC guard_check_and_log de la migration préparée :
    // verrou consultatif par empreinte (file d'attente = sérialisation),
    // lecture de la fenêtre puis insertion dans la même « transaction ».
    rpc(name: string, args: any) {
      if (name !== "guard_check_and_log") return Promise.resolve({ data: null, error: { message: "inconnu" } });
      const key = `${args.p_scope}|${args.p_fingerprint}`;
      locks.set(key, (locks.get(key) ?? Promise.resolve()).then(async () => {
        const cutoff = new Date(Date.now() - (args.p_dedupe_minutes ?? 30) * MIN).toISOString();
        const prev = rows
          .filter((r) => r.scope === args.p_scope && r.fingerprint === args.p_fingerprint && r.created_at >= cutoff)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
        rows.push({
          scope: args.p_scope, identity: args.p_identity, fingerprint: args.p_fingerprint,
          payload: args.p_payload ?? {}, created_at: new Date().toISOString(),
        });
        return {
          data: { duplicate: Boolean(prev), previous: prev?.payload ?? {}, previous_at: prev?.created_at ?? null },
          error: null,
        };
      }));
      return locks.get(key)!;
    },
  };
}

// File de sérialisation par empreinte : simule pg_advisory_xact_lock.
const locks = new Map<string, Promise<any>>();

const req = { scope: "parcours-reception", identity: "client@exemple.ca", fingerprint: "fp-identique", ip: "1.2.3.4" };

describe("déduplication des demandes de remblai", () => {
  it("deux soumissions identiques rapprochées : la seconde est signalée doublon", async () => {
    const db = statefulDb();
    const first = await guardPublicRequest(db as any, req);
    expect(first.duplicate).toBe(false); // première demande : créée
    const second = await guardPublicRequest(db as any, req);
    expect(second.duplicate).toBe(true); // seconde identique : doublon, pas de nouvel enregistrement
  });

  it("une demande identique envoyée bien plus tard reste créable", async () => {
    // Empreinte identique mais enregistrée il y a 31 minutes (fenêtre de 30 min).
    const db = statefulDb([{
      scope: req.scope, identity: req.identity, fingerprint: req.fingerprint,
      payload: {}, created_at: new Date(Date.now() - 31 * MIN).toISOString(),
    }]);
    const v = await guardPublicRequest(db as any, req);
    expect(v.duplicate).toBe(false); // hors fenêtre : nouvelle demande légitime
  });

  it("la fenêtre de déduplication ne bloque pas un jour/mois plus tard", async () => {
    const db = statefulDb([{
      scope: req.scope, identity: req.identity, fingerprint: req.fingerprint,
      payload: {}, created_at: new Date(Date.now() - 90 * 24 * 60 * MIN).toISOString(),
    }]);
    const v = await guardPublicRequest(db as any, req);
    expect(v.duplicate).toBe(false);
  });

  it("la fenêtre de débit (5/h) continue de bloquer les abus répétés", async () => {
    const now = Date.now();
    const db = statefulDb(Array.from({ length: 5 }, (_, i) => ({
      scope: req.scope, identity: req.identity, fingerprint: `fp-${i}`,
      payload: {}, created_at: new Date(now - (i + 1) * MIN).toISOString(),
    })));
    await expect(guardPublicRequest(db as any, req)).rejects.toThrow(/Trop de demandes/);
  });

  it("deux envois simultanés identiques : un seul crée, l'autre est doublon (RPC transactionnel)", async () => {
    // Avec le RPC guard_check_and_log (verrou consultatif), la seconde
    // requête attend la fin de la « transaction » de la première et voit sa
    // ligne : exactement une création, même en concurrence parfaite.
    const db = statefulDb();
    const [a, b] = await Promise.all([
      guardPublicRequest(db as any, req),
      guardPublicRequest(db as any, req),
    ]);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    const created = db.rows.filter((r) => r.scope === req.scope && r.fingerprint === req.fingerprint);
    expect(created).toHaveLength(2); // 2 lignes de journal, mais 1 seul verdict « création »
  });

  it("cinq envois simultanés identiques : un seul verdict « création »", async () => {
    const db = statefulDb();
    const verdicts = await Promise.all(Array.from({ length: 5 }, () => guardPublicRequest(db as any, req)));
    expect(verdicts.filter((v) => !v.duplicate)).toHaveLength(1);
    expect(verdicts.filter((v) => v.duplicate)).toHaveLength(4);
  });

  it("idempotence : la répétition bloquée retourne le contenu précédent sans nouvelle décision", async () => {
    const db = statefulDb();
    const first = await guardPublicRequest(db as any, req);
    expect(first.duplicate).toBe(false);
    const second = await guardPublicRequest(db as any, req);
    expect(second.duplicate).toBe(true);
    expect(second.previous).toBeTruthy(); // l'appelant retrouve la référence existante
    const third = await guardPublicRequest(db as any, req);
    expect(third.duplicate).toBe(true);
  });
});
