import { describe, it, expect, vi } from "vitest";
import { buildWorkbench, summarizeWorkbench, type WbDraft } from "@/lib/seo/cityWorkbench";
import { publishCityDrafts } from "@/lib/seo/cityPublish";

const good = (slug: string, m: string | null, extra: Partial<WbDraft> = {}): WbDraft => ({
  id: `id-${slug}`, slug, status: "draft", noindex: true, noindex_volontaire: false, updated_at: "t",
  meta_title: "Sable à Berthierville : livraison en vrac", meta_description: "Sable en vrac à Berthierville : usages, quantités et conseils pour bien planifier votre projet.",
  h1: "Sable à Berthierville", title: "Sable à Berthierville", content_html: "<p>" + "mot ".repeat(400) + "</p>", word_count: 400, internal_link_count: 3, qa_score: 95, qa_fresh: true,
  material_slug: m, service_slug: null, ...extra,
});
const items = [
  { kind: "hub" as const, slug: null, label: "Page ville", status: "covered" },
  { kind: "material" as const, slug: "sable", label: "Sable", status: "not_requested" },
  { kind: "material" as const, slug: "gravier", label: "Gravier", status: "not_requested" },
  { kind: "material" as const, slug: "neige", label: "Neige", status: "not_requested" },
  { kind: "material" as const, slug: "roche", label: "Roche", status: "not_requested" },
  { kind: "material" as const, slug: "pierre", label: "Pierre", status: "covered" },
  { kind: "material" as const, slug: "beton", label: "Béton", status: "covered" },
];
const cat = { items: [], queueKeys: new Set(["material|pierre", "material|beton"]), draftErrorKeys: new Set(["material|beton"]), pendingKeys: new Set<string>(), stalledKeys: new Set<string>(), failedKeys: new Set<string>(), excluded: new Set(["material|neige"]) };
const build = (decisions: Record<string, "confirmee" | "exclue"> = {}) => buildWorkbench({
  cityName: "Berthierville", items, cat: { ...cat, items: [] } as never, excluded: new Set(["material|neige"]), slugCopies: new Map(),
  drafts: [good("sable-berthierville", "sable"), good("beton-berthierville", "beton", { word_count: 100, meta_title: "court" })],
  published: [{ slug: "berthierville", noindex: false, material_slug: null, service_slug: null }],
  problems: [{ kind: "material", material_slug: "beton", service_slug: null, gen_state: "invalid", issues: ["Contenu insuffisant"], task_attempts: 1 }],
  decisionOf: (_k, s) => (s ? decisions[s] : undefined),
});
const row = (rows: ReturnType<typeof build>, slug: string | null) => rows.find((r) => r.slug === slug)!;

describe("poste de travail d'une ville", () => {
  it("page en ligne : protégée, aucune action", () => expect(row(build(), null)).toMatchObject({ action: "none", blocked: expect.stringMatching(/protégée/) }));
  it("manquante inconnue : seulement « Décider », jamais générer", () => expect(row(build(), "gravier").action).toBe("decide"));
  it("manquante confirmée par décision : générable", () => expect(row(build({ gravier: "confirmee" }), "gravier").action).toBe("generate"));
  it("manquante avec preuve : générable", () => expect(row(build(), "pierre").action).toBe("generate"));
  it("exclue : aucune action, motif affiché", () => expect(row(build(), "neige")).toMatchObject({ action: "none", availability: "exclue" }));
  it("décision « exclue » : bloque la génération", () => expect(row(build({ roche: "exclue" }), "roche").action).toBe("none"));
  it("brouillon prêt mais disponibilité inconnue : bloqué, propose de décider", () => {
    const r = row(build(), "sable");
    expect(r.action).toBe("decide"); expect(r.problems.join(" ")).toMatch(/Disponibilité inconnue/);
  });
  it("brouillon prêt et confirmé : publiable", () => expect(row(build({ sable: "confirmee" }), "sable").action).toBe("publish"));
  it("brouillon en erreur : régénérer, et correction de qualité sans IA proposée", () => {
    const r = row(build(), "beton");
    expect(r.action).toBe("repair"); expect(r.alt).toBe("autofix"); expect(r.attempts).toBe(1);
  });
  it("limite de 3 tentatives : plus de régénération", () => {
    const rows = buildWorkbench({ cityName: "Berthierville", items, cat: cat as never, excluded: new Set(), slugCopies: new Map(),
      drafts: [good("beton-berthierville", "beton", { word_count: 100 })], published: [],
      problems: [{ kind: "material", material_slug: "beton", service_slug: null, gen_state: "invalid", issues: [], task_attempts: 3 }], decisionOf: () => undefined });
    const r = row(rows, "beton"); expect(r.action).not.toBe("repair"); expect(r.problems.join(" ")).toMatch(/Limite de 3/);
  });
  it("noindex volontaire : jamais publiable", () => {
    const rows = buildWorkbench({ cityName: "Berthierville", items, cat: cat as never, excluded: new Set(), slugCopies: new Map(),
      drafts: [good("sable-berthierville", "sable", { noindex_volontaire: true })], published: [], problems: [], decisionOf: () => "confirmee" });
    expect(row(rows, "sable").action).not.toBe("publish");
  });
  it("résumé : compte inconnues, exclues, erreurs", () => {
    const s = summarizeWorkbench(build());
    expect(s).toMatchObject({ total: 7, published: 1, drafts: 2, excluded: 1 });
    expect(s.unknown).toBe(3); // gravier, roche, sable
  });
});

