// « Mes chantiers » — vue calculée à partir des demandes existantes.
import { describe, it, expect } from "vitest";
import { buildChantiers, groupingKey, loadMyChantiers } from "@/lib/parcours/chantiers";
import { mapMySubmission } from "@/lib/parcours/mes-demandes";
import type { RpcClient } from "@/lib/parcours/validation";

const S = (id: string, extra: Record<string, unknown> = {}) =>
  mapMySubmission({
    id,
    created_at: "2026-08-10T12:00:00.000Z",
    materials: ["Terre"],
    city: "Sainte-Foy",
    address: "123 rue Principale",
    ...extra,
  })!;

const client = (rows: unknown, error: { message: string } | null = null): RpcClient => ({
  rpc: async () => ({ data: rows, error }),
});

describe("Mes chantiers", () => {
  it("A — aucun chantier", () => {
    expect(buildChantiers([])).toEqual([]);
  });

  it("B — un seul chantier", () => {
    const c = buildChantiers([S("1")]);
    expect(c).toHaveLength(1);
    expect(c[0].city).toBe("Sainte-Foy");
  });

  it("C — plusieurs chantiers séparés", () => {
    const c = buildChantiers([S("1"), S("2", { address: "999 boulevard Laurier", place_id: null })]);
    expect(c).toHaveLength(2);
  });

  it("D — regroupement fiable par place_id", () => {
    const c = buildChantiers([S("1", { place_id: "PL1" }), S("2", { place_id: "PL1", address: "123 rue Principale bureau 2" })]);
    expect(c).toHaveLength(1);
    expect(c[0].groupedBy).toBe("place_id");
    expect(c[0].submissions).toHaveLength(2);
  });

  it("D bis — regroupement par adresse normalisée + ville", () => {
    const c = buildChantiers([S("1"), S("2", { address: "123 Rue  Principale" })]);
    expect(c).toHaveLength(1);
    expect(c[0].groupedBy).toBe("address");
  });

  it("E — même ville mais adresses différentes : aucune fusion", () => {
    const c = buildChantiers([S("1"), S("2", { address: "77 avenue des Érables" })]);
    expect(c).toHaveLength(2);
  });

  it("E bis — place_id différents : aucune fusion malgré la même adresse texte", () => {
    const c = buildChantiers([S("1", { place_id: "A" }), S("2", { place_id: "B" })]);
    expect(c).toHaveLength(2);
  });

  it("K — aucune donnée inventée sans adresse", () => {
    const c = buildChantiers([S("1", { city: null, address: null, formatted_address: null, materials: [] })]);
    expect(c[0].address).toBeNull();
    expect(c[0].city).toBeNull();
    expect(c[0].materials).toEqual([]);
    expect(c[0].groupedBy).toBe("single");
  });

  it("clé individuelle si aucune clé fiable (aucune clé artificielle)", () => {
    expect(groupingKey(S("42", { address: null, formatted_address: null }))).toEqual({
      key: "s:42",
      groupedBy: "single",
    });
  });

  it("dernière activité = date la plus récente", () => {
    const c = buildChantiers([
      S("1", { place_id: "P", created_at: "2026-08-01T00:00:00.000Z" }),
      S("2", { place_id: "P", created_at: "2026-08-12T00:00:00.000Z" }),
    ]);
    expect(c[0].lastActivity).toBe("2026-08-12T00:00:00.000Z");
  });

  it("H/I — seules les demandes retournées par la base sont visibles", async () => {
    const res = await loadMyChantiers(client([{ id: "mine", city: "Lévis" }]));
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.chantiers).toHaveLength(1);
      expect(res.chantiers[0].submissions[0].id).toBe("mine");
    }
  });

  it("M — permissions insuffisantes", async () => {
    const res = await loadMyChantiers(client(null, { message: "not_authorized" }));
    expect(res.state).toBe("unauthorized");
  });

  it("L — erreur de lecture propre", async () => {
    const res = await loadMyChantiers(client(null, { message: "boom" }));
    expect(res.state).toBe("error");
  });

  it("J — refresh : résultat identique et stable", async () => {
    const c = client([{ id: "1", city: "Lévis", address: "12 rue A" }]);
    const a = await loadMyChantiers(c);
    const b = await loadMyChantiers(c);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});