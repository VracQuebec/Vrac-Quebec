// Tests de la protection des endpoints publics : robots, pourriel,
// limitation du débit et déduplication.
import { describe, expect, it } from "vitest";
import {
  GuardError, guardPublicRequest, looksLikeSpam,
} from "../../supabase/functions/_shared/public-guard.ts";

function fakeDb(opts: { count?: number; duplicate?: boolean } = {}) {
  return {
    from() {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: opts.duplicate ? { payload: { quote_number: "SOU-1" } } : null }),
        insert: async () => ({ error: null }),
        update: () => chain,
        then: undefined,
      };
      chain.select = (_c?: string, o?: { head?: boolean }) =>
        o?.head ? Promise.resolve({ count: opts.count ?? 0, error: null }) as any : chain;
      return chain;
    },
  };
}

const base = {
  scope: "test", identity: "a@b.ca", fingerprint: "fp", ip: "1.2.3.4",
};

describe("détection de pourriel", () => {
  it("repère plusieurs liens", () => {
    expect(looksLikeSpam("visitez http://a.com et http://b.com")).toBe(true);
  });
  it("repère le HTML injecté", () => {
    expect(looksLikeSpam('<a href="x">clic</a>')).toBe(true);
  });
  it("laisse passer un message normal", () => {
    expect(looksLikeSpam("Bonjour, j'ai besoin de 20 tonnes de pierre.")).toBe(false);
  });
});

describe("protection des demandes publiques", () => {
  it("bloque un robot qui remplit le champ piège", async () => {
    await expect(guardPublicRequest(fakeDb(), { ...base, honeypot: "spam" }))
      .rejects.toBeInstanceOf(GuardError);
  });

  it("bloque un envoi instantané", async () => {
    await expect(guardPublicRequest(fakeDb(), { ...base, formStartedAt: Date.now() }))
      .rejects.toThrow(/refusée/);
  });

  it("bloque au-delà de la limite de requêtes", async () => {
    await expect(guardPublicRequest(fakeDb({ count: 5 }), base))
      .rejects.toThrow(/Trop de demandes/);
  });

  it("signale un doublon récent", async () => {
    const v = await guardPublicRequest(fakeDb({ duplicate: true }), base);
    expect(v.duplicate).toBe(true);
    expect(v.previous).toEqual({ quote_number: "SOU-1" });
  });

  it("laisse passer une demande légitime", async () => {
    const v = await guardPublicRequest(fakeDb(), { ...base, formStartedAt: Date.now() - 20000 });
    expect(v.duplicate).toBe(false);
  });
});
