import { describe, it, expect } from "vitest";
import { buildCatInput, summarizeCatalog, classify, publishGate, estimateCredits, type CatItem } from "@/lib/seo/catalogStatus";
import { publishCityDrafts } from "@/lib/seo/cityPublish";

const pub = { status: "published", noindex: false };
const items = (over: Partial<Record<string, CatItem["page"]>> = {}): CatItem[] => [
  { kind: "hub", slug: null, page: over.hub === undefined ? pub : over.hub },
  { kind: "material", slug: "remblai", page: over.remblai === undefined ? pub : over.remblai },
  { kind: "material", slug: "neige", page: over.neige === undefined ? null : over.neige },
  { kind: "service", slug: "dompe", page: over.dompe === undefined ? pub : over.dompe },
  { kind: "service", slug: "excavation", page: over.excavation === undefined ? pub : over.excavation },
];
const EX = new Set(["material|neige"]);
const prob = (kind: string, slug: string | null, gen_state: string, extra: object = {}) => ({
  city_slug: "v", kind, material_slug: kind === "material" ? slug : null, service_slug: kind === "service" ? slug : null, gen_state, issues: [], ...extra,
});
const sum = (it: CatItem[], probs: object[] = [], run = false) =>
  summarizeCatalog(buildCatInput("v", it, probs as never, EX, { activeRun: run, now: Date.parse("2026-10-12T12:00:00Z") }));

describe("couverture réelle du catalogue", () => {
  it("1. ville complète : toutes publiées hors exclusion sans page", () => {
    const s = sum(items());
    expect(s.complete).toBe(true);
    expect(s.excluded_missing).toBe(1);
    expect(s.coveredPct).toBe(100);
  });
  it("2. pages manquantes confirmées (file) vs inconnues (hors file)", () => {
    const s = sum(items({ remblai: null, excavation: null }), [prob("material", "remblai", "missing")]);
    expect(s.missing_confirmed).toBe(1);
    expect(s.missing_unknown).toBe(1);
    expect(s.complete).toBe(false);
  });
  it("une file vide ne rend jamais la ville couverte", () => {
    const s = sum(items({ excavation: null }), []);
    expect(s.complete).toBe(false);
    expect(s.missing_unknown).toBe(1);
  });
  it("3/4. brouillon prêt, brouillon en erreur, brouillon noindex : un seul état chacun", () => {
    const s = sum(items({ remblai: { status: "draft", noindex: false }, dompe: { status: "draft", noindex: false }, excavation: { status: "draft", noindex: true } }),
      [prob("service", "dompe", "invalid", { issues: ["Contenu insuffisant"] })]);
    expect([s.draft_ready, s.draft_error, s.draft_noindex]).toEqual([1, 1, 1]);
    expect(s.total).toBe(5);
  });
  it("5/6. publiée protégée en erreur reste publiée; noindex volontaire distinct", () => {
    const s = sum(items({ remblai: { status: "published", noindex: true } }), [prob("service", "dompe", "invalid", { issues: ["Contenu insuffisant"] })]);
    expect(s.published_noindex).toBe(1);
    expect(s.published_indexable).toBe(3);
    expect(s.draft_error).toBe(0);
  });
  it("7. combinaison inconnue jamais comptée comme existante, exclue ou confirmée", () => {
    const i = buildCatInput("v", items({ excavation: null }), [], EX, { activeRun: false });
    expect(classify({ kind: "service", slug: "excavation", page: null }, i)).toBe("missing_unknown");
  });
  it("8. génération interrompue (>15 min sans exécution) à reprendre, sinon en cours", () => {
    const p = [prob("material", "remblai", "pending", { task_updated_at: "2026-10-12T11:00:00Z" })];
    expect(sum(items({ remblai: null }), p).stalled).toBe(1);
    expect(sum(items({ remblai: null }), p, true).pending).toBe(1);
  });
  it("exclusion déjà publiée signalée à part, jamais retirée", () => {
    const s = sum(items({ neige: pub }));
    expect(s.excludedExisting).toBe(1);
    expect(s.published_indexable).toBe(5);
  });
  it("coût IA : 0,05 crédit par page", () => {
    expect(estimateCredits(55)).toBe(2.75);
  });
});

