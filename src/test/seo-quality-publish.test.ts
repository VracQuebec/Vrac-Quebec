import { describe, it, expect } from "vitest";
import { qualityGate, QA_MIN } from "@/lib/seo/catalogStatus";
import { publishCityDrafts, publishPrecheck } from "@/lib/seo/cityPublish";
import { staleReadRefusal } from "../../supabase/functions/_shared/seo-write-guards";

const good = {
  id: "p1", slug: "remblai-x", status: "draft", noindex: true, noindex_volontaire: false, updated_at: "t1",
  material_slug: "remblai", service_slug: null,
  meta_title: "Remblai à Ville X — livraison et soumission rapide", meta_description: "x".repeat(120),
  h1: "Remblai à Ville X", title: "Remblai à Ville X", content_html: "<p>" + "mot ".repeat(500) + "</p>",
  word_count: 500, internal_link_count: 3,
};
const q = (score: number | null, fresh = true, blockers: string[] | null = null) => ({ ...good, qa_score: score, qa_fresh: fresh, qa_blockers: blockers });

describe("qualité obligatoire à la publication", () => {
  it("le seuil est 90", () => expect(QA_MIN).toBe(90));
  it("89 refusée", () => expect(qualityGate(q(89))[0]).toMatch(/89\/100 inférieure à 90/));
  it("90 acceptée", () => expect(qualityGate(q(90))).toEqual([]));
  it("95 acceptée", () => expect(qualityGate(q(95))).toEqual([]));
  it("note absente refusée (recalcul requis)", () => expect(qualityGate(q(null))[0]).toMatch(/absente/));
  it("note périmée refusée même si >= 90", () => expect(qualityGate(q(95, false))[0]).toMatch(/périmée/));
  it("blocage qualité refusé même à 95", () => expect(qualityGate(q(95, true, ["H1"]))[0]).toMatch(/bloquant/));

  it("pré-contrôle : 89 bloquée, 90 admissible", () => {
    const r = publishPrecheck([{ ...q(89), slug: "a" }, { ...q(90), slug: "b" }], "Ville X", new Map(), () => "confirmee");
    expect(r.eligible).toEqual(["b"]);
    expect(r.blocked[0].slug).toBe("a");
  });

  it("publication : disponibilité inconnue ou exclue refusée même à 95", () => {
    expect(publishPrecheck([q(95)], "Ville X", new Map(), () => "inconnue").eligible).toEqual([]);
    expect(publishPrecheck([q(95)], "Ville X", new Map(), () => "exclue").eligible).toEqual([]);
  });

  it("publication en lot : seule la page >= 90 à jour atteint le serveur", async () => {
    const calls: string[] = [];
    const drafts = [{ ...q(73), id: "a", slug: "a" }, { ...q(95, false), id: "b", slug: "b" }, { ...q(92), id: "c", slug: "c" }];
    const o = await publishCityDrafts("x", "Ville X", {
      listDrafts: async () => drafts as never, slugCopies: async () => new Map(),
      publish: async (id) => { calls.push(id); return { ok: true }; }, readStatus: async () => "published",
    }, { removeGenerationNoindex: true, onlySlugs: ["a", "b", "c"], isAvailable: () => true });
    expect(calls).toEqual(["c"]);
    expect(o.published).toEqual(["c"]);
    expect(o.blocked.map((b) => b.slug)).toEqual(["a", "b"]);
  });

  it("refus serveur (ex. note recalculée sous 90 entre-temps) : page non déclarée publiée", async () => {
    const o = await publishCityDrafts("x", "Ville X", {
      listDrafts: async () => [q(95)] as never, slugCopies: async () => new Map(),
      publish: async () => ({ ok: false, issues: ["Note de qualité 80/100 inférieure à 90 — publication refusée"] }), readStatus: async () => "draft",
    }, { removeGenerationNoindex: true, onlySlugs: ["remblai-x"], isAvailable: () => true });
    expect(o.published).toEqual([]);
    expect(o.blocked[0].reasons[0]).toMatch(/inférieure à 90/);
  });
});

describe("correction sans IA : page modifiée depuis la lecture", () => {
  it("même date : autorisé", () => expect(staleReadRefusal("2026-10-12T16:56:57.914+00:00", "2026-10-12T16:56:57.914+00:00")).toBeNull());
  it("date différente : refus, rien modifié", () => expect(staleReadRefusal("t1", "t2")).toMatch(/rien n'a été modifié/));
  it("page sans date : refus", () => expect(staleReadRefusal("t1", null)).not.toBeNull());
});
