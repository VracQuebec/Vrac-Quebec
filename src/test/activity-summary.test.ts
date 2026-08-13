import { describe, it, expect } from "vitest";
import { loadActivitySummary, type ActivityClient } from "@/lib/parcours/activity";
import { buildChantiers } from "@/lib/parcours/chantiers";
import { buildRecommendedSites } from "@/lib/parcours/sites-recommandes";
import { mapMySubmission, type MySubmission } from "@/lib/parcours/mes-demandes";

let rpcCalls = 0;
const client = (
  rows: unknown,
  transports: unknown = [],
  opts: { rpcError?: string; transportError?: string } = {},
): ActivityClient =>
  ({
    rpc: async () => {
      rpcCalls++;
      return { data: rows, error: opts.rpcError ? { message: opts.rpcError } : null };
    },
    from: () => ({
      select: () => ({
        not: async () => ({
          data: transports,
          error: opts.transportError ? { message: opts.transportError } : null,
        }),
      }),
    }),
  }) as unknown as ActivityClient;

const sub = (o: Record<string, unknown>) => ({ id: "s1", ...o });
const mapped = (rows: Record<string, unknown>[]): MySubmission[] =>
  rows.map(mapMySubmission).filter((s): s is MySubmission => s !== null);

describe("Résumé d'activité — compteurs réels", () => {
  it("A — aucun compte d'activité : tous les compteurs à zéro", async () => {
    const res = await loadActivitySummary(client([]));
    expect(res).toEqual({
      state: "ok",
      summary: { demandes: 0, chantiers: 0, sitesRecommandes: 0, transports: 0 },
    });
  });

  it("B — nombre exact de demandes", async () => {
    const res = await loadActivitySummary(
      client([sub({ id: "a" }), sub({ id: "b" }), sub({ id: "c" })]),
    );
    expect(res.state === "ok" && res.summary.demandes).toBe(3);
  });

  it("C — plusieurs demandes sur un même chantier : cohérent avec Mes chantiers", async () => {
    const rows = [
      sub({ id: "a", place_id: "P1", city: "Québec" }),
      sub({ id: "b", place_id: "P1", city: "Québec" }),
      sub({ id: "c", place_id: "P2", city: "Lévis" }),
    ];
    const res = await loadActivitySummary(client(rows));
    expect(res.state === "ok" && res.summary.chantiers).toBe(2);
    expect(res.state === "ok" && res.summary.chantiers).toBe(buildChantiers(mapped(rows)).length);
  });

  it("D — compteur de sites cohérent avec Sites recommandés", async () => {
    const rows = [
      sub({ id: "a", selected_site_id: "site-1" }),
      sub({ id: "b", selected_site_id: "site-2" }),
      sub({ id: "c" }),
    ];
    const res = await loadActivitySummary(client(rows));
    expect(res.state === "ok" && res.summary.sitesRecommandes).toBe(2);
    expect(res.state === "ok" && res.summary.sitesRecommandes).toBe(
      buildRecommendedSites(mapped(rows)).length,
    );
  });

  it("E — aucune sélection : aucun site inventé", async () => {
    const res = await loadActivitySummary(client([sub({ city: "Lévis" })]));
    expect(res.state === "ok" && res.summary.sitesRecommandes).toBe(0);
  });

  it("F — aucun transport rattaché : aucun transport fictif", async () => {
    const res = await loadActivitySummary(client([sub({})], []));
    expect(res.state === "ok" && res.summary.transports).toBe(0);
  });

  it("G — transports rattachés : compteur exact, sans doublon", async () => {
    const res = await loadActivitySummary(
      client([sub({})], [
        { origin_submission_id: "s1" },
        { origin_submission_id: "s1" },
        { origin_submission_id: "s2" },
      ]),
    );
    expect(res.state === "ok" && res.summary.transports).toBe(2);
  });

  it("H — accès refusé : aucun compteur, aucune donnée d'un autre compte", async () => {
    const res = await loadActivitySummary(client(null, [], { rpcError: "not_authorized" }));
    expect(res).toEqual({ state: "unauthorized" });
  });

  it("H bis — la source est la RPC serveur : aucun identifiant client transmis", async () => {
    const seen: unknown[] = [];
    const c = {
      rpc: async (_n: string, args: unknown) => {
        seen.push(args);
        return { data: [], error: null };
      },
      from: () => ({ select: () => ({ not: async () => ({ data: [], error: null }) }) }),
    } as unknown as ActivityClient;
    await loadActivitySummary(c);
    expect(seen).toEqual([{}]);
  });

  it("I — erreur de chargement : jamais transformée en zéro", async () => {
    const res = await loadActivitySummary(client(null, [], { rpcError: "boom" }));
    expect(res.state).toBe("error");
    expect(res).not.toHaveProperty("summary");
  });

  it("I bis — transports indisponibles : null, pas 0", async () => {
    const res = await loadActivitySummary(client([sub({})], null, { transportError: "denied" }));
    expect(res.state === "ok" && res.summary.transports).toBeNull();
    expect(res.state === "ok" && res.summary.demandes).toBe(1);
  });

  it("J — deux lectures successives : résultat identique, une seule RPC par lecture", async () => {
    rpcCalls = 0;
    const rows = [sub({ id: "a", selected_site_id: "x", place_id: "P" })];
    const a = await loadActivitySummary(client(rows));
    const b = await loadActivitySummary(client(rows));
    expect(a).toEqual(b);
    expect(rpcCalls).toBe(2);
  });

  it("K — cohérence globale : demandes ≥ chantiers et ≥ sites recommandés", async () => {
    const rows = [
      sub({ id: "a", place_id: "P1", selected_site_id: "s" }),
      sub({ id: "b", place_id: "P1" }),
    ];
    const res = await loadActivitySummary(client(rows));
    if (res.state !== "ok") throw new Error("état inattendu");
    expect(res.summary.demandes).toBeGreaterThanOrEqual(res.summary.chantiers);
    expect(res.summary.demandes).toBeGreaterThanOrEqual(res.summary.sitesRecommandes);
  });
});
