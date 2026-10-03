// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { outboxAdd, outboxFlush, outboxGet } from "./rdsOutbox";
const online = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
describe("ronde hors ligne", () => {
  beforeEach(() => localStorage.clear());
  it("garde en attente hors ligne puis envoie une seule fois au retour du réseau", async () => {
    const calls: any[] = []; const db = { rpc: async (_f: string, a: any) => { calls.push(a.p); return { error: null }; } };
    outboxAdd({ client_key: "k1" }); outboxAdd({ client_key: "k1" }); outboxAdd({ client_key: "k2" });
    online(false); expect((await outboxFlush(db)).sent).toBe(0); expect(outboxGet()).toHaveLength(2);
    online(true); const [a, b] = await Promise.all([outboxFlush(db), outboxFlush(db)]);
    expect(a.sent + b.sent).toBe(2); expect(calls.map((c) => c.client_key)).toEqual(["k1", "k2"]); expect(calls[0].offline).toBe(true); expect(outboxGet()).toHaveLength(0);
  });
  it("réseau instable : rien n'est perdu; refus serveur : retiré et signalé", async () => {
    online(true); outboxAdd({ client_key: "a" }); outboxAdd({ client_key: "b" });
    expect((await outboxFlush({ rpc: async () => ({ error: { message: "Failed to fetch" } }) })).sent).toBe(0); expect(outboxGet()).toHaveLength(2);
    const r = await outboxFlush({ rpc: async () => ({ error: { message: "Accès refusé" } }) });
    expect(r.refused).toHaveLength(2); expect(outboxGet()).toHaveLength(0); expect(localStorage.getItem("vq.rds.outbox.refused.a")).toBeTruthy();
  });
});