describe("publication de plusieurs pages en une confirmation", () => {
  const mk = () => {
    const published = new Set<string>();
    const drafts = [good("a-berthierville", "sable"), good("b-berthierville", "pierre"), good("c-berthierville", "gravier")];
    return { published, deps: {
      listDrafts: async () => drafts as never,
      slugCopies: async () => new Map(),
      publish: vi.fn(async (id: string) => { published.add(id); return { ok: true }; }),
      readStatus: async (id: string) => (published.has(id) ? "published" : "draft"),
    } };
  };
  it("toutes les pages cochées et confirmées sont publiées, statut relu", async () => {
    const m = mk();
    const o = await publishCityDrafts("b", "Berthierville", m.deps, { removeGenerationNoindex: true, onlySlugs: ["a-berthierville", "b-berthierville"], isAvailable: () => true });
    expect(o.published).toEqual(["a-berthierville", "b-berthierville"]);
    expect(m.deps.publish).toHaveBeenCalledTimes(2);
  });
  it("disponibilité non confirmée : bloquée même cochée", async () => {
    const m = mk();
    const o = await publishCityDrafts("b", "Berthierville", m.deps, { removeGenerationNoindex: true, onlySlugs: ["a-berthierville", "c-berthierville"], isAvailable: (d) => d.material_slug !== "gravier" });
    expect(o.published).toEqual(["a-berthierville"]);
    expect(o.blocked[0]).toMatchObject({ slug: "c-berthierville" });
  });
  it("sans contrôle de disponibilité : refus", async () => {
    await expect(publishCityDrafts("b", "Berthierville", mk().deps, { removeGenerationNoindex: true, onlySlugs: ["a-berthierville"] })).rejects.toThrow(/disponibilité/);
  });
  it("publication non confirmée par la base : échec, reste brouillon", async () => {
    const m = mk(); m.deps.readStatus = async () => "draft";
    const o = await publishCityDrafts("b", "Berthierville", m.deps, { removeGenerationNoindex: true, onlySlugs: ["a-berthierville"], isAvailable: () => true });
    expect(o.failed).toHaveLength(1); expect(o.published).toHaveLength(0);
  });
});

describe("outils de qualité du poste de travail", () => {
  const one = (extra: Partial<WbDraft>) => buildWorkbench({
    cityName: "Berthierville", items, cat: { ...cat, items: [] } as never, excluded: new Set(), slugCopies: new Map(),
    drafts: [good("sable-berthierville", "sable", extra)], published: [], problems: [],
    decisionOf: (_k, s) => (s === "sable" ? "confirmee" : undefined),
  }).find((r) => r.slug === "sable")!;
  it("note absente : « Recalculer la qualité », jamais publier", () => expect(one({ qa_score: null, qa_fresh: false }).action).toBe("recheck"));
  it("note périmée : « Recalculer la qualité »", () => expect(one({ qa_score: 95, qa_fresh: false }).action).toBe("recheck"));
  it("note 80 à jour : « Corriger sans IA », jamais publier", () => expect(one({ qa_score: 80 }).action).toBe("autofix"));
  it("note 90 à jour : publiable", () => expect(one({ qa_score: 90 }).action).toBe("publish"));
  it("note 92 à jour : publiable", () => expect(one({ qa_score: 92 }).action).toBe("publish"));
});
