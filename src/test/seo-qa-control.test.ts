import { describe, it, expect } from "vitest";
import {
  runQaControl, summarizeQaControl, mergeResults, duplicateTitles, publishableTotal,
  loose, stripHtml, topicOf, topicLabelOf, QA_CONTROL_RULES, QA_VERDICT_LABEL,
  type QaControlPage,
} from "@/lib/seo/qaControl";

const CONTENT = (extra = "") =>
  `<h2>Gravier à Beaumont</h2><p>Le gravier livré à Beaumont pour vos chantiers.</p>` +
  `<a href="/beaumont">Beaumont</a><a href="/gravier">Gravier</a>` +
  `<a href="/soumission">Obtenir une soumission</a>${extra}`;

function page(over: Partial<QaControlPage> = {}): QaControlPage {
  return {
    slug: "gravier-beaumont",
    city_slug: "beaumont",
    material_slug: "gravier",
    title: "Gravier à Beaumont",
    meta_title: "Gravier à Beaumont | Livraison rapide Vrac Québec",
    meta_description:
      "Trouvez du gravier à Beaumont pour vos chantiers : livraison planifiée, volumes adaptés et accompagnement par Vrac Québec pour chaque projet.",
    content_html: CONTENT(),
    word_count: 850,
    internal_link_count: 3,
    internal_links: [{ slug: "beaumont" }],
    ...over,
  };
}

