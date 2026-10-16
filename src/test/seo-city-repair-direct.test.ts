import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { repairCity, planRepair } from "@/lib/seo/cityRepair";

const src = readFileSync("src/components/seo/PipelineControlCenter.tsx", "utf8");

describe("« Régénérer les erreurs » d'une ville : lancement direct", () => {
  it("le bouton lance le traitement au lieu d'ouvrir la fenêtre de sélection", () => {
    expect(src).not.toContain('openWb(c, "repair")');
    expect(src).toContain("onClick={() => startCityRepair(c)}");
  });
  it("un brouillon en erreur est envoyé; une page en ligne est protégée", async () => {
    const calls: string[] = [];
    const slots = [
      { key: "a|terre|", label: "Terre", gen_state: "invalid", has_page: true, published: false, noindex_volontaire: false, issues: ["Contenu insuffisant"], attempts: 0, material_slug: "terre", service_slug: null },
      { key: "a|sable|", label: "Sable", gen_state: "invalid", has_page: true, published: true, noindex_volontaire: false, issues: ["Contenu insuffisant"], attempts: 0, material_slug: "sable", service_slug: null },
    ] as never;
    expect(planRepair(slots).targets.map((t) => t.label)).toEqual(["Terre"]);
    const o = await repairCity(slots, async (s) => { calls.push(s.label); });
    expect(calls).toEqual(["Terre"]);
    expect(o.done).toEqual(["Terre"]);
  });
  it("un échec serveur est rapporté comme échec", async () => {
    const slots = [{ key: "a|terre|", label: "Terre", gen_state: "invalid", has_page: true, published: false, noindex_volontaire: false, issues: ["x"], attempts: 0, material_slug: "terre", service_slug: null }] as never;
    const o = await repairCity(slots, async () => ({ error: "502" }));
    expect(o.failed).toEqual([{ label: "Terre", error: "502" }]);
  });
});
