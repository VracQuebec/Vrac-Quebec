import { describe, it, expect } from "vitest";
import { materialFicheHref } from "@/lib/catalogue/material-links";
const fiches = new Set(["pierre-concassee-0-3-4","pierre-concassee-3-4-net","poussiere-de-pierre","sable","sable-a-compaction","terre-tamisee"]);
describe("liens matériaux", () => {
  it("gravier 0-3/4 mène à la pierre concassée 0-3/4", () => expect(materialFicheHref("gravier-0-3-4", fiches)).toBe("/materiaux/pierre-concassee-0-3-4"));
  it("pierre nette mène à la 3/4 net", () => expect(materialFicheHref("pierre-nette", fiches)).toBe("/materiaux/pierre-concassee-3-4-net"));
  it("aucun lien sans fiche existante", () => expect(materialFicheHref("beton", fiches)).toBeNull());
  it("Terre contaminée ne mène jamais à la terre tamisée", () => expect(materialFicheHref("terre-contaminee", fiches)).toBeNull());
});
