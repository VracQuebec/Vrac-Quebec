import { describe, it, expect } from "vitest";
import { availabilityOf, validReason } from "@/lib/seo/slotDecisions";
import { publishCityDrafts, publishPrecheck } from "@/lib/seo/cityPublish";

const draft = { id: "1", slug: "remblai-x", status: "draft", noindex: true, noindex_volontaire: false, updated_at: "t",
  meta_title: "Remblai à Saint-Georges : guide complet du projet", meta_description: "x".repeat(80), h1: "Remblai à Saint-Georges",
  title: null, content_html: "<p>" + "mot ".repeat(400) + "</p>", word_count: 400, internal_link_count: 3 };

function deps(rows = [draft]) {
  const calls: Array<{ id: string; remove: boolean }> = [];
  return { calls, d: {
    listDrafts: async () => rows,
    slugCopies: async () => new Map<string, number>(),
    publish: async (id: string, _e: string | undefined, remove: boolean) => { calls.push({ id, remove }); return { ok: true }; },
    readStatus: async () => "published",
  } };
}

describe("disponibilité par décision", () => {
  it("inconnue reste inconnue sans décision", () => expect(availabilityOf({ kind: "material", status: "not_requested" }, undefined)).toBe("inconnue"));
  it("confirmée seulement par décision explicite", () => expect(availabilityOf({ kind: "material", status: "not_requested" }, "confirmee")).toBe("confirmee"));
  it("exclusion prioritaire", () => expect(availabilityOf({ kind: "material", status: "covered" }, "exclue")).toBe("exclue"));
  it("motif obligatoire", () => { expect(validReason("  ab ")).toBe(false); expect(validReason("Demande réelle")).toBe(true); });
});

describe("publication confirmée page par page", () => {
  it("retrait du noindex refusé sans liste explicite", async () => {
    const { d } = deps();
    await expect(publishCityDrafts("saint-georges", "Saint-Georges", d, { removeGenerationNoindex: true })).rejects.toThrow(/Liste explicite/);
  });
  it("seules les pages cochées sont publiées, avec retrait du noindex de génération", async () => {
    const { d, calls } = deps([draft, { ...draft, id: "2", slug: "remblai-y" }]);
    const o = await publishCityDrafts("saint-georges", "Saint-Georges", d, { removeGenerationNoindex: true, onlySlugs: ["remblai-x"] });
    expect(o.published).toEqual(["remblai-x"]);
    expect(calls).toEqual([{ id: "1", remove: true }]);
  });
  it("noindex volontaire jamais retiré, même coché", async () => {
    const { d, calls } = deps([{ ...draft, noindex_volontaire: true }]);
    const o = await publishCityDrafts("saint-georges", "Saint-Georges", d, { removeGenerationNoindex: true, onlySlugs: ["remblai-x"] });
    expect(calls).toEqual([]);
    expect(o.blocked[0].reasons.join(" ")).toMatch(/volontaire/);
  });
  it("pré-contrôle : disponibilité inconnue bloque la publication", () => {
    const p = publishPrecheck([draft], "Saint-Georges", new Map(), () => "inconnue");
    expect(p.eligible).toEqual([]);
    expect(p.blocked[0].reasons.join(" ")).toMatch(/Disponibilité inconnue/);
  });
});
