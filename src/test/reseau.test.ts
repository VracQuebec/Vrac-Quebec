import { describe, it, expect } from "vitest";
import { buildReseau, loadReseau, loadLinkedTransportIds, type ReseauClient } from "@/lib/parcours/reseau";
import { mapMySubmission, type MySubmission } from "@/lib/parcours/mes-demandes";

const S = (id: string, extra: Record<string, unknown> = {}): MySubmission =>
  mapMySubmission({ id, submission_number: 1, materials: ["Terre"], ...extra })!;

const client = (rows: unknown[], opts: { rpcError?: string; trRows?: unknown[]; trError?: string } = {}): ReseauClient =>
  ({
    rpc: async () => ({ data: rows, error: opts.rpcError ? { message: opts.rpcError } : null }),
    from: () => ({
      select: () => ({
        not: async () => ({ data: opts.trRows ?? [], error: opts.trError ? { message: opts.trError } : null }),
      }),
    }),
  }) as unknown as ReseauClient;

describe("Carte du réseau — V1", () => {
  it("A — aucun élément", () => {
    const r = buildReseau([], new Set());
    expect(r.chantiers).toHaveLength(0);
    expect(r.totals).toMatchObject({ chantiers: 0, demandes: 0, sites: 0, transports: 0 });
  });

  it("B — une demande", () => {
    const r = buildReseau([S("a", { city: "Québec" })], new Set());
    expect(r.chantiers).toHaveLength(1);
    expect(r.totals.demandes).toBe(1);
  });

  it("C — plusieurs demandes sur des chantiers distincts", () => {
    const r = buildReseau([S("a", { place_id: "p1" }), S("b", { place_id: "p2" })], new Set());
    expect(r.chantiers).toHaveLength(2);
    expect(r.totals.demandes).toBe(2);
  });

  it("D — plusieurs demandes sur un même chantier", () => {
    const r = buildReseau([S("a", { place_id: "p1" }), S("b", { place_id: "p1" })], new Set());
    expect(r.chantiers).toHaveLength(1);
    expect(r.chantiers[0].demandes).toHaveLength(2);
  });

  it("E — site réellement sélectionné", () => {
    const r = buildReseau(
      [S("a", { selected_site_id: "site-1", selected_site_label: "Site A" })],
      new Set(),
    );
    expect(r.chantiers[0].demandes[0].site?.siteId).toBe("site-1");
    expect(r.totals.sites).toBe(1);
  });

  it("F — absence de site sélectionné", () => {
    const r = buildReseau([S("a")], new Set());
    expect(r.chantiers[0].demandes[0].site).toBeNull();
    expect(r.totals.sites).toBe(0);
  });

  it("G — transport réellement lié", () => {
    const r = buildReseau([S("a")], new Set(["a"]));
    expect(r.chantiers[0].demandes[0].hasTransport).toBe(true);
    expect(r.totals.transports).toBe(1);
  });

  it("H — absence de transport / information indisponible", () => {
    const known = buildReseau([S("a")], new Set());
    expect(known.chantiers[0].demandes[0].hasTransport).toBe(false);
    expect(known.chantiers[0].demandes[0].transportKnown).toBe(true);
    const unknown = buildReseau([S("a")], null);
    expect(unknown.chantiers[0].demandes[0].transportKnown).toBe(false);
    expect(unknown.totals.transports).toBeNull();
  });

  it("I — localisation disponible", () => {
    const r = buildReseau([S("a", { latitude: 46.8, longitude: -71.2 })], new Set());
    expect(r.chantiers[0].demandes[0].location).toEqual({ lat: 46.8, lng: -71.2 });
    expect(r.totals.localises).toBe(1);
  });

  it("J — localisation absente : l'élément reste affiché", () => {
    const r = buildReseau([S("a")], new Set());
    expect(r.chantiers[0].demandes[0].location).toBeNull();
    expect(r.totals.demandes).toBe(1);
    expect(r.totals.localises).toBe(0);
  });

  it("K — aucune donnée d'un autre entrepreneur (lecture serveur uniquement)", async () => {
    let args: unknown = "not-called";
    const spy = {
      rpc: async (_fn: string, params: unknown) => { args = params; return { data: [], error: null }; },
      from: () => ({ select: () => ({ not: async () => ({ data: [], error: null }) }) }),
    } as unknown as ReseauClient;
    const res = await loadReseau(spy);
    expect(args).toEqual({});
    expect(res.state).toBe("ok");
  });

  it("L — navigation vers les parcours existants", () => {
    const r = buildReseau([S("a")], new Set());
    expect(r.chantiers[0].href).toBe("/entrepreneur/chantiers");
    expect(r.chantiers[0].demandes[0].href).toBe("/entrepreneur/demandes#demande-a");
  });

  it("M — erreur de chargement", async () => {
    const res = await loadReseau(client([], { rpcError: "boom" }));
    expect(res.state).toBe("error");
  });

  it("M2 — erreur transport : information marquée indisponible", async () => {
    const ids = await loadLinkedTransportIds(client([], { trError: "denied" }));
    expect(ids).toBeNull();
  });

  it("N — refresh : résultat stable et lecture seule", async () => {
    const c = client([{ id: "a", submission_number: 2, materials: ["Sable"] }], {
      trRows: [{ origin_submission_id: "a" }],
    });
    const a = await loadReseau(c);
    const b = await loadReseau(c);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.state === "ok" && a.reseau.totals.transports).toBe(1);
  });

  it("O — données partielles : aucun champ inventé", () => {
    const r = buildReseau([S("a", { materials: [], city: null })], new Set());
    const d = r.chantiers[0].demandes[0];
    expect(d.material).toBeNull();
    expect(d.location).toBeNull();
    expect(r.chantiers[0].label).toBe("Chantier — adresse à confirmer");
  });

  it("P — unauthorized propagé", async () => {
    const res = await loadReseau(client([], { rpcError: "not_authorized" }));
    expect(res.state).toBe("unauthorized");
  });
});
