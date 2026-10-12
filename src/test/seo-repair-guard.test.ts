import { describe, it, expect } from "vitest";
import { selectRepairTargets, MAX_ATTEMPTS, lockKey } from "../../prepared/seo-generator/_shared/seo-repair-guard";
import { repairCity, type RepairSlot } from "@/lib/seo/cityRepair";

const slot = (p: Partial<RepairSlot>): RepairSlot => ({
  key: "v|remblai|", label: "Remblai", gen_state: "invalid", has_page: true, published: false,
  noindex_volontaire: false, issues: ["Contenu insuffisant"], attempts: 0, material_slug: "remblai", service_slug: null, ...p,
});

describe("Régénérer les erreurs : sélection stricte", () => {
  it("vise un brouillon réellement en erreur", () => {
    expect(selectRepairTargets([slot({})]).targets).toHaveLength(1);
  });
  it("ne génère jamais une page manquante", () => {
    const r = selectRepairTargets([slot({ gen_state: "missing", has_page: false }), slot({ key: "v|sable|", gen_state: "error", has_page: false })]);
    expect(r.targets).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/Générer/);
  });
  it("ignore une page publiée protégée", () => {
    expect(selectRepairTargets([slot({ published: true })]).skipped[0].reason).toMatch(/en ligne protégée/);
  });
  it("ignore un noindex volontaire", () => {
    expect(selectRepairTargets([slot({ noindex_volontaire: true })]).skipped[0].reason).toMatch(/Noindex volontaire/);
  });
  it("limite réelle de 3 tentatives", () => {
    expect(MAX_ATTEMPTS).toBe(3);
    expect(selectRepairTargets([slot({ attempts: 2 })]).targets).toHaveLength(1);
    expect(selectRepairTargets([slot({ attempts: 3 })]).skipped[0].reason).toMatch(/Limite de 3 tentatives/);
  });
  it("aucun doublon de combinaison dans une relance", () => {
    expect(selectRepairTargets([slot({}), slot({})]).targets).toHaveLength(1);
  });
  it("clé de verrou identique pour la même combinaison", () => {
    expect(lockKey("v", "remblai", null)).toBe("v|remblai|");
  });
});

describe("repairCity (serveur simulé, aucune IA)", () => {
  it("n'appelle le serveur que pour les cibles et rapporte les ignorées", async () => {
    const calls: string[] = [];
    const o = await repairCity([slot({}), slot({ key: "v|sable|", gen_state: "missing", has_page: false }), slot({ key: "v|roche|", attempts: 3 })],
      async (s) => { calls.push(s.key); });
    expect(calls).toEqual(["v|remblai|"]);
    expect(o.done).toEqual(["Remblai"]);
    expect(o.skipped).toHaveLength(2);
  });
  it("sauvegarde échouée côté serveur : échec rapporté, rien déclaré fait", async () => {
    const o = await repairCity([slot({})], async () => ({ error: "Sauvegarde impossible — brouillon non modifié" }));
    expect(o.done).toEqual([]);
    expect(o.failed[0].error).toMatch(/Sauvegarde impossible/);
  });
  it("erreur réseau : échec rapporté, poursuite des autres pages", async () => {
    const o = await repairCity([slot({}), slot({ key: "v|sable|", label: "Sable" })],
      async (s) => { if (s.key === "v|remblai|") throw new Error("réseau"); });
    expect(o.failed[0].label).toBe("Remblai");
    expect(o.done).toEqual(["Sable"]);
  });
  it("seconde exécution après réussite (plus en erreur) : aucun appel", async () => {
    let n = 0;
    await repairCity([slot({ gen_state: "ok" })], async () => { n++; });
    expect(n).toBe(0);
  });
});
