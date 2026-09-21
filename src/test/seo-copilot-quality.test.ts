// Qualité des propositions du Copilote SEO : matériau conservé, noms officiels
// du référentiel, aucun bloc de contenu répété, aucune affirmation inventée.
import { describe, it, expect } from "vitest";
import {
  suggestMeta, validateMeta, buildContentProposal, contentBlockSignature,
  suggestCta, suggestInternalLinks, ctaDestinations, officialCity, hasCarrierCoverage,
  TITLE_MAX, type EditablePage, type SeoReferential,
} from "@/lib/seo/workflow";

const REF: SeoReferential = {
  cities: {
    "levis": "Lévis",
    "lac-beauport": "Lac-Beauport",
    "saint-raymond": "Saint-Raymond",
    "la-cite-limoilou": "La Cité-Limoilou",
    "sainte-foy-sillery-cap-rouge": "Sainte-Foy–Sillery–Cap-Rouge",
    "sainte-anne-de-beaupre": "Sainte-Anne-de-Beaupré",
    "l-ancienne-lorette": "L'Ancienne-Lorette",
  },
  services: { excavation: "Excavation", nivellement: "Nivellement", "transport-en-vrac": "Transport en vrac" },
  materials: { "pierre-concassee": "Pierre concassée", "mg-20": "MG-20", "gravier-0-3-4": "Gravier 0-3/4" },
  coverage: {},
};

const page = (over: Partial<EditablePage> = {}): EditablePage => ({
  id: "p1", slug: "pierre-concassee-levis", url: "/pierre-concassee-levis",
  title: "Ancien titre", meta_title: null, meta_description: "ancienne meta",
  city_slug: "levis", service_slug: null, material_slug: "pierre-concassee",
  status: "published", content_html: "<p>Contenu existant.</p>", intro: "",
  ...over,
});

describe("A. matériau conservé dans les propositions", () => {
  it("le titre d'une page matériau × territoire contient le matériau réel", () => {
    const s = suggestMeta(page(), REF);
    expect(s.title).toBe("Pierre concassée à Lévis | Vrac Québec");
    expect(s.title.length).toBeLessThanOrEqual(TITLE_MAX);
  });
  it("MG-20 et Gravier 0-3/4 restent dans le titre", () => {
    expect(suggestMeta(page({ slug: "mg-20-lac-beauport", material_slug: "mg-20", city_slug: "lac-beauport" }), REF).title)
      .toBe("MG-20 à Lac-Beauport | Vrac Québec");
    expect(suggestMeta(page({ slug: "gravier-0-3-4-saint-raymond", material_slug: "gravier-0-3-4", city_slug: "saint-raymond" }), REF).title)
      .toContain("Gravier 0-3/4");
  });
  it("la meta d'une page matériau conserve matériau, territoire et appel à l'action", () => {
    const m = suggestMeta(page(), REF).meta_description;
    expect(m).toContain("Pierre concassée");
    expect(m).toContain("Lévis");
    expect(m.toLowerCase()).toContain("soumission");
  });
  it("le titre n'est jamais réduit au seul territoire", () => {
    expect(suggestMeta(page(), REF).title).not.toBe("Lévis | Vrac Québec");
  });
  it("un matériau absent du référentiel n'est jamais inventé", () => {
    const s = suggestMeta(page({ material_slug: "materiau-inconnu" }), REF);
    expect(s.notes?.join(" ")).toContain("absent du référentiel");
    expect(s.title).not.toContain("Materiau");
  });
});

describe("A bis. casse officielle des matériaux", () => {
  it("le CTA et le contenu conservent la casse du référentiel (MG-20)", () => {
    const p = page({ material_slug: "mg-20", city_slug: "lac-beauport" });
    expect(suggestCta(p, REF).text).toContain("MG-20");
    expect(buildContentProposal(p, REF).draft.content_html).toContain("MG-20");
  });
});

