import { describe, it, expect } from "vitest";
import { availabilityRefusal, checkAvailability } from "../../../supabase/functions/_shared/seo-availability-guard";

const rpcReturning = (seq: unknown[]) => {
  let i = 0; let calls = 0;
  const fn = async () => { calls++; return { data: seq[Math.min(i++, seq.length - 1)], error: null }; };
  return { fn, calls: () => calls };
};

describe("garde de disponibilité serveur", () => {
  it("confirmée : génération autorisée", async () => {
    expect(await checkAvailability(rpcReturning(["confirmee"]).fn, "a", "remblai", null)).toEqual({ ok: true });
  });
  it("inconnue : refus 403", async () => {
    const r = await checkAvailability(rpcReturning(["inconnue"]).fn, "a", "sable", null);
    expect(r.ok).toBe(false); expect((r as any).status).toBe(403);
  });
  it("exclue : refus 403", async () => {
    const r = await checkAvailability(rpcReturning(["exclue"]).fn, "a", null, "dompe");
    expect(r.ok).toBe(false); expect((r as any).error).toMatch(/exclue/);
  });
  it("valeur absente ou inattendue = inconnue, jamais confirmée", () => {
    expect(availabilityRefusal(null)).toMatch(/inconnue/);
    expect(availabilityRefusal("confirmée")).toMatch(/inconnue/);
  });
  it("erreur de lecture : refus 503, aucun traitement", async () => {
    const r = await checkAvailability(async () => ({ data: null, error: { message: "x" } }), "a", null, null);
    expect(r.ok).toBe(false); expect((r as any).status).toBe(503);
  });
  it("tâches en file : chaque tâche relue à l'exécution, changement entre sélection et exécution refusé", async () => {
    const rpc = rpcReturning(["confirmee", "exclue", "inconnue"]);
    const results = [];
    for (let k = 0; k < 3; k++) results.push((await checkAvailability(rpc.fn, "a", "remblai", null)).ok);
    expect(results).toEqual([true, false, false]);
    expect(rpc.calls()).toBe(3);
  });
});
