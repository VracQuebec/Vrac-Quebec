import { describe, it, expect } from "vitest";
import { buildActionGroups, topActions, actionKeyOf, normalizeAction } from "@/lib/seo/actionGroups";
import type { Opportunity } from "@/lib/seo/useCopilot";

let seq = 0;
function opp(p: Partial<Opportunity>): Opportunity {
  seq += 1;
  return {
    id: `o${seq}`,
    type: "ctr_top10",
    category: "ctr",
    title: "Opportunité",
    rationale: "",
    reason: "raison",
    recommended_action: "Optimiser le title",
    expected_impact: null,
    score_factors: [],
    data_quality: "suffisante",
    source: "Search Console",
    url: null,
    priority: "medium",
    score: 50,
    data: {},
    suggested_action: "optimize",
    impact_score: 50,
    effort_score: 30,
    potential_searches: null,
    potential_clicks: null,
    potential_leads: null,
    entity_slug: null,
    target_city_slug: null,
    target_material_slug: null,
    target_service_slug: null,
    page_id: null,
    status: "open",
    detected_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    ...p,
  } as Opportunity;
}

describe("Regroupement en actions distinctes", () => {
  it("deux signaux différents mais même territoire × service forment une seule action", () => {
    const page = opp({
      title: "Transport en vrac Sainte-Anne-de-Beaupré", page_id: "p1",
      target_service_slug: "transport-vrac", target_city_slug: "sainte-anne-de-beaupre",
      score: 70, data: { impressions: 400, clicks: 5, position: 8.4 },
    });
    const local = opp({
      type: "local_potential", category: "territoire_service",
      title: "Renforcer transport-vrac à Sainte-Anne-de-Beaupré",
      target_service_slug: "transport-vrac", target_city_slug: "sainte-anne-de-beaupre",
      score: 65, data: { impressions: 120, clicks: 1 },
    });
    const groups = buildActionGroups([page, local]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("l'action la plus concrète (page) devient l'action principale", () => {
    const page = opp({ title: "Page précise", page_id: "p1", target_service_slug: "excavation", target_city_slug: "sainte-foy", score: 40 });
    const local = opp({ type: "local_potential", category: "territoire_service", title: "Renforcer excavation", target_service_slug: "excavation", target_city_slug: "sainte-foy", score: 80 });
    const [g] = buildActionGroups([page, local]);
    expect(g.primary.id).toBe(page.id);
    expect(g.kind).toBe("page");
    expect(g.score).toBe(80); // le score du groupe reste le meilleur score réel
  });

  it("deux territoires différents ne sont jamais fusionnés", () => {
    const a = opp({ target_service_slug: "livraison", target_city_slug: "quebec", page_id: "a" });
    const b = opp({ target_service_slug: "livraison", target_city_slug: "levis", page_id: "b" });
    expect(buildActionGroups([a, b])).toHaveLength(2);
  });

  it("deux services différents ne sont jamais fusionnés", () => {
    const a = opp({ target_service_slug: "livraison", target_city_slug: "quebec", page_id: "a" });
    const b = opp({ target_service_slug: "excavation", target_city_slug: "quebec", page_id: "b" });
    expect(buildActionGroups([a, b])).toHaveLength(2);
  });

  it("agrège les données réelles sans rien inventer", () => {
    const a = opp({ page_id: "a", target_service_slug: "remblai", target_city_slug: "beaupre", data: { impressions: 300, clicks: 6, conversions: 2, position: 8 } });
    const b = opp({ page_id: "b", target_service_slug: "remblai", target_city_slug: "beaupre", data: { impressions: 100, clicks: 2, position: 12 } });
    const [g] = buildActionGroups([a, b]);
    expect(g.impressions).toBe(400);
    expect(g.clicks).toBe(8);
    expect(g.conversions).toBe(2);
    expect(g.ctr).toBeCloseTo(0.02, 5);
    expect(g.position).toBeCloseTo(9, 5);
    expect(g.pages).toBe(2);
  });

  it("aucune donnée absente n'est remplacée par zéro", () => {
    const a = opp({ page_id: "a", target_service_slug: "dompe", target_city_slug: "adstock", data: {} });
    const [g] = buildActionGroups([a]);
    expect(g.impressions).toBeNull();
    expect(g.clicks).toBeNull();
    expect(g.ctr).toBeNull();
    expect(g.conversions).toBeNull();
  });

  it("distingue ACTION UNIQUE et ACTIONS MULTIPLES", () => {
    const a = opp({ page_id: "a", target_service_slug: "remblai", target_city_slug: "beaupre", recommended_action: "Optimiser le title" });
    const b = opp({ page_id: "b", target_service_slug: "remblai", target_city_slug: "beaupre", recommended_action: "Optimiser  le TITLE." });
    const [same] = buildActionGroups([a, b]);
    expect(same.singleAction).toBe(true);

    const c = opp({ page_id: "c", target_service_slug: "sable", target_city_slug: "levis", recommended_action: "Optimiser le title" });
    const d = opp({ page_id: "d", target_service_slug: "sable", target_city_slug: "levis", recommended_action: "Ajouter des liens internes" });
    const [multi] = buildActionGroups([c, d]);
    expect(multi.distinctActions).toBe(2);
    expect(multi.singleAction).toBe(false);
  });

  it("rattache le constat de service plus large sans en faire un doublon du Top", () => {
    const page = opp({ page_id: "p", target_service_slug: "transport-vrac", target_city_slug: "beaupre", score: 90 });
    const groupSvc = opp({ type: "group_service", category: "groupe", target_service_slug: "transport-vrac", title: "Service transport-vrac sous-performant", score: 55 });
    const groups = buildActionGroups([page, groupSvc]);
    expect(groups).toHaveLength(2);
    const main = groups.find((g) => g.primary.id === page.id)!;
    expect(main.relatedGroups.map((r) => r.id)).toContain(groupSvc.id);
  });

  it("le Top 10 contient des actions distinctes, pas des lignes répétées", () => {
    const many: Opportunity[] = [];
    for (let i = 0; i < 12; i++) {
      many.push(opp({ page_id: `p${i}`, target_service_slug: "livraison", target_city_slug: `ville-${i}`, score: 90 - i }));
      many.push(opp({ type: "local_potential", category: "territoire_service", target_service_slug: "livraison", target_city_slug: `ville-${i}`, score: 80 - i }));
    }
    const top = topActions(many, 10);
    expect(top).toHaveLength(10);
    expect(new Set(top.map((g) => g.key)).size).toBe(10);
    expect(top[0].score).toBeGreaterThanOrEqual(top[9].score);
  });

  it("aucune opportunité n'est perdue par le regroupement", () => {
    const list = [
      opp({ page_id: "a", target_service_slug: "remblai", target_city_slug: "beaupre" }),
      opp({ page_id: "b", target_service_slug: "remblai", target_city_slug: "beaupre" }),
      opp({ type: "not_indexed_bulk", category: "indexation", title: "Constat global" }),
    ];
    const total = buildActionGroups(list).reduce((n, g) => n + g.members.length, 0);
    expect(total).toBe(list.length);
  });

  it("une opportunité sans territoire ni service reste une action isolée", () => {
    const a = opp({ type: "not_indexed_bulk", category: "indexation", title: "Constat global" });
    expect(actionKeyOf(a)).toBe(`opp:${a.id}`);
    expect(buildActionGroups([a])[0].kind).toBe("technique");
  });

  it("normalise les libellés d'action équivalents", () => {
    expect(normalizeAction("Améliorer  la Méta-description !")).toBe(normalizeAction("ameliorer la meta description"));
  });
});

describe("Qualité des titres d'action du Top 10", () => {
  const VERBES = /^(Optimiser|Renforcer|Corriger|Vérifier|Améliorer|Harmoniser)\b/;

  it("un constat de service ne s'affiche jamais comme un simple nom de service", () => {
    const g = buildActionGroups([
      opp({ type: "group_service", category: "groupe", title: "Le service excavation sous-performe en clics",
        target_service_slug: "excavation", score: 77, data: { pages: 12, impressions: 900, clicks: 6 } }),
    ])[0];
    expect(g.kind).toBe("service");
    expect(g.title).toBe("Optimiser les titres et metas des pages Excavation");
    expect(g.title.toLowerCase()).not.toBe("excavation");
    expect(VERBES.test(g.title)).toBe(true);
  });

  it("un constat de territoire ne s'affiche jamais comme un simple nom de ville", () => {
    const g = buildActionGroups([
      opp({ type: "group_territory", category: "groupe", title: "Lévis", target_city_slug: "levis", score: 66 }),
    ])[0];
    expect(g.title).toBe("Optimiser les pages du territoire Levis");
    expect(VERBES.test(g.title)).toBe(true);
  });

  it("une page conserve sa cible réelle dans le titre d'action", () => {
    const g = buildActionGroups([
      opp({ type: "converting_page", category: "conversion", page_id: "p9",
        title: "Renforcer — Livraison de pierre à Portneuf | Vrac Québec",
        target_service_slug: "livraison-pierre", target_city_slug: "portneuf",
        score: 74, data: { impressions: 300, clicks: 4, conversions: 2 } }),
    ])[0];
    expect(g.kind).toBe("page");
    expect(g.title).toContain("Livraison de pierre à Portneuf");
    expect(g.title).not.toContain("|");
    expect(VERBES.test(g.title)).toBe(true);
  });

  it("chaque action du top possède titre, intervention, raison et données sources", () => {
    const list = [
      opp({ type: "group_service", target_service_slug: "excavation", title: "excavation", score: 77 }),
      opp({ type: "ctr_top10", page_id: "p2", title: "Nivellement à La Cité-Limoilou",
        target_service_slug: "nivellement", target_city_slug: "la-cite-limoilou", score: 72,
        data: { impressions: 210, clicks: 2, position: 7.1 } }),
      opp({ type: "local_potential", category: "territoire_service", title: "Renforcer nivellement",
        target_service_slug: "nivellement", target_city_slug: "la-cite-limoilou", score: 70 }),
    ];
    for (const g of topActions(list, 10)) {
      expect(VERBES.test(g.title)).toBe(true);
      expect(g.actionLabel.length).toBeGreaterThan(5);
      expect(g.reason).toBeTruthy();
      expect(g.signalTitle).toBeTruthy();
      expect(["page", "territoire_service", "service", "groupe", "technique"]).toContain(g.kind);
    }
  });

  it("aucune donnée n'est inventée lorsque les métriques sont absentes", () => {
    const g = buildActionGroups([opp({ type: "low_qa", category: "technique", page_id: "p3", title: "Page X", data: {} })])[0];
    expect(g.impressions).toBeNull();
    expect(g.clicks).toBeNull();
    expect(g.ctr).toBeNull();
    expect(g.position).toBeNull();
    expect(g.conversions).toBeNull();
  });

  it("à score égal, l'action liée à une conversion réelle passe devant", () => {
    const sansConv = opp({ type: "group_service", target_service_slug: "livraison", title: "livraison", score: 60 });
    const avecConv = opp({ type: "converting_page", category: "conversion", page_id: "p4", title: "Page convertissante",
      target_service_slug: "remblai", target_city_slug: "levis", score: 60, data: { conversions: 3 } });
    const top = topActions([sansConv, avecConv], 10);
    expect(top[0].primary.id).toBe(avecConv.id);
  });

  it("les signaux originaux restent tous accessibles après regroupement", () => {
    const a = opp({ page_id: "p5", target_service_slug: "remblai", target_city_slug: "beaupre", score: 50 });
    const b = opp({ type: "local_potential", target_service_slug: "remblai", target_city_slug: "beaupre", score: 40 });
    const groups = buildActionGroups([a, b]);
    const ids = groups.flatMap((g) => g.members.map((m) => m.id));
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});