describe("B. anti-doublon des titres", () => {
  it("deux pages matériau × territoire différentes ne reçoivent pas le même titre", () => {
    const a = suggestMeta(page(), REF).title;
    const b = suggestMeta(page({ material_slug: "mg-20", city_slug: "lac-beauport" }), REF).title;
    expect(a).not.toBe(b);
  });
  it("un titre déjà utilisé par une autre page existante est refusé", () => {
    const d = suggestMeta(page(), REF);
    const issues = validateMeta(d, ["Pierre concassée à Lévis | Vrac Québec"]);
    expect(issues.some((i) => i.message.includes("déjà utilisé"))).toBe(true);
  });
  it("le contrôle couvre le lot, le matériau et le territoire", () => {
    const d = suggestMeta(page(), REF);
    expect(validateMeta(d, ["Autre titre", "Encore un autre"])).toEqual([]);
  });
});

describe("C/D/E. noms officiels du référentiel territorial", () => {
  it("le nom affiché provient du référentiel, jamais du slug", () => {
    expect(officialCity("sainte-anne-de-beaupre", REF)).toBe("Sainte-Anne-de-Beaupré");
    expect(officialCity("ville-absente", REF)).toBeNull();
  });
  it("les accents sont conservés : Sainte-Anne-de-Beaupré", () => {
    const t = suggestMeta(page({ material_slug: null, service_slug: "transport-en-vrac", city_slug: "sainte-anne-de-beaupre" }), REF).title;
    expect(t).toContain("Sainte-Anne-de-Beaupré");
    expect(t).not.toContain("Sainte Anne de Beaupre");
  });
  it("les apostrophes sont conservées : L'Ancienne-Lorette", () => {
    const t = suggestMeta(page({ material_slug: null, service_slug: "excavation", city_slug: "l-ancienne-lorette" }), REF).title;
    expect(t).toContain("L'Ancienne-Lorette");
  });
  it("les traits d'union composés sont conservés", () => {
    const t = suggestMeta(page({ material_slug: null, service_slug: "nivellement", city_slug: "la-cite-limoilou" }), REF).title;
    expect(t).toContain("La Cité-Limoilou");
    expect(t).not.toContain("la Cite Limoilou");
  });
  it("un territoire absent du référentiel n'est pas reconstruit", () => {
    const s = suggestMeta(page({ city_slug: "ville-fantome" }), REF);
    expect(s.title).not.toContain("Ville Fantome");
    expect(s.notes?.join(" ")).toContain("Territoire");
  });
  it("le CTA et le maillage utilisent aussi le nom officiel", () => {
    expect(suggestCta(page({ material_slug: null, service_slug: "excavation", city_slug: "l-ancienne-lorette" }), REF).text)
      .toContain("L'Ancienne-Lorette");
    const s = suggestInternalLinks(
      page({ material_slug: null, service_slug: "excavation", city_slug: "sainte-anne-de-beaupre" }),
      [{ slug: "nivellement-sainte-anne-de-beaupre", title: "Nivellement", city_slug: "sainte-anne-de-beaupre", service_slug: "nivellement" }],
      12, REF,
    );
    expect(s[0].reason).toContain("Sainte-Anne-de-Beaupré");
    expect(ctaDestinations({ city_slug: "levis" }, REF).some((d) => d.label.includes("Lévis"))).toBe(true);
  });
});

describe("F. contenu : aucun bloc répété sur des dizaines de pages", () => {
  it("un bloc déjà proposé pour le même service n'est pas reproposé", () => {
    const p1 = page({ id: "a", slug: "excavation-levis", material_slug: null, service_slug: "excavation", city_slug: "levis" });
    const p2 = page({ id: "b", slug: "excavation-saint-raymond", material_slug: null, service_slug: "excavation", city_slug: "saint-raymond" });
    const first = buildContentProposal(p1, REF);
    expect(first.additions.length).toBeGreaterThan(0);
    const sigs = first.additions.map((a) => `${contentBlockSignature(a, [REF.cities[p1.city_slug!], REF.services[p1.service_slug!], null])}|${p1.material_slug ?? ""}|${p1.service_slug ?? ""}`);
    const second = buildContentProposal(p2, REF, { peerSignatures: sigs });
    expect(second.additions).toEqual([]);
    expect(second.notes.join(" ")).toContain("déjà proposé");
    expect(second.draft.content_html).toBe(p2.content_html);
  });
  it("aucune proposition de contenu sans donnée spécifique suffisante", () => {
    const { additions, notes } = buildContentProposal(page({ material_slug: null, service_slug: null, city_slug: null }), REF);
    expect(additions).toEqual([]);
    expect(notes.join(" ")).toContain("Information insuffisante");
  });
  it("le contenu existant est toujours conservé", () => {
    const p = page({ material_slug: null, service_slug: "excavation", city_slug: "levis" });
    const { draft } = buildContentProposal(p, REF);
    expect(draft.content_html.startsWith(p.content_html!)).toBe(true);
  });
  it("une section déjà présente n'est pas dupliquée", () => {
    const p = page({ material_slug: null, service_slug: "excavation", city_slug: "levis", content_html: "<h2>Comment ça fonctionne</h2>" });
    const { notes } = buildContentProposal(p, REF);
    expect(notes.join(" ")).toContain("existe déjà");
  });
});

