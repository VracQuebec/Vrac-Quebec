import { describe, it, expect } from "vitest";
import { buildWorkbench, rowsForAction, emptyReason, type WbDraft } from "@/lib/seo/cityWorkbench";

const draft = (slug: string, m: string, extra: Partial<WbDraft> = {}): WbDraft => ({
  id: `id-${slug}`, slug, status: "draft", noindex: true, noindex_volontaire: false, updated_at: "t",
  meta_title: "Sable à Lantier : livraison en vrac", meta_description: "Sable en vrac à Lantier : usages, quantités et conseils pour bien planifier votre projet.",
  h1: "Sable à Lantier", title: "Sable à Lantier", content_html: "<p>" + "mot ".repeat(400) + "</p>", word_count: 400, internal_link_count: 3, qa_score: 95, qa_fresh: true,
  material_slug: m, service_slug: null, ...extra,
});
const items = [
  { kind: "hub" as const, slug: null, label: "Page ville", status: "covered" },
  { kind: "material" as const, slug: "remblai", label: "Remblai", status: "not_requested" },
  { kind: "material" as const, slug: "sable", label: "Sable", status: "not_requested" },
  { kind: "material" as const, slug: "neige", label: "Neige", status: "not_requested" },
];
const cat = { items: [], queueKeys: new Set<string>(), draftErrorKeys: new Set<string>(), pendingKeys: new Set<string>(), stalledKeys: new Set<string>(), failedKeys: new Set(["material|remblai"]), excluded: new Set(["material|neige"]) };
const build = (opts: { decisions?: Record<string, "confirmee" | "exclue">; drafts?: WbDraft[] } = {}) => buildWorkbench({
  cityName: "Lantier", items, cat: cat as never, excluded: new Set(["material|neige"]), slugCopies: new Map(),
  drafts: opts.drafts ?? [], published: [{ slug: "lantier", noindex: false, material_slug: null, service_slug: null }],
  problems: [{ kind: "material", material_slug: "remblai", service_slug: null, gen_state: "error", issues: null, task_attempts: 1, task_error: "Disponibilité inconnue — décision explicite requise avant toute génération." }],
  decisionOf: (_k, s) => (s ? opts.decisions?.[s] : undefined),
});

describe("fenêtre de ville — sélection et raisons des actions", () => {
  it("tâche refusée (disponibilité inconnue) : pas une erreur de génération, à décider", () => {
    const rows = build();
    const r = rows.find((x) => x.slug === "remblai")!;
    expect(r.action).toBe("decide");
    expect(r.problems.join(" ")).toMatch(/Tâche refusée par la protection/);
    expect(rowsForAction(rows, "repair")).toHaveLength(0);
    expect(emptyReason(rows, "repair")).toMatch(/Aucune page réellement en erreur.*\(0\)/);
    expect(emptyReason(rows, "repair")).toMatch(/1 tâche\(s\) refusée\(s\)/);
  });
  it("décider : seules les combinaisons inconnues non publiées, jamais les exclues", () => {
    const keys = rowsForAction(build(), "decide").map((r) => r.slug);
    expect(keys.sort()).toEqual(["remblai", "sable"]);
  });
  it("après confirmation, la combinaison devient sélectionnable pour Générer", () => {
    expect(rowsForAction(build(), "generate")).toHaveLength(0);
    expect(rowsForAction(build({ decisions: { sable: "confirmee" } }), "generate").map((r) => r.slug)).toEqual(["sable"]);
  });
  it("exclue : jamais générable, même avec une décision « confirmée » ailleurs", () => {
    expect(rowsForAction(build({ decisions: { sable: "exclue" } }), "generate")).toHaveLength(0);
  });
  it("publier sans brouillon : raison explicite", () => {
    expect(emptyReason(build(), "publish")).toMatch(/Aucun brouillon dans cette ville/);
  });
  it("publier : brouillon sous 90 non admissible, raison chiffrée", () => {
    const rows = build({ decisions: { sable: "confirmee" }, drafts: [draft("sable-lantier", "sable", { qa_score: 85 })] });
    expect(rowsForAction(rows, "publish")).toHaveLength(0);
    expect(emptyReason(rows, "publish")).toMatch(/1 brouillon\(s\) bloqué\(s\)/);
  });
  it("publier : brouillon confirmé à 90+ admissible", () => {
    const rows = build({ decisions: { sable: "confirmee" }, drafts: [draft("sable-lantier", "sable")] });
    expect(rowsForAction(rows, "publish").map((r) => r.slug)).toEqual(["sable"]);
  });
});
