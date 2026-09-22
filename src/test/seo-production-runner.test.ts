import { describe, it, expect, beforeEach } from "vitest";
import {
  ProductionRunner, chunk, selectMissingTargets, remainingTargets, runProgress,
  type RunTarget,
} from "@/lib/seo/productionRunner";

function target(key: string, priority: 1 | 2 | 3 | 4 = 4, score = 10): RunTarget {
  return { key, priority, label: key, score, city: { slug: key, name: key, region: "r" } };
}

describe("File de production — sélection et lots", () => {
  it("ne retient que les combinaisons réellement manquantes", () => {
    const items = [
      { ...target("a", 4), existing: undefined },
      { ...target("b", 4), existing: { id: "1" } },
      { ...target("c", 1), existing: undefined },
    ];
    const missing = selectMissingTargets(items as never);
    expect(missing.map((m) => m.key)).toEqual(["c", "a"]);
  });

  it("respecte le filtre de priorité et l'ordre P1 → P4", () => {
    const items = [
      { ...target("p4", 4, 50) }, { ...target("p1", 1, 5) }, { ...target("p2", 2, 90) },
    ];
    expect(selectMissingTargets(items as never).map((m) => m.key)).toEqual(["p1", "p2", "p4"]);
    expect(selectMissingTargets(items as never, 4).map((m) => m.key)).toEqual(["p4"]);
  });

  it("découpe en lots de la taille demandée", () => {
    const list = Array.from({ length: 7 }, (_, i) => target(`t${i}`));
    expect(chunk(list, 3).map((b) => b.length)).toEqual([3, 3, 1]);
  });

  it("la reprise ignore les cibles déjà traitées", () => {
    const list = [target("a"), target("b"), target("c")];
    expect(remainingTargets(list, ["a", "c"]).map((t) => t.key)).toEqual(["b"]);
  });
});

describe("File de production — exécution par lots", () => {
  beforeEach(() => { localStorage.clear(); });

  it("produit toutes les pages manquantes par lots sans intervention page par page", async () => {
    const runner = new ProductionRunner();
    const generated: string[] = [];
    const targets = Array.from({ length: 5 }, (_, i) => target(`t${i}`));
    const state = await runner.start(targets, { batchSize: 2, threshold: 90 }, {
      exists: async () => false,
      generate: async (t) => { generated.push(t.key); return { ok: true, score: 95 }; },
    });
    expect(generated).toHaveLength(5);
    expect(state.batches.map((b) => b.requested)).toEqual([2, 2, 1]);
    expect(state.produced).toBe(5);
    expect(state.conforme).toBe(5);
    expect(state.status).toBe("done");
    expect(runProgress(state)).toMatchObject({ done: 5, remaining: 0, percent: 100 });
  }, 20000);

  it("ignore les pages existantes et n'appelle jamais le moteur pour elles", async () => {
    const runner = new ProductionRunner();
    const generated: string[] = [];
    const targets = [target("a"), target("b")];
    const state = await runner.start(targets, { batchSize: 2, threshold: 90 }, {
      exists: async (t) => t.key === "a",
      generate: async (t) => { generated.push(t.key); return { ok: true, score: 95 }; },
    });
    expect(generated).toEqual(["b"]);
    expect(state.skipped).toBe(1);
    expect(state.produced).toBe(1);
  }, 20000);

  it("est idempotent : un second lancement sur le même état ne produit rien", async () => {
    const runner = new ProductionRunner();
    const targets = [target("a")];
    await runner.start(targets, { batchSize: 10, threshold: 90 }, {
      exists: async () => false,
      generate: async () => ({ ok: true, score: 95 }),
    });
    const calls: string[] = [];
    const again = await runner.start(targets, { batchSize: 10, threshold: 90, resume: true }, {
      exists: async () => true,
      generate: async (t) => { calls.push(t.key); return { ok: true, score: 95 }; },
    });
    expect(calls).toEqual([]);
    expect(again.produced).toBe(1);
  }, 20000);

  it("une erreur individuelle n'arrête pas la production", async () => {
    const runner = new ProductionRunner();
    const targets = [target("a"), target("b"), target("c")];
    const state = await runner.start(targets, { batchSize: 3, threshold: 90 }, {
      exists: async () => false,
      generate: async (t) => (t.key === "b" ? { ok: false, error: "429 quota" } : { ok: true, score: 95 }),
    });
    expect(state.errors).toBe(1);
    expect(state.conforme).toBe(2);
    expect(state.processedKeys).toHaveLength(3);
    expect(state.issues[0]).toMatchObject({ label: "b", reason: "429 quota", kind: "error" });
  }, 20000);

  it("classe « à vérifier » une page qui échoue au contrôle qualité", async () => {
    const runner = new ProductionRunner();
    const state = await runner.start([target("a")], { batchSize: 10, threshold: 90 }, {
      exists: async () => false,
      generate: async () => ({ ok: true, score: 72, blockers: ["H1 manquant"] }),
    });
    expect(state.aVerifier).toBe(1);
    expect(state.conforme).toBe(0);
    expect(state.issues[0]).toMatchObject({ kind: "qa", reason: "H1 manquant" });
  }, 20000);

  it("reprend une production interrompue sans recréer les pages déjà produites", async () => {
    const runner = new ProductionRunner();
    const targets = Array.from({ length: 4 }, (_, i) => target(`t${i}`));
    const seen: string[] = [];
    const first = runner.start(targets, { batchSize: 1, threshold: 90 }, {
      exists: async () => false,
      generate: async (t) => { seen.push(t.key); runner.pause(); return { ok: true, score: 95 }; },
    });
    const paused = await first;
    expect(paused.status).toBe("paused");
    expect(seen).toEqual(["t0"]);

    const resumed = await runner.start(targets, { batchSize: 2, threshold: 90, resume: true }, {
      exists: async () => false,
      generate: async (t) => { seen.push(t.key); return { ok: true, score: 95 }; },
    });
    expect(seen).toEqual(["t0", "t1", "t2", "t3"]);
    expect(resumed.status).toBe("done");
    expect(resumed.total).toBe(4);
    expect(new Set(resumed.processedKeys).size).toBe(4);
  }, 30000);
});