describe("G. couverture transporteur", () => {
  it("aucune affirmation de couverture sans donnée réelle", () => {
    const { draft, notes } = buildContentProposal(page({ material_slug: null, service_slug: "excavation", city_slug: "levis" }), REF);
    expect(draft.content_html).not.toContain("transporteurs partenaires");
    expect(draft.content_html).not.toContain("desservent");
    expect(notes.join(" ")).toContain("Aucune couverture transporteur configurée");
  });
  it("la couverture n'est affirmée que si elle est configurée", () => {
    const ref = { ...REF, coverage: { levis: true } };
    expect(hasCarrierCoverage({ city_slug: "levis", service_slug: "excavation" }, ref)).toBe(true);
    expect(hasCarrierCoverage({ city_slug: "saint-raymond", service_slug: "excavation" }, ref)).toBe(false);
    const { draft } = buildContentProposal(page({ material_slug: null, service_slug: "excavation", city_slug: "levis" }), ref);
    expect(draft.content_html).toContain("transporteurs configurés pour ce secteur");
  });
});

describe("H. aucune invention", () => {
  const forbidden = [/\d+\s*\$/, /\bprix\b/i, /\bgratuit\b/i, /\b\d+\s*km\b/i, /\b\d+\s*(h|heures|jours)\b/i,
    /certifi/i, /\b\d+\s*(tonnes|m3|verges)\b/i, /témoign/i, /garanti/i, /meilleur prix/i, /\b\d+\s*%/];
  const pages: EditablePage[] = [
    page(),
    page({ material_slug: "mg-20", city_slug: "lac-beauport" }),
    page({ material_slug: "gravier-0-3-4", city_slug: "saint-raymond" }),
    page({ material_slug: null, service_slug: "nivellement", city_slug: "la-cite-limoilou" }),
    page({ material_slug: null, service_slug: "excavation", city_slug: "sainte-foy-sillery-cap-rouge" }),
    page({ material_slug: null, service_slug: "transport-en-vrac", city_slug: "sainte-anne-de-beaupre" }),
  ];
  it("titres, metas, contenus et CTA ne contiennent aucune donnée inventée", () => {
    for (const p of pages) {
      const meta = suggestMeta(p, REF);
      const content = buildContentProposal(p, REF).draft.content_html;
      const cta = suggestCta(p, REF);
      const all = `${meta.title} ${meta.meta_description} ${content} ${cta.text}`;
      for (const re of forbidden) expect(all, `${p.slug} · ${re}`).not.toMatch(re);
    }
  });
  it("les destinations de CTA restent des parcours réels du site", () => {
    const allowed = ctaDestinations({ city_slug: "levis" }, REF).map((d) => d.href);
    for (const p of pages) expect(allowed).toContain(suggestCta(p, REF).href);
  });
  it("aucun lien interne vers une page absente de la base", () => {
    const s = suggestInternalLinks(page({ material_slug: null, service_slug: "excavation", city_slug: "levis" }), [
      { slug: "nivellement-levis", title: "Nivellement à Lévis", city_slug: "levis", service_slug: "nivellement" },
    ], 12, REF);
    expect(s.map((x) => x.href)).toEqual(["/nivellement-levis"]);
  });
});