const good = {
  id: "1", slug: "remblai-beaumont", status: "draft", noindex: false,
  meta_title: "Remblai à Beaumont — demande de soumission", meta_description: "Faites une demande de remblai à Beaumont : précisez le volume et votre projet pour recevoir une réponse adaptée.",
  h1: "Remblai à Beaumont", title: null, content_html: "<p>" + "Vrac Québec reçoit votre demande pour Beaumont. ".repeat(60) + "</p>",
  word_count: 420, internal_link_count: 3,
};

describe("contrôle avant publication", () => {
  it("brouillon conforme admis", () => {
    expect(publishGate(good, { cityName: "Beaumont", slugCopies: 1 })).toEqual([]);
  });
  it("noindex de génération conservé par défaut", () => {
    expect(publishGate({ ...good, noindex: true }, { cityName: "Beaumont", slugCopies: 1 }).join()).toMatch(/Noindex de génération conservé/);
  });
  it("retrait autorisé explicitement : admis si tous les contrôles passent", () => {
    expect(publishGate({ ...good, noindex: true }, { cityName: "Beaumont", slugCopies: 1, removeGenerationNoindex: true })).toEqual([]);
  });
  it("noindex volontaire jamais retiré, même avec autorisation", () => {
    expect(publishGate({ ...good, noindex: true, noindex_volontaire: true }, { cityName: "Beaumont", slugCopies: 1, removeGenerationNoindex: true }).join()).toMatch(/Noindex volontaire/);
  });
  it("promesse non confirmée bloquée", () => {
    const r = publishGate({ ...good, content_html: good.content_html + "<p>Livraison en 24 heures garantie.</p>" }, { cityName: "Beaumont", slugCopies: 1 });
    expect(r.some((x) => x.startsWith("Promesse non confirmée"))).toBe(true);
  });
  it("texte technique, contenu vide et collision de slug bloqués", () => {
    const r = publishGate({ ...good, content_html: "<p>undefined</p>", word_count: 10 }, { cityName: "Beaumont", slugCopies: 2 });
    expect(r).toEqual(expect.arrayContaining(["Contenu vide ou insuffisant.", "Texte technique ou incomplet détecté.", "Collision de slug (URL en double)."]));
  });
  it("titre sans la ville bloqué", () => {
    expect(publishGate({ ...good, h1: "Remblai" }, { cityName: "Beaumont", slugCopies: 1 }).join()).toMatch(/nom de la ville/);
  });
});

describe("publication d'une ville (dépendances simulées, aucune écriture)", () => {
  const mk = (statusAfter: Record<string, string>, publishOk = true, throwOn?: string) => {
    const calls: string[] = [];
    return { calls, deps: {
      listDrafts: async () => [good, { ...good, id: "2", slug: "dompe-beaumont", noindex: true }, { ...good, id: "3", slug: "sable-beaumont" }],
      slugCopies: async () => new Map(),
      publish: async (id: string) => { calls.push(id); if (id === throwOn) throw new Error("réseau"); return { ok: publishOk }; },
      readStatus: async (id: string) => statusAfter[id] ?? "draft",
    } };
  };
  it("publie seulement les admissibles et confirme par relecture", async () => {
    const m = mk({ "1": "published", "3": "published" });
    const o = await publishCityDrafts("beaumont", "Beaumont", m.deps);
    expect(o.published).toEqual(["remblai-beaumont", "sable-beaumont"]);
    expect(o.blocked.map((b) => b.slug)).toEqual(["dompe-beaumont"]);
    expect(m.calls).not.toContain("2");
  });
  it("10. échec de publication : page non déclarée publiée, aucune perte", async () => {
    const m = mk({ "1": "published" }, true, "3");
    const o = await publishCityDrafts("beaumont", "Beaumont", m.deps);
    expect(o.published).toEqual(["remblai-beaumont"]);
    expect(o.failed[0].slug).toBe("sable-beaumont");
  });
  it("publication non confirmée en base = échec, pas publiée", async () => {
    const o = await publishCityDrafts("beaumont", "Beaumont", mk({}).deps);
    expect(o.published).toEqual([]);
    expect(o.failed).toHaveLength(2);
  });
  it("9. seconde exécution : rien à republier (idempotent)", async () => {
    const deps = { ...mk({}).deps, listDrafts: async () => [] };
    const o = await publishCityDrafts("beaumont", "Beaumont", deps);
    expect(o).toEqual({ published: [], blocked: [], failed: [] });
  });
});