describe("contrôle qualité des pages à vérifier", () => {
  it("1. une page conforme est prête à publier avec un score de 100", () => {
    const r = runQaControl(page());
    expect(r.verdict).toBe("ready");
    expect(r.score).toBe(100);
    expect(r.issues).toHaveLength(0);
  });

  it("2. meta title trop court = erreur bloquante", () => {
    const r = runQaControl(page({ meta_title: "Gravier" }));
    expect(r.verdict).toBe("blocked");
    expect(r.issues[0].key).toBe("meta_title");
  });

  it("3. meta title trop long = à corriger", () => {
    const r = runQaControl(page({ meta_title: "G".repeat(80) }));
    expect(r.verdict).toBe("fix");
    expect(r.issues.some((i) => i.key === "meta_title_long")).toBe(true);
  });

  it("4. meta description absente = erreur bloquante", () => {
    const r = runQaControl(page({ meta_description: "" }));
    expect(r.verdict).toBe("blocked");
    expect(r.issues.some((i) => i.key === "meta_description")).toBe(true);
  });

  it("5. meta description trop longue = à corriger", () => {
    const r = runQaControl(page({ meta_description: "a".repeat(220) }));
    expect(r.issues.find((i) => i.key === "meta_description_long")?.expected)
      .toContain(String(QA_CONTROL_RULES.metaDescriptionMax));
  });

  it("6. aucun H1 = erreur bloquante", () => {
    const r = runQaControl(page({ title: "", h1: "" }));
    expect(r.verdict).toBe("blocked");
    expect(r.issues.some((i) => i.key === "h1")).toBe(true);
  });

  it("7. plusieurs H1 dans le contenu = à corriger", () => {
    const r = runQaControl(page({ content_html: CONTENT("<h1>A</h1><h1>B</h1>") }));
    expect(r.issues.some((i) => i.key === "h1_multiple")).toBe(true);
  });

  it("8. contenu quasi vide = erreur bloquante", () => {
    const r = runQaControl(page({ word_count: 40 }));
    expect(r.verdict).toBe("blocked");
  });

  it("9. contenu court = à corriger", () => {
    const r = runQaControl(page({ word_count: 220 }));
    expect(r.verdict).toBe("fix");
    expect(r.issues.some((i) => i.key === "content_short")).toBe(true);
  });

  it("10. liens internes insuffisants = à corriger", () => {
    const r = runQaControl(page({ internal_link_count: 0, internal_links: [] }));
    expect(r.issues.some((i) => i.key === "internal_links")).toBe(true);
  });

  it("11. absence de CTA réel = à corriger", () => {
    const r = runQaControl(page({ content_html: "<p>Gravier à Beaumont</p><a href=\"/beaumont\">x</a>" }));
    expect(r.issues.some((i) => i.key === "cta")).toBe(true);
  });

  it("12. municipalité absente du titre = à corriger", () => {
    const r = runQaControl(page({ title: "Gravier", meta_title: "Gravier de qualité pour tous vos chantiers" }));
    expect(r.issues.some((i) => i.key === "city_in_title")).toBe(true);
  });

  it("13. matériau absent du contenu = à corriger", () => {
    const r = runQaControl(page({
      content_html: "<p>Livraison à Beaumont.</p><a href=\"/soumission\">Soumission</a><a href=\"/beaumont\">x</a>",
    }));
    expect(r.issues.some((i) => i.key === "topic_in_body")).toBe(true);
  });

  it("14. chiffre commercial détecté = à corriger", () => {
    const r = runQaControl(page({ content_html: CONTENT("<p>Prix : 250 $ la tonne.</p>") }));
    expect(r.issues.some((i) => i.key === "invented")).toBe(true);
  });

  it("15. doublon de titre = erreur bloquante", () => {
    const r = runQaControl(page(), { duplicateTitle: true });
    expect(r.verdict).toBe("blocked");
  });

  it("16. les accents et traits d'union ne créent pas de faux problème", () => {
    const r = runQaControl(page({
      slug: "gravier-cap-saint-ignace",
      city_slug: "cap-saint-ignace",
      title: "Gravier à Cap-Saint-Ignace",
      meta_title: "Gravier à Cap-Saint-Ignace | Livraison Vrac Québec",
      content_html: "<p>Gravier livré à Cap-Saint-Ignace.</p><a href=\"/soumission\">Soumission</a>",
    }));
    expect(r.issues.some((i) => i.key.startsWith("city"))).toBe(false);
  });

  it("17. le score baisse selon la gravité", () => {
    const fix = runQaControl(page({ word_count: 220 }));
    const blocked = runQaControl(page({ meta_title: "x" }));
    expect(fix.score).toBe(100 - QA_CONTROL_RULES.penalty.fix);
    expect(blocked.score).toBe(100 - QA_CONTROL_RULES.penalty.blocker);
  });

  it("18. chaque problème expose valeur, règle et action", () => {
    const r = runQaControl(page({ internal_link_count: 0, internal_links: [] }));
    const i = r.issues[0];
    expect(i.actual).not.toBe("");
    expect(i.expected).not.toBe("");
    expect(i.action).not.toBe("");
  });

  it("19. le contrôle est purement déterministe (aucune écriture)", () => {
    const p = page();
    const a = runQaControl(p);
    const b = runQaControl(p);
    expect(b.issues).toEqual(a.issues);
    expect(JSON.stringify(p)).toEqual(JSON.stringify(page()));
  });

  it("20. relancer le contrôle ne crée aucun doublon", () => {
    const first = [runQaControl(page())];
    const again = [runQaControl(page())];
    expect(mergeResults(first, again)).toHaveLength(1);
  });

  it("21. le résumé et la progression reflètent les verdicts", () => {
    const res = [runQaControl(page()), runQaControl(page({ slug: "b", word_count: 220 }))];
    const s = summarizeQaControl(res, 4);
    expect(s).toMatchObject({ checked: 2, ready: 1, fix: 1, blocked: 0, remaining: 2, progress: 50 });
  });

  it("22. les doublons de titre sont détectés sur l'ensemble des pages", () => {
    const d = duplicateTitles([{ meta_title: "A" }, { meta_title: "A" }, { meta_title: "B" }]);
    expect([...d]).toEqual(["A"]);
  });

  it("23. le total publiable additionne les prêts et les nouveaux prêts", () => {
    expect(publishableTotal(428, 74)).toBe(502);
  });

  it("24. utilitaires : nettoyage HTML, normalisation, type de page", () => {
    expect(stripHtml("<p>Bonjour  <b>vous</b></p>")).toBe("Bonjour vous");
    expect(loose("Cap-Saint-Ignace")).toBe("cap saint ignace");
    expect(topicOf({ slug: "x", city_slug: "y" })).toBe("hub");
    expect(QA_VERDICT_LABEL.ready).toBe("Prête à publier");
  });

  it("25. normalise les ligatures, accents, apostrophes, casse et tirets", () => {
    expect(loose("Notre-Dame-du-Sacré-Cœur-d’Issoudun"))
      .toBe("notre dame du sacre coeur d issoudun");
    expect(loose("CŒUR")).toBe("coeur");
  });

  it("26. reconnaît une municipalité avec Cœur sans modifier son titre", () => {
    const r = runQaControl(page({
      city_slug: "notre-dame-du-sacre-coeur-d-issoudun",
      title: "Gravier à Notre-Dame-du-Sacré-Cœur-d’Issoudun",
      meta_title: "Gravier à Notre-Dame-du-Sacré-Cœur-d’Issoudun | Vrac Québec",
      content_html: CONTENT().replaceAll("Beaumont", "Notre-Dame-du-Sacré-Cœur-d’Issoudun"),
    }));
    expect(r.issues.some((i) => i.key.startsWith("city_"))).toBe(false);
  });

  it("27. utilise le libellé canonique Point de dépôt pour le service", () => {
    const p = page({
      material_slug: null,
      service_slug: "recherche-point-de-depot",
      content_html: CONTENT("<p>Un point de dépôt est disponible selon les conditions applicables.</p>"),
    });
    expect(topicLabelOf(p)).toBe("point de dépôt");
    expect(runQaControl(p).issues.some((i) => i.key === "topic_in_body")).toBe(false);
  });

  it("28. conserve les contrôles de sécurité après normalisation", () => {
    const r = runQaControl(page({
      city_slug: "notre-dame-du-sacre-coeur-d-issoudun",
      title: "Titre sans municipalité",
      meta_title: "Titre suffisamment long mais sans la municipalité officielle",
      content_html: "<h1>A</h1><h1>B</h1><p>Un chiffre non vérifié : 15 %.</p>",
      internal_link_count: 0,
      internal_links: [],
      word_count: 200,
    }), { duplicateTitle: true });
    expect(r.issues.map((i) => i.key)).toEqual(expect.arrayContaining([
      "h1_multiple", "content_short", "internal_links", "cta", "city_in_title",
      "city_in_body", "topic_in_body", "invented", "duplicate",
    ]));
  });
});
