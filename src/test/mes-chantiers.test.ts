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

  it("B — une demande = un dossier", () => {
    const c = buildChantiers([S("1")]);
    expect(c).toHaveLength(1);
    expect(c[0].projectLinked).toBe(false);
  });

  it("deux projets dans la même ville restent séparés", () => {
    expect(buildChantiers([S("1", { address: null }), S("2", { address: null })])).toHaveLength(2);
  });

  it("même place_id approximatif (centre de ville) : aucune fusion", () => {
    const c = buildChantiers([S("1", { place_id: "VILLE" }), S("2", { place_id: "VILLE" })]);
    expect(c).toHaveLength(2);
  });

  it("même adresse exacte : aucune fusion sans lien explicite", () => {
    expect(buildChantiers([S("1"), S("2")])).toHaveLength(2);
    expect(groupingKey(S("42"))).toEqual({ key: "s:42", groupedBy: "single" });
  });

  it("terrain sans adresse civique : lieu à préciser, rien d'inventé", () => {
    const c = buildChantiers([S("1", { city: null, address: null, formatted_address: null, materials: [] })]);
    expect(c[0].label).toBe("Lieu à préciser");
    expect(c[0].materials).toEqual([]);
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