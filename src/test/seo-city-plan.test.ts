import { describe, it, expect } from "vitest";
import { cityPlan, generationTargets, slotKey, STALE_PENDING_MS } from "@/lib/seo/cityActions";

const NOW = Date.parse("2026-10-09T19:00:00Z");
const base = { slug: "v", unpublished: 0, drafts: 0, publishedKeys: new Set<string>(), runningHere: false, lockedByOther: false, globalRunActive: false, hasGenRow: true, now: NOW };
const row = (o: Record<string, unknown>) => ({ city_slug: "v", kind: "material", material_slug: "sable", service_slug: null, gen_state: "missing", issues: [], ...o }) as never;

describe("plan d'action d'une ville", () => {
  it("une page manquante active « Générer »", () => {
    const p = cityPlan({ ...base, problems: [row({})] });
    expect(p.generate).toMatchObject({ enabled: true, count: 1 });
  });
  it("aucune page manquante : bouton désactivé avec raison", () => {
    expect(cityPlan({ ...base, problems: [] }).generate.reason).toMatch(/existent déjà/);
  });
  it("une autre ville en cours bloque la génération", () => {
    expect(cityPlan({ ...base, lockedByOther: true, problems: [row({})] }).generate.enabled).toBe(false);
  });
  it("une tâche en file récente n'est pas relancée; interrompue depuis plus de 15 min, elle l'est", () => {
    const recent = row({ gen_state: "pending", task_updated_at: new Date(NOW - 60_000).toISOString() });
    const old = row({ gen_state: "pending", material_slug: "gravier", task_updated_at: new Date(NOW - STALE_PENDING_MS - 1).toISOString() });
    const p = cityPlan({ ...base, problems: [recent, old] });
    expect(p.pending).toBe(1);
    expect(p.stalled).toBe(1);
    expect(p.generate.count).toBe(1);
  });
  it("pipeline global actif : une tâche en file n'est jamais considérée interrompue", () => {
    const old = row({ gen_state: "pending", task_updated_at: new Date(NOW - 3_600_000).toISOString() });
    const p = cityPlan({ ...base, globalRunActive: true, problems: [old] });
    expect(p.stalled).toBe(0);
    expect(p.generate.enabled).toBe(false);
  });
  it("page publiée non indexée volontairement : ni erreur, ni régénération", () => {
    const p = cityPlan({ ...base, problems: [row({ gen_state: "invalid", issues: ["Publiée mais noindex"] })] });
    expect(p.noindex).toBe(1);
    expect(p.invalidDrafts + p.invalidPublished).toBe(0);
    expect(p.retry.enabled).toBe(false);
  });
  it("erreur sur une page en ligne : protégée, régénération désactivée avec raison", () => {
    const p = cityPlan({ ...base, publishedKeys: new Set([slotKey("material", "sable", null)]), problems: [row({ gen_state: "invalid", issues: ["Contenu insuffisant"] })] });
    expect(p.invalidPublished).toBe(1);
    expect(p.retry.enabled).toBe(false);
    expect(p.retry.reason).toMatch(/protégées/);
  });
  it("erreur sur un brouillon : régénération activée", () => {
    const p = cityPlan({ ...base, problems: [row({ gen_state: "invalid", issues: ["Contenu insuffisant"] })] });
    expect(p.retry).toMatchObject({ enabled: true, count: 1 });
  });
  it("brouillons qui échouent au contrôle : publication désactivée avec raison", () => {
    const p = cityPlan({ ...base, drafts: 2, unpublished: 0, problems: [] });
    expect(p.publish.reason).toMatch(/contrôles de qualité/);
  });
});

describe("cibles de génération", () => {
  const s = (state: string, m: string) => ({ state, kind: "material", material_slug: m, service_slug: null });
  it("ne cible jamais deux fois le même emplacement ni une page existante", () => {
    const t = generationTargets([s("missing", "sable"), s("missing", "sable"), s("published", "gravier"), s("draft", "terre"), s("error", "pierre")], false);
    expect(t.map((x) => x.material_slug)).toEqual(["sable", "pierre"]);
  });
  it("seconde exécution sur une ville complète : aucune cible", () => {
    expect(generationTargets([s("published", "sable"), s("draft", "gravier")], true)).toEqual([]);
  });
  it("reprise : tâches interrompues incluses seulement si autorisé", () => {
    expect(generationTargets([s("pending", "sable")], false)).toEqual([]);
    expect(generationTargets([s("pending", "sable")], true)).toHaveLength(1);
  });
});
