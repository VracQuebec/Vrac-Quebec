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
  };
}

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

  it("RISQUE CONNU — deux envois simultanés identiques passent tous deux", async () => {
    // La vérification (étape 5) précède la journalisation (étape 6) :
    // deux requêtes concurrentes lisent avant que l'autre n'écrive.
    // Ce test documente le comportement actuel; il devra être inversé
    // après l'ajout d'une contrainte d'unicité côté base (PRÉPARÉ, non appliqué).
    const db = statefulDb();
    const [a, b] = await Promise.all([
      guardPublicRequest(db as any, req),
      guardPublicRequest(db as any, req),
    ]);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false); // les deux passent : course constatée
  });
});
