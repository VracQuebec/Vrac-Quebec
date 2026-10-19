import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { conditionsSchema, unknownConditions } from "@/lib/remblai/conditions";
import { RemblaiService, digest, type Repository, type RequestRecord, type LinkRecord } from "@/lib/remblai/service";
// The same service methods are tested through an isolated transactional repository.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
async function fixture() {
  let now = 1000000;
  const row: RequestRecord = { id: "request-a", reference: "TEST", name: "Exemple", city: "Québec", status: "nouveau", availability: "a_confirmer", lastConfirmed: null, version: 1, conditions: unknownConditions(), proposals: [], deliveries: [], history: [] };
  const links = new Map<string, LinkRecord>([["link-a", { id: "link-a", requestId: row.id, digest: await digest("fictional-secret"), expiresAt: now + 5000000, revoked: false, verifiedContact: true, verifiedAt: now, codeDigest: null, codeExpires: 0, failures: 0 }]]);
  const results = new Map<string, RequestRecord>();
  let current = structuredClone(row); let queue: Promise<unknown> = Promise.resolve();
  const repo: Repository = {
    getLink: async id => structuredClone(links.get(id) ?? null), putLink: async link => { links.set(link.id, structuredClone(link)); },
    getRequest: async id => id === row.id ? structuredClone(current) : null, putRequest: async next => { current = structuredClone(next); },
    getResult: async id => structuredClone(results.get(id) ?? null), putResult: async (id, result) => { results.set(id, structuredClone(result)); },
    transaction: work => { const next = queue.then(work); queue = next.catch(() => undefined); return next; },
  };
  const input = { linkId: "link-a", secret: "fictional-secret", requestId: row.id, action: "pause" as const, confirmed: true, operationId: "operation-00000000001", version: 1 };
  return { service: new RemblaiService(repo, () => now), repo, input, links, results, advance: (ms: number) => { now += ms; } };
}
describe("EXEC-01 rules", () => {
  it("keeps unknown original quantities and never defaults old dossiers to preauthorised", () => { const c = unknownConditions(); expect(c.total).toBeNull(); expect(c.remaining).toBeNull(); expect(c.unit).toBe("inconnu"); expect(c.mode).toBe("a_confirmer"); });
  it("rejects remaining greater than total", () => { expect(conditionsSchema.safeParse({ ...unknownConditions(), total: 10, remaining: 11, unit: "tonnes" }).success).toBe(false); });
  it("requires original unit for all numeric quantities", () => { expect(conditionsSchema.safeParse({ ...unknownConditions(), minimumDelivery: 2 }).success).toBe(false); });
  it("requires explicit conditions and period for preauthorised preference", () => { expect(conditionsSchema.safeParse({ ...unknownConditions(), mode: "preautorisee" }).success).toBe(false); });
  it("requires slots for appointment preference", () => { expect(conditionsSchema.safeParse({ ...unknownConditions(), mode: "creneaux" }).success).toBe(false); });
  it("never presumes promotional consent or environmental acceptance", () => { const c = unknownConditions(); expect(c.promotional).toBe(false); expect(c.environmental).toBe("a_valider"); for (const name of ["Branches", "Souches", "Déchets"]) expect(c.materials.find(m => m.name === name)?.stance).toBe("a_confirmer"); });
  it("scanner read does not mutate dossier, token or history", async () => { const f = await fixture(); const before = await f.repo.getRequest(f.input.requestId); const linkBefore = await f.repo.getLink("link-a"); await f.service.read("link-a", f.input.secret, f.input.requestId); expect(await f.repo.getRequest(f.input.requestId)).toEqual(before); expect(await f.repo.getLink("link-a")).toEqual(linkBefore); });
  it("rejects wrong dossier", async () => { const f = await fixture(); await expect(f.service.read("link-a", f.input.secret, "request-b")).rejects.toThrow(); });
  it("rejects wrong secret", async () => { const f = await fixture(); await expect(f.service.read("link-a", "incorrect", f.input.requestId)).rejects.toThrow(); });
  it("rejects expired link", async () => { const f = await fixture(); f.advance(6000000); await expect(f.service.read("link-a", f.input.secret, f.input.requestId)).rejects.toThrow(); });
  it("rejects revoked link", async () => { const f = await fixture(); const link = await f.repo.getLink("link-a"); if (!link) throw Error(); await f.repo.putLink({ ...link, revoked: true }); await expect(f.service.read("link-a", f.input.secret, f.input.requestId)).rejects.toThrow(); });
  it("requires explicit confirmation for writes", async () => { const f = await fixture(); await expect(f.service.act({ ...f.input, confirmed: false })).rejects.toThrow("explicite"); });
  it("requires recent code for sensitive action", async () => { const f = await fixture(); f.advance(600001); await expect(f.service.act(f.input)).rejects.toThrow("code récent"); });
  it("pause leaves commercial status unchanged", async () => { const f = await fixture(); const result = await f.service.act(f.input); expect(result.availability).toBe("suspended"); expect(result.status).toBe("nouveau"); });
  it("resume requires revalidation, not confirmed delivery", async () => { const f = await fixture(); await f.service.act(f.input); const result = await f.service.act({ ...f.input, operationId: "operation-00000000002", version: 2, action: "reprendre" }); expect(result.availability).toBe("a_confirmer"); expect(result.deliveries).toEqual([]); });
  it("double concurrent submission records exactly one history event", async () => { const f = await fixture(); const [a, b] = await Promise.all([f.service.act(f.input), f.service.act(f.input)]); expect(a).toEqual(b); expect((await f.repo.getRequest(f.input.requestId))?.history).toHaveLength(1); expect(a.version).toBe(2); });
  it("editing reception preference creates no reservation or authorisation", async () => { const f = await fixture(); const conditions = { ...unknownConditions(), mode: "preautorisee" as const, periodStart: "2026-10-20", periodEnd: "2026-10-25", explicitConditions: "Petites roches seulement" }; const result = await f.service.act({ ...f.input, action: "modifier", conditions }); expect(result.conditions.mode).toBe("preautorisee"); expect(result.availability).toBe("a_confirmer"); expect(result.deliveries).toEqual([]); });
  it("owner cannot assert environmental or project approval", async () => { const f = await fixture(); await expect(f.service.act({ ...f.input, action: "modifier", conditions: { ...unknownConditions(), environmental: "documente" } })).rejects.toThrow("réservée"); });
  it("code works once and is stored hashed only", async () => { const f = await fixture(); let code = ""; await f.service.requestCode("link-a", f.input.secret, f.input.requestId, async (_link, value) => { code = value; }); expect((await f.repo.getLink("link-a"))?.codeDigest).not.toBe(code); await f.service.verifyCode("link-a", f.input.secret, f.input.requestId, code); await expect(f.service.verifyCode("link-a", f.input.secret, f.input.requestId, code)).rejects.toThrow(); });
  it("five failures block further verification", async () => { const f = await fixture(); let code = ""; await f.service.requestCode("link-a", f.input.secret, f.input.requestId, async (_link, value) => { code = value; }); const wrong = code === "000000" ? "111111" : "000000"; for (let i = 0; i < 5; i++) await expect(f.service.verifyCode("link-a", f.input.secret, f.input.requestId, wrong)).rejects.toThrow(); await expect(f.service.verifyCode("link-a", f.input.secret, f.input.requestId, code)).rejects.toThrow(); expect((await f.repo.getLink("link-a"))?.failures).toBe(5); });
  it("closure keeps original dossier and history", async () => { const f = await fixture(); const result = await f.service.act({ ...f.input, action: "fermer" }); expect(result.id).toBe(f.input.requestId); expect(result.availability).toBe("owner_closed"); expect(result.history).toHaveLength(1); });
  it("renewal revokes old link and delivers only to verified contact", async () => { const f = await fixture(); let delivered: LinkRecord | null = null; await f.service.renew("link-a", async (link, _secret) => { delivered = link; }); expect((await f.repo.getLink("link-a"))?.revoked).toBe(true); expect(delivered).not.toBeNull(); });
});